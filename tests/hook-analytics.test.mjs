import test from 'node:test';import assert from 'node:assert/strict';
import {signalRate,scaleSignal,compareHooks,productDecisionSchema} from '../lib/lab/hook-analytics.ts';
import {schemas,emptySettings} from '../lib/lab/domain.ts';
test('T018 ratios keep null or zero denominator unknown and threshold defaults null',()=>{for(const denominator of [null,undefined,0,-1])assert.equal(signalRate(2,denominator),null);assert.equal(signalRate(null,10),null);assert.equal(signalRate(0,10),0);assert.equal(scaleSignal(.1,null),'Chưa đặt ngưỡng');assert.equal(scaleSignal(null,2),'Chưa đủ dữ liệu');assert.equal(scaleSignal(.02,2),'Đạt ngưỡng đã đặt');assert.equal(schemas.settings.parse(emptySettings).scaleSignalThreshold??null,null);});
test('T018 uses observedAt, preserves latest null, and refuses comparison drift',()=>{
 const plans=[1,2,3].map(i=>({id:'p'+i,kind:'content_plan',data:{productId:'product',variantId:'h'+i,hook:'Hook '+i,accountId:'acc',postUrl:'https://instagram.com/p/'+i,ctaKeyword:'PAWS',offerPrice:34,offerCurrency:'USD',landingBaseUrl:null,assetId:'a'+i,comparison:{groupId:'g',variantId:'h'+i,accountId:'acc',ctaKeyword:'PAWS',price:34,currency:'USD',landingBaseUrl:null,assetId:'a'+i}}}));
 const metric=(id,at,views)=>({id,kind:'social_metric',updatedAt:1,data:{planId:'p1',observedAt:at,sourceUrl:plans[0].data.postUrl,views,keywordComments:2,utmClicks:1,orders:0}});
 const old=metric('old','2026-11-12T00:00:00Z',999),latest=metric('new','2026-11-13T00:00:00Z',100);old.updatedAt=99999;
 let rows=compareHooks([...plans,latest,old],'product','g',1);assert.equal(rows.length,3);assert.equal(rows[0].views,100);assert.equal(rows[0].keywordRate,.02);assert.equal(rows[1].views,null);
 latest.data.views=null;rows=compareHooks([...plans,old,latest],'product','g',null);assert.equal(rows[0].keywordRate,null);assert.equal(rows[0].views,null);
 plans[0].data.ctaKeyword='DOG';assert.equal(compareHooks([...plans,latest],'product','g',1)[0].signal,'Lệch lượt so sánh');
 assert.equal(productDecisionSchema.safeParse({productId:'product',decision:'push',reason:'',decidedAt:'bad'}).success,false);
});
