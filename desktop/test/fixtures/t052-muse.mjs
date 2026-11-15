import assert from 'node:assert/strict';
export const config={enabled:true,startUrl:'https://muse.ai/thread/new',loggedIn:'#logged',prompt:'textarea',submitName:'Send',resultCards:'.result',resultIdAttribute:'data-message-id',readyWithinCard:'video',downloadButtonName:'Download',upload:'input',timeoutSeconds:60};
export function fakePage({lazyOldMedia=false}={}){
  let url='about:blank',prompt='',sent=0,newMediaReady=!lazyOldMedia;const navigation=[],uploads=[],baseline={media:lazyOldMedia?[]:['old-result'],users:['old-user'],assistants:lazyOldMedia?['old-assistant','old-result']:['old-assistant']};
  const element=id=>({getAttribute:()=>id,textContent:id==='new-user'?prompt:'Old message',querySelector:()=>null});
  const locator=selector=>({first(){return this;},waitFor:async()=>{},isVisible:async()=>selector==='#logged',inputValue:async()=>prompt,fill:async value=>{prompt=value;},setInputFiles:async files=>uploads.push(files),allTextContents:async()=>[],
    evaluateAll:async(fn,arg)=>fn((selector.startsWith('.result')?[...baseline.media,...(sent&&lazyOldMedia?['old-result']:[]),...(sent&&newMediaReady?['new-result']:[])]:selector.includes('role="user"')?[...baseline.users,...(sent?['new-user']:[])]:[...baseline.assistants,...(sent?['new-assistant']:[])]).map(element),arg)});
  return {navigation,uploads,baseline,get sent(){return sent;},get prompt(){return prompt;},url:()=>url,goto:async u=>{navigation.push(u);url=u;},waitForLoadState:async()=>{},locator,
    getByRole:(_role,{name})=>({waitFor:async()=>{},isVisible:async()=>false,click:async()=>{assert.equal(name,'Send');sent++;}}),waitForTimeout:async()=>{newMediaReady=true;},screenshot:async()=>{},isClosed:()=>false};
}
