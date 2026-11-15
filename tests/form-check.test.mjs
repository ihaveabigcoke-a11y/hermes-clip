import test from 'node:test';
import assert from 'node:assert/strict';
import {promptCounter,sceneFormIssues,mediaTypeCounts} from '../lib/lab/form-check.ts';
test('T-053: prompt counter counts characters and non-empty lines',()=>{
 assert.equal(promptCounter('').chars,0);
 assert.equal(promptCounter('Áo dài').label,'6 ký tự');
 const m=promptCounter('a\n\n  \nb',true);
 assert.equal(m.prompts,2);assert.match(m.label,/^2 prompt · \d+ ký tự$/);
});
test('T-053: form issues in Vietnamese block empty prompt and missing frames',()=>{
 const refs=[{id:'a',role:'first_frame'},{id:'b',role:'last_frame'},{id:'c',role:'person'},{id:'d',role:'product'}];
 const base={prompt:'x',mode:'prompt',mediaType:'video',referenceIds:[],refs};
 assert.deepEqual(sceneFormIssues(base),[]);
 assert.equal(sceneFormIssues({...base,prompt:'  '})[0].field,'prompt');
 assert.equal(sceneFormIssues({...base,mode:'frames',referenceIds:['a']})[0].field,'referenceIds');
 assert.deepEqual(sceneFormIssues({...base,mode:'frames',referenceIds:['a','b']}),[]);
 assert.equal(sceneFormIssues({...base,mode:'frames',mediaType:'image'}).length,0);
 assert.equal(sceneFormIssues({...base,mode:'model',referenceIds:['c']}).length,1);
 assert.equal(sceneFormIssues({...base,mode:'model',referenceIds:['c','d']}).length,0);
});
test('T-053: media type chip counts',()=>{
 assert.deepEqual(mediaTypeCounts([{take:{type:'image/png'}},{take:{type:'video/mp4'}},{take:{type:'video/mp4'}}]),{all:3,image:1,video:2});
});
