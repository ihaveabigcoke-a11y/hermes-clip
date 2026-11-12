import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {InstagramWorkspace} from '../local/instagram-workspace.mjs';

async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'hermes-instagram-workspace-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'media/owner'),{recursive:true});
  const bytes=Buffer.from('Fixture bytes: media validity is separately tested with real MP4');
  await writeFile(join(root,'media/owner/video.mp4'),bytes);
  const records=[{id:'product',kind:'product',data:{}},
    {id:'account',kind:'social_account',revision:1,data:{productId:'product',handle:'hermes'}},
    {id:'other',kind:'social_account',revision:1,data:{productId:'another'}},
    {id:'plan',kind:'content_plan',revision:1,data:{productId:'product',productionId:'project',caption:'Caption',status:'draft'}},
    {id:'project',kind:'production',data:{productId:'product',scenes:[{id:'scene',ratio:'9:16',takes:[{id:'take',assetId:'asset',review:'pending',metadata:{duration:10,width:720,height:1280}}]}]}},
    {id:'asset',kind:'asset',data:{key:'owner/video.mp4',type:'video/mp4',sha256:createHash('sha256').update(bytes).digest('hex')}}];
  const workspace=new InstagramWorkspace({root});workspace.records=async()=>structuredClone(records);
  return {root,workspace,records,input:{planId:'plan',revision:1,accountId:'account',assetId:'asset'}};
}
test('Posting snapshot validates product, account, selected take, revision and original file',async t=>{
  const {workspace,records,input,root}=await fixture(t);
  const snapshot=await workspace.snapshot(input);
  assert.equal(snapshot.expectedHandle,'hermes');assert.equal(snapshot.takeId,'take');
  assert.equal((await workspace.revalidate(snapshot)).sha256,snapshot.sha256);
  await assert.rejects(workspace.snapshot({...input,accountId:'other'}),/sản phẩm/);
  await assert.rejects(workspace.snapshot({...input,revision:2}),/đã thay đổi/);
  await assert.rejects(workspace.snapshot({...input,assetId:'foreign'}),/MP4/);
  records[1].revision=2;await assert.rejects(workspace.revalidate(snapshot),/đã thay đổi/);records[1].revision=1;
  records[4].data.scenes[0].takes[0].review='rejected';await assert.rejects(workspace.snapshot(input),/cần sửa/);
  records[4].data.scenes[0].takes[0].review='pending';
  await writeFile(join(root,'media/owner/video.mp4'),'changed');await assert.rejects(workspace.snapshot(input),/không khớp/);
});
test('Archived accounts, archived products and path traversal cannot prepare a post',async t=>{
  const {workspace,records,input}=await fixture(t);
  records[1].data.archived=true;await assert.rejects(workspace.snapshot(input),/sản phẩm/);await assert.rejects(workspace.account('account'),/lưu trữ/);
  records[1].data.archived=false;records[0].data.archived=true;await assert.rejects(workspace.snapshot(input),/sản phẩm/);
  for(const path of ['../secret.mp4','C:/outside/video.mp4','owner/../../video.mp4'])await assert.rejects(workspace.mediaPath(path),/đường dẫn/);
});
test('Published synchronization preserves caption and chosen account/video, and refuses stale records',async t=>{
  const {workspace,records,input}=await fixture(t);
  const snapshot=await workspace.snapshot(input);const job={snapshot,postUrl:'https://www.instagram.com/reel/abc/'};
  let calls=0;
  workspace.request=async(path,options)=>{calls++;assert.equal(path,'/api/lab');const body=JSON.parse(options.body);assert.equal(body.data.assetId,'asset');assert.equal(body.data.caption,'Caption');assert.equal(body.data.status,'published_browser');return {};};
  await workspace.syncPublished(job);assert.equal(calls,1);
  records[3].revision=2;await assert.rejects(workspace.syncPublished(job),/Bài đã đăng/);
  records[3].data.status='published_browser';records[3].data.postUrl=job.postUrl;
  await workspace.syncPublished(job);assert.equal(calls,1);
});

test('API publication sync preserves the legacy status with explicit source and never copies credentials or raw receipt',async t=>{
  const {workspace,input}=await fixture(t);const snapshot={...await workspace.snapshot(input),apiMode:'api'};
  let saved;
  workspace.request=async(_path,options)=>{saved=JSON.parse(options.body);return {};};
  await workspace.syncPublished({snapshot,postUrl:'https://www.instagram.com/reel/api/',apiReceipt:{containerId:'200',mediaId:'300'}});
  assert.equal(saved.data.status,'published_browser');assert.equal(saved.data.publishSource,'api');assert.equal(saved.data.caption,snapshot.caption);
  assert.equal(saved.data.assetId,input.assetId);assert.equal(saved.data.apiReceipt,undefined);
});

test('Metrics synchronize one cumulative record with nullable values and refuse changed or older sources',async t=>{
 const {workspace,records}=await fixture(t);
 const postUrl='https://www.instagram.com/reel/abc/';
 records[3].data={...records[3].data,accountId:'account',status:'published_browser',postUrl};
 const target=await workspace.metricTarget('plan');
 const measurement={source:'instagram_browser',sourceUrl:postUrl,handle:'hermes',observedAt:'2026-11-11T09:00:00Z',views:null,likes:0};
 let calls=0;
 workspace.request=async(_path,options)=>{calls++;const body=JSON.parse(options.body);assert.equal(body.id,'social_metric_plan');assert.equal(body.data.views,null);assert.equal(body.data.likes,0);assert.equal(body.data.accountId,'account');return {record:body};};
 const saved=await workspace.saveMetrics(target,measurement);assert.equal(saved.revision,0);assert.equal(calls,1);
 records[3].data.postUrl='https://www.instagram.com/reel/changed/';await assert.rejects(workspace.saveMetrics(target,measurement),/đã thay đổi/);
 records[3].data.postUrl=postUrl;records.push({id:'social_metric_plan',kind:'social_metric',revision:1,data:{observedAt:'2026-11-12T09:00:00Z'}});
 await assert.rejects(workspace.saveMetrics(target,measurement),/mới hơn/);assert.equal(calls,1);
 records[1].data.archived=true;assert.deepEqual(await workspace.metricPlans(),[]);
});

test('AI label defaults to off for old plans, freezes explicit required and detects configuration changes', async t=>{
  const {workspace,records,input}=await fixture(t);
  const legacy=await workspace.snapshot(input);
  assert.equal(legacy.aiLabel,'off');
  records[3].data.aiLabel=null;
  assert.equal((await workspace.snapshot(input)).aiLabel,'off');
  const {aiLabel,...oldSnapshot}=legacy;
  assert.equal((await workspace.revalidate(oldSnapshot)).aiLabel,'off');
  records[3].data.aiLabel='required';
  await assert.rejects(workspace.revalidate(legacy),/đã thay đổi/);
  const required=await workspace.snapshot(input); assert.equal(required.aiLabel,'required');
  assert.equal((await workspace.revalidate(required)).aiLabel,'required');
  records[3].data.aiLabel='off';
  await assert.rejects(workspace.revalidate(required),/đã thay đổi/);
  records[3].data.aiLabel='invalid';
  await assert.rejects(workspace.snapshot(input),error=>error.code==='INSTAGRAM_AI_LABEL_REQUIRED');
});
