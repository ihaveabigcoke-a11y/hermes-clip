import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Store} from '../src/store.mjs';
import {Integrations} from '../src/integrations.mjs';
import {toolchain} from '../src/media.mjs';
import {checkedBytes,verifyJpeg,sha256,sceneCuts,referenceLimits} from '../src/reference-structure.mjs';
import {shortsUrl,youtubeCapability,youtubeArgs,downloadYoutubeReference} from '../src/reference-youtube.mjs';
import {runReferenceCommand} from '../src/reference-process.mjs';

const execute=promisify(execFile);
let missingTools=false;
try{await toolchain();}catch(error){if(error.code==='ENOENT')missingTools='Thiếu FFmpeg/ffprobe trên PATH; không thể chạy fixture media.';else throw error;}
async function fixture(fn) {
  const dir=await mkdtemp(join(tmpdir(),'t12-reference-')),store=new Store(join(dir,'state.sqlite'));
  try{await fn(dir,store);}finally{store.close();await rm(dir,{recursive:true,force:true});}
}
async function video(path,duration=6) {
  const args=['-v','error','-nostdin'];
  if(duration===6){
    for(const color of ['red','white','blue'])args.push('-f','lavfi','-i',`color=c=${color}:s=90x160:r=25:d=2`);
    args.push('-filter_complex','[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]','-map','[v]');
  }else args.push('-f','lavfi','-i',`color=c=red:s=90x160:r=25:d=${duration}`);
  await execute('ffmpeg',[...args,'-c:v','libx264','-pix_fmt','yuv420p',path],{windowsHide:true,timeout:30000});
  const bytes=new Uint8Array(await readFile(path));return {bytes,sha256:sha256(bytes)};
}

test('6s local MP4 detects two cuts, validates JPEG, keeps source and verifies receipts after restart',{skip:missingTools},()=>fixture(async(dir,store)=>{
  const source=await video(join(dir,'colors.mp4'));
  const integrations=new Integrations(store,dir,async()=>{throw Error('No provider call permitted');});
  const job=await integrations.analyzeStructure({projectId:'product',assetId:'a',name:'colors.mp4',...source});
  assert.equal(job.state,'done');assert.equal(job.usageUsd,0);assert.equal(job.kind,'reference-structure');
  const result=await integrations.structure({id:job.id,projectId:'product'}),s=result.structure;
  assert.equal(s.durationSec,6);assert.equal(s.width,90);assert.equal(s.height,160);assert.equal(s.aspectRatio,'9:16');
  assert.equal(s.cutCount,2);assert.ok(Math.abs(s.cuts[0]-2)<=.3);assert.ok(Math.abs(s.cuts[1]-4)<=.3);
  assert.equal(s.frames.length,8);assert.deepEqual(s.frames.map(f=>f.t),[0,.8,1.6,2.4,3.2,4,4.8,5.6]);
  assert.equal(s.gridColumns,3);assert.ok((await stat(s.contactSheetPath)).size>0);
  assert.deepEqual([...result.contactSheet.bytes.slice(0,3)],[255,216,255]);
  const {stdout}=await execute('ffprobe',['-v','error','-show_streams','-of','json',s.contactSheetPath],{windowsHide:true});
  const image=JSON.parse(stdout).streams[0];assert.equal(image.codec_name,'mjpeg');assert.equal(image.width,480);assert.equal(image.height,480);
  assert.deepEqual(await readFile(join(dir,'colors.mp4')),Buffer.from(source.bytes));
  assert.equal(sha256(await readFile(job.path)),job.structureSha256);
  const restarted=new Integrations(store,dir,async()=>{throw Error('Never replay');});
  assert.deepEqual((await restarted.structure({id:job.id,projectId:'product'})).structure,s);
  await assert.rejects(()=>restarted.structure({id:job.id,projectId:'other'}),/dự án/);
  await writeFile(s.contactSheetPath,Buffer.from('changed'));
  await assert.rejects(()=>restarted.structure({id:job.id,projectId:'product'}),/JPEG/);
  await writeFile(job.path,'{}');await assert.rejects(()=>restarted.structure({id:job.id,projectId:'product'}),/checksum/);
}));

test('short video keeps a frame at zero; no cuts remains observed zero',{skip:missingTools},()=>fixture(async(dir,store)=>{
  const source=await video(join(dir,'short.mp4'),.2),i=new Integrations(store,dir);
  const j=await i.analyzeStructure({projectId:'p',assetId:'a',name:'short.mp4',...source});
  const {structure}=await i.structure({id:j.id,projectId:'p'});
  assert.equal(structure.cutCount,0);assert.deepEqual(structure.cuts,[]);assert.equal(structure.frames.length,1);assert.equal(structure.frames[0].t,0);
}));

test('duration, size, checksums and task lock fail without successful receipts',{skip:missingTools},()=>fixture(async(dir,store)=>{
  const i=new Integrations(store,dir),input={projectId:'p',assetId:'a',name:'fixture.mp4',bytes:new Uint8Array([1]),sha256:'0'.repeat(64)};
  await assert.rejects(()=>i.analyzeStructure(input),/checksum/);assert.equal(i.jobs()[0].state,'failed');assert.equal(i.busy,false);
  const count=i.jobs().length;
  await assert.rejects(()=>i.analyzeStructure({...input,bytes:new Uint8Array(referenceLimits.bytes+1)}));assert.equal(i.jobs().length,count);
  const source=await video(join(dir,'long.mp4'),180.2);
  await assert.rejects(()=>i.analyzeStructure({...input,...source}),/180/);assert.equal(i.jobs()[0].state,'failed');
  i.busy=true;await assert.rejects(()=>i.analyzeStructure(input),/đang chạy/);i.busy=false;
  store.set('integration-jobs',[{id:'lost',kind:'reference-structure',state:'running',projectId:'p'}]);
  const restart=new Integrations(store,dir,async()=>{throw Error('No replay');});
  assert.equal(restart.jobs()[0].state,'interrupted');await assert.rejects(()=>restart.structure({id:'lost',projectId:'p'}),/Chưa có/);
}));

test('confinement and JPEG decoding reject external paths, impostors and changed bytes',()=>fixture(async(dir)=>{
  const own=join(dir,'task');await mkdir(own);
  const outside=join(dir,'private.txt');await writeFile(outside,'private');
  await assert.rejects(()=>checkedBytes(own,outside,sha256(Buffer.from('private')),100),/ngoài tác vụ/);
  const path=join(own,'bad.jpg');
  await writeFile(path,Buffer.from('not JPEG'));await assert.rejects(()=>verifyJpeg(own,path),/JPEG/);
  await assert.rejects(()=>checkedBytes(own,path,'0'.repeat(64),100),/checksum/);
}));
test('JPEG magic alone is insufficient',{skip:missingTools},()=>fixture(async dir=>{
  const path=join(dir,'fake.jpg');await writeFile(path,Buffer.from([255,216,255,0]));
  await assert.rejects(()=>verifyJpeg(dir,path));
}));
test('scene parser ignores duplicate, out-of-bounds and nonfinite timestamps',()=>{
  assert.deepEqual(sceneCuts('pts_time:0 pts_time:2 pts_time:2 pts_time:4 pts_time:1e400 pts_time:7',6),[2,4]);
});

const url='https://www.youtube.com/shorts/abc123XYZ_-';
const help='--ignore-config --dump-single-json --skip-download --no-playlist --max-filesize --match-filters --write-subs --write-auto-subs --sub-langs --sub-format --format --output --no-progress --no-warnings --socket-timeout --retries --no-cache-dir --no-overwrites';
const capability={supported:true,command:'python',prefix:['-m','yt_dlp'],infoCommand:['youtube','info']};
const info={id:'abc123XYZ_-',duration:6,title:'Fixture',formats:[{format_id:'18',ext:'mp4',vcodec:'avc1',protocol:'https',filesize:1000,height:160}]};

test('YouTube capability invokes only local help and disables unsupported tools',async()=>{
  const calls=[];
  const cap=await youtubeCapability(async(command,args)=>{calls.push(args);return help;},{python:'python'},async args=>{
    calls.push(args);return args.includes('info')?'Usage: youtube info URL':'Commands:\n  info   Read info';
  });
  assert.equal(cap.supported,true);assert.deepEqual(cap.infoCommand,['youtube','info']);
  assert.deepEqual(cap.prefix,['-m','yt_dlp']);assert.equal(cap.command,'python');
  assert.ok(calls.every(args=>args.includes('--help')&&!args.some(arg=>arg.startsWith('https:'))));
  assert.equal((await youtubeCapability(async()=>help.replace('--max-filesize',''),null)).supported,false);
  assert.equal((await youtubeCapability(async()=>{throw Error('missing');},null)).supported,false);
});

test('Shorts URL is allowlisted and normalized; argv never includes account configuration',()=>{
  assert.equal(shortsUrl(url+'?si=tracking'),url);
  for(const bad of ['http://youtube.com/shorts/abc123XYZ_-','https://evil.test/shorts/abc123XYZ_-','https://user:secret@youtube.com/shorts/abc123XYZ_-','https://youtube.com:123/shorts/abc123XYZ_-','https://youtube.com/watch?v=abc123XYZ_-','--exec calc'])assert.throws(()=>shortsUrl(bad));
  const args=youtubeArgs(capability,'download',url,'C:/fixture','18');
  assert.deepEqual(args.slice(0,2),['-m','yt_dlp']);assert.deepEqual(args.slice(-2),['--',url]);
  for(const flag of ['--max-filesize','--match-filters','--ignore-config','--no-cache-dir','--write-subs','--write-auto-subs','--no-playlist','--no-overwrites'])assert.ok(args.includes(flag));
  assert.equal(args[args.indexOf('--max-filesize')+1],String(25*1024**2));
  assert.equal(args[args.indexOf('--match-filters')+1],'duration <= 180');
  assert.equal(args[args.indexOf('--sub-langs')+1],'en');
  assert.ok(!args.some(arg=>/cookie|login|transcrib|proxy/.test(arg)));
});

test('fake YouTube runner keeps info, MP4 and optional free subtitles',()=>fixture(async dir=>{
  const calls=[];
  const result=await downloadYoutubeReference({directory:dir,url,capability,
    reach:async args=>{calls.push(args);return {ok:true,result:{title:'Fixture'}};},
    run:async(_command,args,options)=>{
      calls.push(args);if(args.includes('--dump-single-json'))return JSON.stringify(info);
      assert.ok(options.fileBudget.maxBytes<=27*1024**2);
      await writeFile(join(dir,'source.mp4'),'fake MP4');await writeFile(join(dir,'source.en.vtt'),'WEBVTT\n\n00:00.000 --> 00:01.000\nFixture');return '';
    }});
  assert.deepEqual(calls[0],['youtube','info',url]);assert.ok(calls[1].includes('--skip-download'));assert.ok(calls[2].includes('--write-subs'));
  assert.equal(result.sourceUrl,url);assert.equal(result.subtitles.length,1);
  assert.equal(result.sha256,sha256(Buffer.from('fake MP4')));assert.ok((await readFile(join(dir,'youtube-source.json'),'utf8')).includes('Fixture'));
}));
test('YouTube missing size, oversized/long/wrong video and malformed JSON stop before download',()=>fixture(async dir=>{
  for(const value of [null,{...info,id:'wrong'},{...info,duration:181},{...info,duration:null},{...info,formats:[{...info.formats[0],filesize:null}]},{...info,formats:[{...info.formats[0],filesize:referenceLimits.bytes+1}]},{...info,formats:null}]) {
    let calls=0;
    await assert.rejects(()=>downloadYoutubeReference({directory:dir,url,capability:{...capability,infoCommand:null},run:async()=>{calls++;return JSON.stringify(value);}}));
    assert.equal(calls,1);
  }
  await assert.rejects(()=>downloadYoutubeReference({directory:dir,url,capability:{supported:false,error:'Chưa hỗ trợ'},run:()=>assert.fail('must not run')}),/Chưa hỗ trợ/);
}));
test('fake download flows through real local analysis in the same integration task',{skip:missingTools},()=>fixture(async(dir,store)=>{
  const media=await video(join(dir,'synthetic.mp4'));
  const i=new Integrations(store,dir,async()=>assert.fail('No configured Reach'),async(_command,args)=>{
    if(args.includes('--help'))return help;
    if(args.includes('--dump-single-json'))return JSON.stringify(info);
    const output=args[args.indexOf('--output')+1].replace('%(ext)s','mp4');await writeFile(output,media.bytes);return '';
  });
  const job=await i.analyzeYoutube({projectId:'p',url});assert.equal(job.state,'done');assert.equal(i.jobs().length,1);
  const result=await i.structure({id:job.id,projectId:'p'});assert.equal(result.structure.cutCount,2);assert.deepEqual(result.subtitles,[]);assert.equal(result.sourceUrl,url);
}));

test('dedicated download process bounds output, time and generated files',()=>fixture(async dir=>{
  assert.equal(await runReferenceCommand(process.execPath,['-e','process.stdout.write("ok")']),'ok');
  await assert.rejects(()=>runReferenceCommand(process.execPath,['-e','process.stdout.write("x".repeat(5000))'],{maxBytes:100}),/giới hạn/);
  await assert.rejects(()=>runReferenceCommand(process.execPath,['-e','setInterval(()=>{},1000)'],{timeout:100}),/thời gian/);
  const download=join(dir,'download');await mkdir(download);
  const script=`require('node:fs').writeFileSync(${JSON.stringify(join(download,'source.mp4.part'))},Buffer.alloc(2000));setInterval(()=>{},1000);`;
  await assert.rejects(()=>runReferenceCommand(process.execPath,['-e',script],{fileBudget:{directory:download,maxBytes:1000}}),/dung lượng/);
  const quick=join(dir,'quick');await mkdir(quick);
  await assert.rejects(()=>runReferenceCommand(process.execPath,['-e',`require('node:fs').writeFileSync(${JSON.stringify(join(quick,'source.mp4'))},Buffer.alloc(2000));`],{fileBudget:{directory:quick,maxBytes:1000}}),/dung lượng/);
}));

test('new reference actions are wired in both main and preload without launching Electron',async()=>{
  const main=await readFile(new URL('../src/main.mjs',import.meta.url),'utf8'),preload=await readFile(new URL('../src/preload.cjs',import.meta.url),'utf8');
  for(const [method,target] of [['integrationAnalyzeStructure','analyzeStructure'],['integrationStructure','structure'],['integrationYoutubeStatus','youtubeStatus'],['integrationAnalyzeYoutube','analyzeYoutube']]) {
    assert.ok(preload.includes(`'${method}'`));assert.match(main,new RegExp(method+':[^,]+integrations\\.'+target+'\\('));
  }
});
