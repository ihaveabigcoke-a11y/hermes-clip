import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {characterLibrary} from '../local/characters.mjs';
import {characterMentions,characterSelection} from '../src/characters.mjs';
import {Store} from '../src/store.mjs';
import {Worker} from '../src/worker.mjs';
import {MuseAdapter} from '../src/muse.mjs';
import {MUSE_VIDEO_COMMAND} from '../src/muse-video-prompt.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const hash=createHash('sha256').update(png).digest('hex');
async function fixture(run){
  const root=await mkdtemp(join(tmpdir(),'hermes-characters-')),db=new DatabaseSync(join(root,'workspace.sqlite')),store=new Store(join(root,'worker.sqlite'));
  db.exec('CREATE TABLE lab_records(owner_id TEXT,id TEXT,kind TEXT,data TEXT,revision INTEGER,created_at INTEGER,updated_at INTEGER,PRIMARY KEY(owner_id,id))');
  const put=db.prepare('INSERT INTO lab_records VALUES(?,?,?,?,1,1,1)');
  put.run('local-owner','old_product','product',JSON.stringify({name:'Existing product',cost:null}));
  for(let i=1;i<=3;i++){const bytes=Buffer.concat([png,Buffer.from([i])]);await writeFile(join(root,'image'+i+'.png'),bytes);put.run('local-owner','image'+i,'asset',JSON.stringify({key:'image'+i+'.png',sha256:createHash('sha256').update(bytes).digest('hex'),type:'image/png',size:bytes.length,metadata:{width:1,height:1}}));}
  store.set('muse_paused',false);store.set('profiles',['Chi','Cho','Duc','Chim'].map(id=>({id,enabled:true,vpnEnabled:true})));
  const recordsBeforeMigration=db.prepare('SELECT * FROM lab_records').all();
  const library=characterLibrary(db,key=>join(root,key));
  try{await run({root,db,store,library,recordsBeforeMigration});}finally{db.close();store.close();await rm(root,{recursive:true,force:true});}
}
test('T-045 mentions: Unicode, punctuation, repeats and email boundaries',()=>{
  assert.deepEqual(characterMentions('(@Bông), @bông; @Bông! a@Bông.com @@skip @Bông_2'),['Bông','Bông_2']);
  assert.deepEqual(characterMentions('A product without a handle.'),[]);
});
test('T-045 additive migration and CRUD preserve existing records and original files',()=>fixture(async({db,root,library,recordsBeforeMigration:before})=>{
  assert.deepEqual(db.prepare('SELECT * FROM lab_records').all(),before);
  let row=library.save({name:'Bông',kind:'mascot',assetIds:['image1'],notes:''});
  assert.throws(()=>library.save({...row,id:undefined,name:'BÔNG'}),/tồn tại/);
  assert.throws(()=>library.save({...row,revision:0}),/thay đổi/);
  assert.throws(()=>library.save({...row,kind:'person'}),/Chỉ dùng/);
  for(const assetIds of [[],['image1','image1'],['image1','image2','image3','image4'],['missing']])assert.throws(()=>library.save({...row,assetIds}));
  row=library.save({...row,notes:'Minh hoạ',assetIds:['image1','image2','image3']});assert.equal(row.revision,2);
  assert.deepEqual(characterLibrary(db,key=>join(root,key)).list(),[row]);
  const reopened=new DatabaseSync(join(root,'workspace.sqlite'));
  try{assert.deepEqual(characterLibrary(reopened,key=>join(root,key)).list(),[row]);}finally{reopened.close();}
  assert.throws(()=>library.remove({...row,revision:1}),/thay đổi/);
  library.remove(row);assert.deepEqual(library.list(),[]);
  assert.equal(db.prepare('SELECT count(*) AS n FROM characters').get().n,1);
  assert.deepEqual(db.prepare('SELECT * FROM lab_records').all(),before);
  assert.deepEqual(await readFile(join(root,'image1.png')),Buffer.concat([png,Buffer.from([1])]));
  assert.equal(library.save({name:'Bông',kind:'product',assetIds:['image1']}).name,'Bông');
}));
const job=(prompt,keepCharacter)=>({projectId:'project',productId:'product',productRevision:1,sceneId:'scene',sceneRevision:1,name:'Fixture',mediaType:'video',ratio:'9:16',duration:8,prompt,references:[],...(keepCharacter?{keepCharacter:true}:{})});
for(const count of [1,2,3])test(`T-045 fake Muse receives exactly ${count} character images and one leading command`,()=>fixture(async({root,store,library})=>{
  library.save({name:'Bông',kind:'mascot',assetIds:Array.from({length:count},(_,i)=>'image'+(i+1))});
  const before=store.get('profiles'),worker=new Worker(store,root,{},{});
  worker.resolveCharacterReferences=library.references;
  const result=await worker.enqueue(job(MUSE_VIDEO_COMMAND+'\n@Bông turns. @Bông smiles. '+MUSE_VIDEO_COMMAND,true));
  assert.equal(result.job.request.references.length,count);
  const expected=Array.from({length:count},(_,i)=>Buffer.concat([png,Buffer.from([i+1])]));
  assert.deepEqual(result.job.request.references.map(r=>r.sha256),expected.map(bytes=>createHash('sha256').update(bytes).digest('hex')));
  for(const [index,ref] of result.job.request.references.entries())assert.deepEqual(await readFile(ref.path),expected[index]);
  const fills=[],uploads=[];
  const adapter=new MuseAdapter({startUrl:'https://fixture.invalid',prompt:'#prompt',upload:'#upload'});adapter.session=async()=>true;
  await adapter.prepare({locator:selector=>({fill:async text=>fills.push(text),setInputFiles:async files=>uploads.push(files)})},result.job.request);
  assert.equal(uploads[0].length,count);assert.ok(fills[0].startsWith(MUSE_VIDEO_COMMAND));assert.equal(fills[0].split(MUSE_VIDEO_COMMAND).length-1,1);
  assert.deepEqual(store.get('profiles'),before);assert.equal(store.get('muse_paused'),false);assert.equal(store.batch(),null);
  // Retrying uses the saved references even after the library changes.
  const original=result.job.request;library.remove(library.list()[0]);
  store.transition(result.job.id,'preflight');store.transition(result.job.id,'failed');
  assert.deepEqual(store.retry(result.job.id).request,original);
}));
test('T-045 switch off and no mention keep legacy references; unknown or excess blocks before enqueue',()=>fixture(async({root,store,library})=>{
  library.save({name:'Bông',kind:'mascot',assetIds:['image1','image2','image3']});
  library.save({name:'Ấm',kind:'product',assetIds:['image1','image2']});
  const worker=new Worker(store,root,{},{});let lookups=0;worker.resolveCharacterReferences=(...args)=>{lookups++;return library.references(...args);};
  assert.equal((await worker.enqueue(job('@Không_tồn_tại moves.',false))).job.request.references.length,0);assert.equal(lookups,0);
  assert.equal((await worker.enqueue(job('A product turns.',true))).job.request.references.length,0);
  const before=store.jobs().length;
  await assert.rejects(worker.enqueue(job('@Không_tồn_tại turns.',true)),/Không tìm thấy/);
  await assert.rejects(worker.enqueue(job('@Bông meets @Ấm.',true)),/Tối đa 4/);
  assert.equal(store.jobs().length,before);
  assert.equal(characterSelection('@Bông',true,library.list(),1).length,1);
  assert.throws(()=>characterSelection('@Bông',true,library.list(),2),/Tối đa 4/);
  const existing={id:'manual',version:1,role:'product',type:'image/png',sha256:hash,bytes:new Uint8Array(png)};
  const four=await worker.enqueue({...job('@Bông turns with a product.',true),references:[existing]});
  assert.equal(four.job.request.references.length,4);assert.equal(four.job.request.references[0].id,'manual');
  assert.deepEqual(await readFile(four.job.request.references[0].path),png);
  const countAfterFour=store.jobs().length;
  const changed=library.list()[0];await writeFile(join(root,'image1.png'),'changed');
  await assert.rejects(worker.enqueue(job('@'+changed.name+' turns.',true)),/checksum/);assert.equal(store.jobs().length,countAfterFour);
}));
