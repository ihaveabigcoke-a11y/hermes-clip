import test from 'node:test';
import assert from 'node:assert/strict';
import {museVideoLimitLabel,isMuseVideoLimit,MUSE_LIMIT_FALLBACK} from '../lib/lab/muse-limit.ts';
const pad=n=>String(n).padStart(2,'0');
test('24h video limit: estimated +24h',()=>{
  const at=new Date(2026,10,15,9,5);
  assert.equal(museVideoLimitLabel("You've reached the video generation limit in the past 24 hours",at),'Muse giới hạn video 24 giờ. Thử lại sau 09:05');
});
test('exact retry time wins',()=>{
  assert.equal(museVideoLimitLabel('rate limit 24h',new Date(2026,10,15,9,5),new Date(2026,10,16,14,30)),'Muse giới hạn video 24 giờ. Thử lại sau 14:30');
});
test('unknown time falls back, Vietnamese text matches',()=>{
  assert.equal(museVideoLimitLabel('Đã hết giới hạn tạo video trong 24 giờ qua'),MUSE_LIMIT_FALLBACK);
});
test('other errors are not matched',()=>{
  assert.equal(isMuseVideoLimit('Login required'),false);
  assert.equal(museVideoLimitLabel(undefined),null);
});
