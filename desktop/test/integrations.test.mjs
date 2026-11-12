import {readArchive} from '../src/compress.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {Store} from '../src/store.mjs';
import {Integrations,runJson,researchInput,composeInput} from '../src/integrations.mjs';

test('subprocess rejects non-object JSON envelopes', async () => {
 for (const value of ['null', '[]', 'true', '42', '"text"']) {
  await assert.rejects(() => runJson(process.execPath, ['-e', `process.stdout.write(${JSON.stringify(value)})`]), /JSON/);
 }
});

test('subprocess requires explicit boolean success', async () => {
 for (const value of [{}, {ok: 'false'}, {ok: 1}, {ok: null}]) {
  await assert.rejects(() => runJson(process.execPath, ['-e', `console.log(${JSON.stringify(JSON.stringify(value))})`]));
 }
});

test('malformed research is persisted as failed and malformed versions are unavailable', () => fixture(async (store, dir) => {
 for (const response of [{}, {ok: 'true'}, {ok: true}, {ok: true, items: {}}, {ok: true, items: [null]}]) {
  const integrations = new Integrations(store, dir, async () => response);
  integrations.saveConfig({python: 'python', reach: 'agent-reach', montage: dir});
  await assert.rejects(() => integrations.research({projectId: 'p', channel: 'web', query: 'fixture'}));
  assert.equal(integrations.jobs()[0].state, 'failed');
  assert.equal(integrations.busy, false);
 }
 const integrations = new Integrations(store, dir, async () => ({ok: true, result: {ffmpeg: true, ffprobe: true}}));
 const health = await integrations.doctor();
 assert.equal(health.reach.ready, false);
}));

test('malformed montage results fail before success and doctor requires boolean availability', () => fixture(async (store, dir) => {
 const source = {duration: 3, width: 90, height: 160};
 const frame = {path: join(dir, 'frame.jpg'), timestamp_seconds: 0};
 for (const result of [{}, {source, frames: []}, {source, frames: [null]}, {source, frames: [{...frame, timestamp_seconds: 4}]}, {source: {...source, width: 0}, frames: [frame]}]) {
  const integrations = new Integrations(store, dir, async () => ({ok: true, result}));
  integrations.saveConfig({python: 'python', reach: 'agent-reach', montage: dir});
  await assert.rejects(() => integrations.task('reference', 'p', {}, () => integrations.montage('analyze')), /OpenMontage/);
  assert.equal(integrations.jobs()[0].state, 'failed');
  assert.equal(integrations.busy, false);
 }
 for (const result of [{ffmpeg: 'true', ffprobe: true}, {ffmpeg: true, ffprobe: 1}, {ffmpeg: false, ffprobe: true, ready: true}]) {
  const integrations = new Integrations(store, dir, async (_command, _args, options) => options?.input
   ? {ok: true, result}
   : {ok: true, result: {version: 'fixture'}});
  const health = await integrations.doctor();
  assert.equal(health.reach.ready, true);
  assert.equal(health.montage.ready, false);
 }
 const integrations = new Integrations(store, dir, async () => ({ok: true, result: {}}));
 await assert.rejects(() => integrations.montage('compose'), /OpenMontage/);
}));

test('invalid extracted JPEG bytes persist failure and clear busy state', () => fixture(async (store, dir) => {
 const sourceBytes = new Uint8Array([1, 2]);
 const sha256 = createHash('sha256').update(sourceBytes).digest('hex');
 for (const frameBytes of [Buffer.from('not a JPEG'), Buffer.from([0xff, 0xd8, 0xff, 0x00])]) {
  let calls = 0;
  const integrations = new Integrations(store, dir, async (_command, _args, options) => {
   calls++;
   const framePath = join(options.input.outputDir, 'invalid.jpg');
   await writeFile(framePath, frameBytes);
   return {ok: true, result: {
    source: {duration: 3, width: 90, height: 160},
    frames: [{path: framePath, timestamp_seconds: 0}]
   }};
  });
  integrations.saveConfig({python: 'python', reach: 'agent-reach', montage: dir});
  await assert.rejects(() => integrations.analyze({
   projectId: 'p', assetId: 'a', name: 'fixture.mp4', bytes: sourceBytes, sha256
  }));
  assert.equal(calls, 1);
  assert.equal(integrations.jobs()[0].state, 'failed');
  assert.equal(integrations.busy, false);
  await assert.rejects(() => integrations.frames(integrations.jobs()[0].id), /Chưa có khung hình/);
 }
}));

test('output rejects an external path even with a matching checksum', () => fixture(async (store, dir) => {
 const external = join(dir, 'external.mp4');
 const bytes = Buffer.from('fixture');
 await writeFile(external, bytes);
 await mkdir(join(dir, 'integrations', 'x'), {recursive: true});
 store.set('integration-jobs', [{id: 'x', kind: 'compose', state: 'done', output: {
  path: external, sha256: createHash('sha256').update(bytes).digest('hex')
 }}]);
 const integrations = new Integrations(store, dir);
 await assert.rejects(() => integrations.output('x'), /ngoài tác vụ/);
}));

test('subprocess preserves Vietnamese UTF-8 split across output chunks', async () => {
 const text = 'Tiếng Việt';
 const script = `const bytes = Buffer.from(JSON.stringify({ok:true,result:${JSON.stringify(text)}})); const split = bytes.findIndex(byte => byte >= 0xc0) + 1; process.stdout.write(bytes.subarray(0, split), () => setTimeout(() => process.stdout.write(bytes.subarray(split)), 100));`;
 const response = await runJson(process.execPath, ['-e', script]);
 assert.equal(response.result, text);
});
test('subprocess counts each stdout chunk once, not the accumulated output', async t => {
 const original=Buffer.byteLength;let scanned=0,calls=0;
 t.mock.method(Buffer,'byteLength',(value,encoding)=>{
  if(encoding==='utf8'&&typeof value==='string'&&/^a+$/.test(value)){scanned+=value.length;calls++;}
  return original(value,encoding);
 });
 const result=await runJson(process.execPath,['-e','let n=64;function write(){process.stdout.write("a".repeat(1024));if(--n)setTimeout(write,2);}write();'],{format:'text'});
 assert.equal(result.length,64*1024);assert.ok(calls>1);assert.equal(scanned,64*1024);
});
test('stdout accepts exactly 4 MiB, rejects one extra byte and never raises the hard cap',async()=>{
 const limit=4*1024*1024;
 const script=bytes=>`process.stdout.write('a'.repeat(${bytes}));`;
 assert.equal((await runJson(process.execPath,['-e',script(limit)],{format:'text'})).length,limit);
 for(const maxBytes of [limit,limit*2])await assert.rejects(()=>runJson(process.execPath,['-e',script(limit+1)],{format:'text',maxBytes}),/giới hạn/);
 const text='€'.repeat(1000),bytes=Buffer.byteLength(text);
 const splitScript=`const b=Buffer.from(${JSON.stringify(text)});let n=0;function write(){process.stdout.write(b.subarray(n,n+97));n+=97;if(n<b.length)setImmediate(write);}write();`;
 assert.equal(await runJson(process.execPath,['-e',splitScript],{format:'text',maxBytes:bytes}),text);
 await assert.rejects(()=>runJson(process.execPath,['-e',splitScript],{format:'text',maxBytes:bytes-1}),/giới hạn/);
});

async function fixture(fn){const dir=await mkdtemp(join(tmpdir(),'lab-integrations-')),s=new Store(join(dir,'state.sqlite'));try{await fn(s,dir);}finally{s.close();await rm(dir,{recursive:true,force:true});}}
test('research argv are bounded, read-only, channel-specific and never a shell',()=>fixture(async(s,dir)=>{const calls=[];const i=new Integrations(s,dir,async(cmd,args)=>{calls.push({cmd,args});return {ok:true,items:[{url:'https://example.com',text:'fixture'}]};});i.saveConfig({python:'python',reach:'agent-reach',montage:dir});const j=await i.research({projectId:'p',channel:'web',query:'phone bouncing $(touch no)'});assert.equal(calls[0].args[2],'phone bouncing $(touch no)');assert.ok(!calls[0].args.includes('--backend'));assert.equal(j.state,'done');assert.ok((await readArchive(j.path)).includes('unreviewed'));await i.research({projectId:'p',channel:'reddit',query:'running vest'});assert.deepEqual(calls[1].args.slice(-2),['--backend','public-web']);assert.equal(researchInput.safeParse({projectId:'p',channel:'tiktok',query:'x'}).success,false);}));
test('failure is persisted, partial data is not marked as a successful result',()=>fixture(async(s,dir)=>{const i=new Integrations(s,dir,async()=>{throw Error('Network blocked');});i.saveConfig({python:'python',reach:'agent-reach',montage:dir});await assert.rejects(()=>i.research({projectId:'p',channel:'web',query:'running vest'}),/blocked/);assert.equal(i.jobs()[0].state,'failed');assert.equal(i.busy,false);}));
test('restart marks interrupted jobs and does not replay',()=>fixture(async(s,dir)=>{s.set('integration-jobs',[{id:'old',kind:'research',state:'running'}]);let calls=0;const i=new Integrations(s,dir,async()=>calls++);assert.equal(i.jobs()[0].state,'interrupted');assert.equal(calls,0);}));
test('invalid checksum stops before upstream invocation',()=>fixture(async(s,dir)=>{let calls=0;const i=new Integrations(s,dir,async()=>{calls++;});await assert.rejects(()=>i.analyze({projectId:'p',assetId:'a',name:'ref.mp4',bytes:new Uint8Array([1,2]),sha256:'0'.repeat(64)}),/checksum/);assert.equal(calls,0);assert.equal(i.jobs()[0].state,'failed');}));
test('subprocess reports native error envelopes and timeout, does not claim success',async()=>{await assert.rejects(()=>runJson(process.execPath,['-e','console.log(JSON.stringify({ok:false,error:{message:"upstream rejected"}}))']),/upstream rejected/);await assert.rejects(()=>runJson(process.execPath,['-e','setInterval(()=>{},1000)'],{timeout:100}),/thời gian/);});
test('compose rejects oversized batches before media or provider execution',()=>{const c={bytes:new Uint8Array([1]),sha256:createHash('sha256').update(new Uint8Array([1])).digest('hex'),duration:3};assert.equal(composeInput.safeParse({projectId:'p',variantId:'v',ratio:'9:16',clips:Array(31).fill(c)}).success,false);});
test('frame receipt cannot read a path outside its own task',()=>fixture(async(s,dir)=>{const external=join(dir,'private.txt');await writeFile(external,'private');s.set('integration-jobs',[{id:'x',kind:'reference',state:'done',frames:[{path:external,timestamp_seconds:0}]}]);const i=new Integrations(s,dir);await assert.rejects(()=>i.frames('x'));}));

test('Windows virtualenv runs the installed Agent Reach CLI through its Python interpreter', {skip: process.platform !== 'win32'}, () => fixture(async (store, dir) => {
 const calls = [];
 const integrations = new Integrations(store, dir, async (command, args) => {
  calls.push({command, args});
  return {ok: true, result: {version: 'fixture'}, items: []};
 });
 const python = join(dir, 'Scripts', 'python.exe');
 integrations.saveConfig({python, reach: join(dir, 'Scripts', 'agent-reach.exe'), montage: dir});
 await integrations.research({projectId: 'p', channel: 'web', query: 'Treat Trader'});
 assert.equal(calls[0].command, python);
 assert.deepEqual(calls[0].args.slice(0, 5), ['-m', 'agent_reach.cli', 'web', 'search', 'Treat Trader']);
 integrations.saveConfig({python, reach: join(dir, 'other', 'agent-reach.exe'), montage: dir});
 await integrations.reach(['version']);
 assert.equal(calls[1].command, join(dir, 'other', 'agent-reach.exe'));
 assert.deepEqual(calls[1].args, ['version']);
}));
