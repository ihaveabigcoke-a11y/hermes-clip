import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {importModule} from './helpers/local-server.mjs';
const {ProviderSelect,ManualToolbar,ManualMediaSettings}=await importModule('components/lab/manual-media.tsx');
const {newProduction,applyProduction}=await importModule('lib/lab/production.ts');

test('manual provider UI defaults are explicit; paused Muse and unverified/paid providers are disabled',()=>{
  let calls=0;
  const render=paused=>renderToStaticMarkup(React.createElement(ProviderSelect,{value:'manual',paused,disabled:false,label:'Nhà cung cấp cảnh',onChange:()=>calls++}));
  const html=render(true);
  assert.match(html,/<option value="manual" selected="">/);
  for(const id of ['muse','grok-cli','fal'])assert.match(html,new RegExp(`<option value="${id}" disabled="">`));
  for(const text of ['Muse đang tạm dừng','chưa kiểm','trả phí, phải báo giá trước'])assert.ok(html.includes(text));
  assert.doesNotMatch(render(false),/<option value="muse" disabled/);
  assert.equal(calls,0);
});

test('manual toolbar renders export/open actions and unmatched file warnings without provider calls',()=>{
  let p=newProduction('Fixture','product',1),calls=0;
  p=applyProduction(p,'scene',{id:'scene',name:'Sample scene',prompt:'Show the product.',referenceIds:[]},'create');
  p=applyProduction(p,'storyboard',{sceneId:'scene'},'approve');
  const manual={status:{inbox:'fixture',scenes:[{projectId:'project',sceneId:'scene',code:'P12-S03',state:'Chờ file'}],unmatched:[{sha256:'a'.repeat(64),name:'unknown.mp4',warning:'Sai tỷ lệ 9:16',metadata:{width:160,height:90,duration:8}}],errors:[]},error:'',refresh:async()=>{calls++;}};
  const html=renderToStaticMarkup(React.createElement(ManualToolbar,{projectId:'project',production:p,paused:true,disabled:false,manual,onAction:async()=>calls++}));
  for(const text of ['Xuất gói prompt','Mở hộp nhận media','Chưa gắn cảnh (1)','unknown.mp4','Sai tỷ lệ 9:16','P12-S03','Gắn vào cảnh','Muse đang tạm dừng'])assert.ok(html.includes(text),text);
  assert.equal(calls,0);
});

test('desktop settings show the pause switch on before settings are loaded',()=>{
  const html=renderToStaticMarkup(React.createElement(ManualMediaSettings,{}));
  assert.match(html,/<input[^>]+role="switch"[^>]+checked=""/);
  assert.match(html,/Tạm dừng Muse/);assert.match(html,/Hộp nhận media/);
});
