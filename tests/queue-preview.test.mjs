import test from 'node:test';
import assert from 'node:assert/strict';
import {groupQueueJobs,matchesQueueFilter,matchesQueueSearch,resolvedQueueFailures} from '../lib/lab/queue-view.ts';
import {queueFailureSummary,safeQueueText} from '../desktop/src/queue-error.mjs';
import {videoPreview,completedVideoMeasurement} from '../lib/lab/video-preview.ts';
const job=(n,state,patch={})=>({id:'job_'+n,queueNumber:n,createdAt:n,state,request:{projectId:'p',sceneId:'s'+n,sceneRevision:1,productRevision:1,mediaType:'video',name:'Cảnh '+n,prompt:'A BLUE kettle turns on a table.'},...patch});
const profile=(name,patch={})=>({id:name,name,enabled:true,health:'ready',quota:{state:'available'},dispatch:{stopped:false},...patch});
const status=()=>({musePaused:false,generationReady:true,profiles:['Chi','Cho','Duc','Chim'].map(name=>profile(name,{dispatch:{stopped:name==='Chi'}})),jobs:[]});

test('T-043 queue filters count visible scene cards, search prompts and exact #N independently',()=>{
 const rows=['queued','waiting','failed','ready','cancelled','needs_attention','ready'].map((s,i)=>job(i+1,s,i===6?{importError:'Disk full'}:{}));
 const old=job(8,'failed',{request:{...rows[3].request}});rows.push(old,job(9,'ready',{request:{...old.request},uploadedAssetId:'clip',importedAt:10}));
 const before=structuredClone(rows),resolved=resolvedQueueFailures(rows);
 assert.deepEqual(Object.fromEntries(['all','active','failed','done'].map(f=>[f,groupQueueJobs(rows.filter(j=>matchesQueueFilter(j,f,resolved))).length])),{all:7,active:1,failed:1,done:1});
 assert.equal(rows.filter(j=>matchesQueueSearch(j,'blue KETTLE')).length,9);
 assert.deepEqual(rows.filter(j=>matchesQueueSearch(j,' #8 ')).map(j=>j.id),['job_8']);
 assert.equal(matchesQueueSearch(job(80,'queued'),'#8'),false);
 assert.equal(matchesQueueSearch(job(8,'queued'),'không có'),false);
 assert.equal(matchesQueueSearch(job(8,'queued'),'mÁy', ['Máy rửa']),true);
 assert.equal(matchesQueueFilter(job(10,'unknown_new_state'),'all'),true);
 assert.equal(matchesQueueFilter(rows[6],'done'),false);
 assert.deepEqual(rows,before);
});

test('T-043 error line preserves original reason and strips secrets before clipping',()=>{
 const raw='Muse trả lời nhưng không có file.\nhttps://cdn.invalid/video?sig=secret token=abc123 Authorization: Bearer private';
 const original=job(1,'failed',{failureDetail:raw,history:[{state:'failed',note:'Generic error'}]});
 assert.equal(queueFailureSummary(original),'Muse trả lời nhưng không có file. [URL] token=[đã ẩn] [đã ẩn]');
 assert.equal(original.failureDetail,raw);
 assert.equal(queueFailureSummary({...original,state:'ready'}),'');
 assert.equal(queueFailureSummary({...original,importError:'Không nhập được file.'}),'Không nhập được file.');
 assert.equal(queueFailureSummary(job(2,'failed',{history:[{state:'failed',note:'Đĩa đầy.'}]})),'Đĩa đầy.');
 assert.equal(queueFailureSummary(job(3,'failed')),'Chưa có lý do được ghi lại.');
 for(const text of ['{"access_token":"private token value"}','password=secret','api_key=short','Bearer abc.def.ghi','Cookie: abc=secret','x'.repeat(60),'https://a.invalid/?signature=xyz']){
  const shown=safeQueueText(text);assert.doesNotMatch(shown,/private|secret|short|abc|xyz|x{30}|https:/);
 }
 const clipped=queueFailureSummary({...original,failureDetail:'Một lỗi. '.repeat(80)});assert.ok(clipped.length<=180);assert.ok(clipped.endsWith('…'));assert.doesNotMatch(clipped,/\n/);
});

test('T-043 preview counts cards and usable profiles without inventing an estimate',()=>{
 const s=status(),before=structuredClone(s),p=videoPreview(s,null,null);
 assert.equal(p.text,'3 hook · 5 thẻ cần tạo → Cho / Duc / Chim · 3 hồ sơ');assert.equal(p.estimateSeconds,null);assert.deepEqual(s,before);
 for(const patch of [{enabled:false},{busy:true},{health:'unknown'},{quota:{state:'exhausted'}},{dispatch:{stopped:true}}]){
  const next=status();next.profiles[2]={...next.profiles[2],...patch};assert.deepEqual(videoPreview(next,null,null).profiles.map(p=>p.name),['Cho','Chim']);
 }
 for(const patch of [{musePaused:true},{generationReady:false},{storage:{blocked:true}},{museNight:{stopped:true}},{museNight:{remaining:0}}])assert.equal(videoPreview({...s,...patch},null,null).profiles.length,0);
 assert.match(videoPreview(null,null,null).text,/Đang đọc hồ sơ/);assert.doesNotMatch(videoPreview(null,null,null).text,/0 hồ sơ|~0/);
 const measured={measuredAt:100000,elapsedMs:85344,hookCount:3,sceneCount:5,profileIds:['Chim','Cho','Duc']};
 assert.equal(videoPreview(s,null,measured).estimateSeconds,85);
 for(const patch of [{elapsedMs:0},{elapsedMs:NaN},{sceneCount:3},{profileIds:['Cho']}])assert.equal(videoPreview(s,null,{...measured,...patch}).estimateSeconds,null);
 const project={id:'p',data:{scenes:Array.from({length:5},(_,i)=>({id:'s'+i,role:i<3?'hook':'body',mediaType:'video',revision:1,takes:i<3?[]:[{sceneRevision:1,review:'approved'}]}))}};
 assert.equal(videoPreview(s,project,null).cardCount,3);
 assert.equal(videoPreview(s,project,measured).estimateSeconds,null);
 assert.match(videoPreview({...s,jobs:[job(1,'needs_attention')]},project,null).text,/Cần đối soát/);
 assert.match(videoPreview({...s,jobs:[job(1,'waiting')]},project,null).text,/Đang lấy kết quả cũ/);
});

test('T-043 measures only successful fresh clips; resume, import errors and unknowns give null',()=>{
 const jobs=[0,1,2,3,4].map(i=>job(i,'ready',{uploadedAssetId:'asset_'+i,importedAt:80000,profileId:['Cho','Duc','Chim'][i%3],timings:{preflightStartedAt:1100}}));
 const ids=jobs.map(j=>j.request.sceneId),m=completedVideoMeasurement(1000,86344,ids,jobs);
 assert.deepEqual(m,{measuredAt:86344,elapsedMs:85344,sceneCount:5,hookCount:3,profileIds:['Chim','Cho','Duc']});
 for(const patch of [{timings:null},{timings:{preflightStartedAt:999}},{importedAt:null},{uploadedAssetId:null},{state:'failed'},{importError:'disk'},{profileId:null}])assert.equal(completedVideoMeasurement(1000,86344,ids,[{...jobs[0],...patch},...jobs.slice(1)]),null);
 assert.equal(completedVideoMeasurement(1000,86344,[],jobs),null);assert.equal(completedVideoMeasurement(1000,1000,ids,jobs),null);
});
