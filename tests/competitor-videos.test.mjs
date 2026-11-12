import test from 'node:test';
import assert from 'node:assert/strict';
import {competitorVideoSchema,competitorVideosSchema,competitorContentLink} from '../lib/lab/competitor-videos.ts';
import {schemas,emptyProduct} from '../lib/lab/domain.ts';
test('T013 HTTPS, credentials, limit and legacy product',()=>{
 const v={url:'https://example.com/watch',platform:'youtube'};
 assert.equal(competitorVideoSchema.parse(v).referenceId,null);
 for(const url of ['http://example.com','javascript:alert(1)','https://u:p@example.com','bad'])assert.equal(competitorVideoSchema.safeParse({...v,url}).success,false);
 assert.equal(competitorVideosSchema.safeParse(Array(21).fill(v)).success,false);
 assert.equal(schemas.product.safeParse({...emptyProduct,name:'Legacy'}).success,true);
});
test('T013 carries matching reference and product project into content',()=>{
 const ref={id:'r',kind:'reference_video_draft',data:{},updatedAt:1},project={id:'p',kind:'production',data:{productId:'item'},updatedAt:1};
 const v={referenceId:'r'};const url=new URL(competitorContentLink('item',v,[ref,project]),'http://local');
 assert.equal(url.searchParams.get('production'),'p');assert.equal(url.searchParams.get('reference'),'r');
 assert.match(competitorContentLink('other',v,[ref,project]),/new_product=other/);
});
