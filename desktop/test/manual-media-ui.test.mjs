import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {importModule} from './helpers/local-server.mjs';
const {ProviderSelect,ManualToolbar,ManualMediaSettings}=await importModule('components/lab/manual-media.tsx');
const {MuseSwitch}=await importModule('components/lab/muse-switch.tsx');
const {default:WorkerActivity}=await importModule('components/lab/worker-activity.tsx');
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

test('desktop settings show Muse off and paused before settings are loaded',()=>{
  const html=renderToStaticMarkup(React.createElement(ManualMediaSettings,{}));
  assert.match(html,/<input[^>]+role="switch"/);
  assert.doesNotMatch(html,/<input[^>]+role="switch"[^>]+checked=""/);
  assert.match(html,/Muse: Đang tạm dừng/);assert.match(html,/Hộp nhận media/);
  assert.match(html,/class="production-card production-card-body muse-switch-card"/);
  assert.match(html,/class="account-toggle muse-switch-control"/);
  assert.match(html,/role="switch"[^>]*aria-checked="false"[^>]*disabled=""/);
});

test('Muse switch shares the existing lime toggle, one prominent status and an accessible explanation',()=>{
  const html=renderToStaticMarkup(React.createElement(MuseSwitch,{demo:true}));
  assert.match(html,/<section class="production-card production-card-body muse-switch-card" aria-label="Công tắc Muse">/);
  assert.match(html,/<label class="account-toggle muse-switch-control"><input[^>]*role="switch"/);
  assert.match(html,/<strong role="status">Muse: Đang tạm dừng<\/strong>/);
  assert.equal((html.match(/role="status"/g)??[]).length,1);
  const description=html.match(/aria-describedby="([^"]+)"/)[1];
  assert.ok(html.includes(`id="${description}"`));
  assert.match(html,/Tạm dừng chặn tác vụ mới; tác vụ đang chạy vẫn hoàn tất\./);
  assert.doesNotMatch(html,/bật lại ở Tài khoản Muse/);
});

test('accounts can omit duplicate Muse status without losing history or disabled login guidance',()=>{
  const status={musePaused:true,jobs:[{id:'job',request:{name:'Fixture media'},history:[{at:1,state:'ready',note:'Đã nhập kết quả'}]}],profiles:[{id:'one',name:'Fixture',health:'login_required'}]};
  const html=renderToStaticMarkup(React.createElement(WorkerActivity,{status,error:'',showMuseStatus:false}));
  assert.match(html,/Nhật ký chạy Muse/);assert.match(html,/role="log"/);assert.match(html,/Đã nhập kết quả/);
  assert.doesNotMatch(html,/role="status"|class="field-help"/);
  const loginButton=html.match(/<button\b[^>]*>/)[0];
  assert.match(loginButton,/disabled=""/);
  assert.match(loginButton,/title="Muse đang tạm dừng, bật lại ở Tài khoản Muse"/);
  const otherScreens=renderToStaticMarkup(React.createElement(WorkerActivity,{status,error:''}));
  assert.match(otherScreens,/role="status"/);assert.match(otherScreens,/class="field-help"/);
});
