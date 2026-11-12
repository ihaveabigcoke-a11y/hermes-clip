import test from 'node:test';import assert from 'node:assert/strict';
import {previewMetrics,metricNumber,planMetricImport} from '../lib/lab/metric-import.ts';
const records=[{id:'p',kind:'content_plan',revision:1,data:{status:'published_manual',postUrl:'https://instagram.com/p/test',accountId:'acc'}}];
test('T019 Vietnamese CSV and English TSV preserve comma thousands, blank and explicit zero',()=>{
 const vi=previewMetrics('Bài đăng,Thời điểm,Nguồn,Lượt xem,Like,Comment đúng từ khóa,Click UTM,Đơn\np,2026-11-13T10:00:00+07:00,"Insights, copied","1,234",0,12,,',records);
 assert.deepEqual(vi.errors,[]);assert.equal(vi.rows[0].views,1234);assert.equal(vi.rows[0].likes,0);assert.equal(vi.rows[0].utmClicks,null);assert.equal(vi.rows[0].shares,null);
 const en=previewMetrics('planId\tobservedAt\tsource\tviews\torders\np\t2026-11-13T03:00:00Z\tInsights\t2,000\t0',records);assert.deepEqual(en.errors,[]);assert.equal(en.rows[0].views,2000);assert.equal(en.rows[0].orders,0);
});
test('T019 reports row errors, rejects malformed quotes, decimals, unsupported/duplicate headers and duplicates',()=>{
 for(const v of ['-1','1.5','1,23','1e3','Infinity','1000000000001'])assert.throws(()=>metricNumber(v));assert.equal(metricNumber(''),null);assert.equal(metricNumber('0'),0);
 const head='planId,observedAt,source,views\n';for(const line of ['missing,2026-11-13T00:00:00Z,Insights,1','p,invalid,Insights,1','p,2026-11-13T00:00:00Z,Insights,-1','p,2026-11-13T00:00:00Z,"unclosed,1'])assert.ok(previewMetrics(head+line,records).errors.length);
 assert.ok(previewMetrics('planId,observedAt,source,views,views\np,2026-11-13T00:00:00Z,Insights,1,2',records).errors.length);
 const line='p,2026-11-13T00:00:00Z,Insights,1';assert.match(previewMetrics(head+line+'\n'+line,records).errors.join(' '),/Dòng 3/);
});
test('T019 append import preserves prior records and replay IDs; stale preview fails',()=>{
 const p=previewMetrics('planId,observedAt,source,views\np,2026-11-13T00:00:00Z,Insights,123',records),input={batchId:'b',rows:p.rows};
 const rows=planMetricImport(records,input,10);assert.equal(rows[0].data.views,123);assert.equal(rows[0].data.sourceLabel,'Insights');assert.equal(rows[0].data.importBatchId,'b');assert.deepEqual(planMetricImport([...records,...rows],input,20),rows);
 assert.throws(()=>planMetricImport([{...records[0],revision:2}],input),/thay đổi/);assert.throws(()=>planMetricImport([...records,...rows],{...input,rows:[{...p.rows[0],views:321}]}),/Mã lô/);
});

test('T022a CSV BOM/CRLF and embedded quotes preserve content and physical error line',()=>{
 const text='\uFEFFBài đăng,Thời điểm,Nguồn,Lượt xem\r\np,2026-11-13T00:00:00Z,"Insights ""copy""\nsecond line","1,234"\r\np,2026-11-14T00:00:00Z,Insights,-1';
 const result=previewMetrics(text,records);assert.equal(result.rows.length,1);assert.equal(result.rows[0].sourceLabel,'Insights "copy"\nsecond line');assert.equal(result.rows[0].views,1234);assert.match(result.errors[0],/Dòng 4/);
});
test('T022a equivalent observation instants cannot be duplicated inside a batch',()=>{
 const text='planId,observedAt,source,views\np,2026-11-13T00:00:00Z,Insights,1\np,2026-11-13T07:00:00+07:00,Insights,1';
 assert.match(previewMetrics(text,records).errors.join(' '),/trùng bài và thời điểm/);
 const row=previewMetrics(text.split('\n').slice(0,2).join('\n'),records).rows[0];assert.throws(()=>planMetricImport(records,{batchId:'same_instant',rows:[row,{...row,observedAt:'2026-11-13T07:00:00+07:00'}]}),/trùng bài và thời điểm/);
});
