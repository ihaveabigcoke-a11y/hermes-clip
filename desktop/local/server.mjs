import {putImmutableMedia, shareVerifiedMedia, digest, storagePolicy} from '../src/storage-policy.mjs';
import {ThumbnailCache} from './thumbnails.mjs';
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes, timingSafeEqual, createHash} from 'node:crypto';
import {readFile, writeFile, mkdir, rename, unlink, stat} from 'node:fs/promises';
import {resolve, dirname, join, extname, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {Readable} from 'node:stream';
import {localContext} from './runtime.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const sessionCookie = 'product_lab_local_session';
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
function secretMatches(value, expected) {
  const a=Buffer.from(value??''), b=Buffer.from(expected);
  return a.length===b.length && timingSafeEqual(a,b);
}

export async function startLocalServer({root, uiDir=join(here,'../local-dist/ui'), routesPath=join(here,'../local-dist/server/routes.mjs'), seedPath=join(here,'../local-dist/seed.json'), runtimeEnv=async()=>({}), workerStore=null}={}) {
  if (!root) throw Error('Choose a local data directory.');
  await mkdir(root,{recursive:true});
  const db=new DatabaseSync(join(root,'workspace.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
  db.exec('CREATE TABLE IF NOT EXISTS lab_records(owner_id TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,data TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(owner_id,id)); CREATE INDEX IF NOT EXISTS lab_owner_kind ON lab_records(owner_id,kind);');
  const bucketRoot=resolve(root,'media');
  const filePath=key=>{
    if (!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.(png|jpg|webp|mp4|webm)$/.test(key)) throw Error('Invalid local asset key.');
    return join(bucketRoot,...key.split('/'));
  };
  const thumbnails=new ThumbnailCache(root,db,filePath,storagePolicy(workerStore));
  const writes=new Map();
  const localEnv={DB:{
    prepare(sql){const statement=db.prepare(sql);return {bind(...params){return {async first(){return statement.get(...params)??null;},async all(){return {results:statement.all(...params)};},async run(){return {meta:{changes:Number(statement.run(...params).changes)}};}};}};},
    async batch(statements) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
  },BUCKET:{
    async put(key,bytes){
      const hash=digest(new Uint8Array(bytes));
      const previous=writes.get(hash)??Promise.resolve();
      const operation=previous.catch(()=>{}).then(async()=>{
        const assets=db.prepare("SELECT data FROM lab_records WHERE kind='asset'").all().map(row=>JSON.parse(row.data));
        const candidates=assets.filter(asset=>asset.sha256===hash).map(asset=>filePath(asset.key));
        for(const job of workerStore?.jobs()??[])if(job.output?.sha256===hash&&job.output?.path)candidates.push(job.output.path);
        await putImmutableMedia({root,path:filePath(key),bytes:new Uint8Array(bytes),candidates,policy:storagePolicy(workerStore)});
      });
      writes.set(hash,operation);try{await operation;}finally{if(writes.get(hash)===operation)writes.delete(hash);}
    },
    async delete(key){await unlink(filePath(key)).catch(e=>{if(e.code!=='ENOENT')throw e;});},
    async get(key,options){try{const bytes=await readFile(filePath(key)),offset=options?.range?.offset??0,length=options?.range?.length??bytes.length;return {body:bytes.subarray(offset,offset+length)};}catch(e){if(e.code==='ENOENT')return null;throw e;}}
  }};
  // Seed only a completely empty local workspace. Never overwrite user records.
  if (!db.prepare('SELECT 1 FROM lab_records LIMIT 1').get()) {
    try {
      const seed=JSON.parse(await readFile(seedPath,'utf8'));
      for (const asset of seed.media??[]) await localEnv.BUCKET.put(asset.key,Buffer.from(asset.base64,'base64'));
      db.exec('BEGIN IMMEDIATE');
      try {const put=db.prepare('INSERT INTO lab_records VALUES(?,?,?,?,?,?,?)');for(const r of seed.records??[])put.run('local-owner',r.id,r.kind,JSON.stringify(r.data),r.revision,r.updatedAt,r.updatedAt);db.exec('COMMIT');}
      catch(e){db.exec('ROLLBACK');throw e;}
    } catch(e) {if(e.code!=='ENOENT'){db.close();throw e;}}
  }
  // Older bundled workspaces predate asset metadata and checksums. Derive them
  // from the stored bytes so existing references can use the normal worker flow.
  const {inspectMedia} = await import(pathToFileURL(join(dirname(resolve(routesPath)), 'lib/lab/media.mjs')).href);
  const legacyAssets = db.prepare("SELECT owner_id,id,data,revision FROM lab_records WHERE kind='asset'").all();
  for (const row of legacyAssets) {
    const asset = JSON.parse(row.data);
    if (asset.sha256 && (asset.metadata || asset.type === 'video/webm')) continue;
    try {
      const bytes = await readFile(filePath(asset.key));
      const metadata = inspectMedia(bytes, asset.type);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      if (asset.sha256 && asset.sha256 !== sha256) throw Error('Stored checksum does not match file.');
      const data = {...asset, size: bytes.length, metadata, sha256};
      db.prepare("UPDATE lab_records SET data=?,revision=revision+1,updated_at=? WHERE owner_id=? AND id=? AND revision=?")
        .run(JSON.stringify(data), Date.now(), row.owner_id, row.id, row.revision);
    } catch (error) {
      console.warn('Could not inspect legacy asset ' + row.id + ': ' + error.message);
    }
  }
  const {routes}=await import(pathToFileURL(resolve(routesPath)).href);
  const session=randomBytes(32).toString('hex');
  let origin,host;
  const app=createServer(async(incoming,outgoing)=>{
    const send=(status,message)=>{outgoing.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});outgoing.end(message);};
    try {
      if(incoming.headers.host!==host)return send(403,'This workspace accepts its exact loopback host only.');
      const url=new URL(incoming.url,origin);
      if(incoming.headers.origin && incoming.headers.origin!==origin)return send(403,'Cross-origin requests are not allowed.');
      const cookie=(incoming.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith(sessionCookie+'='))?.slice(sessionCookie.length+1);
      if(!secretMatches(cookie,session))return send(401,'Open Product Lab Local from its desktop launcher.');
      if(!['GET','HEAD'].includes(incoming.method)&&incoming.headers.origin!==origin)return send(403,'A local origin is required for writes.');
      if(url.pathname==='/api/local-info')return send(200,'Product Lab Local — SQLite and media on this computer.');
      if(incoming.method==='GET'&&url.searchParams.get('thumbnail')==='1'){
        const match=url.pathname.match(/^\/api\/assets\/([a-zA-Z0-9_-]{1,120})$/);
        if(match){try{const bytes=await thumbnails.get(match[1]);outgoing.writeHead(200,{'Content-Type':'image/jpeg','Content-Length':bytes.length,'Cache-Control':'no-store'});outgoing.end(bytes);}catch{send(404,'Ảnh thu nhỏ chưa sẵn sàng. Mở video gốc để xem.');}return;}
      }
      if(url.pathname.startsWith('/api/')) {
        let route=routes[url.pathname],params;
        const asset=url.pathname.match(/^\/api\/assets\/([a-zA-Z0-9_-]{1,120})$/);
        if(asset){route=routes['/api/assets/:id'];params={params:Promise.resolve({id:asset[1]})};}
        const handler=route?.[incoming.method];if(!handler)return send(404,'Local route not found.');
        const chunks=[];let size=0;
        for await (const chunk of incoming){size+=chunk.length;if(size>28*1024*1024)return send(413,'Request exceeds the local upload limit.');chunks.push(chunk);}
        const request=new Request(url,{method:incoming.method,headers:incoming.headers,...(size?{body:Buffer.concat(chunks)}:{})});
        const requestEnv = url.pathname === '/api/assistant' ? {...localEnv, ...await runtimeEnv()} : localEnv;
        const response=await localContext.run({env:requestEnv,authenticated:true},()=>handler(request,params));
        outgoing.writeHead(response.status,Object.fromEntries(response.headers));
        if(response.body)Readable.fromWeb(response.body).pipe(outgoing);else outgoing.end();
        return;
      }
      if(!['GET','HEAD'].includes(incoming.method))return send(405,'Method not allowed.');
      const decoded=decodeURIComponent(url.pathname);
      if(decoded.includes('\\')||decoded.includes('\0'))return send(404,'Not found.');
      const path=resolve(uiDir,decoded==='/'?'index.html':'.'+decoded),base=resolve(uiDir)+sep;
      if(!path.startsWith(base))return send(404,'Not found.');
      let bytes;try{if(!(await stat(path)).isFile())return send(404,'Not found.');bytes=await readFile(path);}catch(e){if(e.code==='ENOENT')return send(404,'Not found.');throw e;}
      outgoing.writeHead(200,{'Content-Type':types[extname(path)]??'application/octet-stream','Content-Length':bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'});
      outgoing.end(incoming.method==='HEAD'?undefined:bytes);
    } catch {if(!outgoing.headersSent)send(500,'Local operation failed; saved data is retained.');else outgoing.destroy();}
  });
  await new Promise((yes,no)=>{app.once('error',no);app.listen(0,'127.0.0.1',yes);});
  host='127.0.0.1:'+app.address().port;origin='http://'+host;
  return {origin,session,root,reuseWorkerOutput:async(job,assetId)=>{
    if(job.state!=='ready'||!job.output?.path)return false;
    const row=db.prepare("SELECT data FROM lab_records WHERE owner_id='local-owner' AND kind='asset' AND id=?").get(assetId);
    if(!row)return false;const asset=JSON.parse(row.data);
    if(asset.sha256!==job.output.sha256||asset.size!==job.output.size)throw Error('File trong Thư viện không khớp kết quả tải.');
    return shareVerifiedMedia(resolve(root,'..','outputs'),job.output.path,filePath(asset.key),asset.sha256,asset.size);
  },close:async()=>{await new Promise((yes,no)=>app.close(e=>e?no(e):yes()));db.close();}};
}
