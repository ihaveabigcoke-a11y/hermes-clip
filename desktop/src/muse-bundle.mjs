import {museMediaPrompt,museVideoBody} from './muse-video-prompt.mjs';

export const sceneToken = sceneId => `SCENE_${sceneId}`;
export function bundlePrompt(requests) {
  return museMediaPrompt('Make 3 separate videos, one per scene below.\n'
    + 'Return the videos in the scene order below: first video = Scene 1, second = Scene 2, third = Scene 3.\n'
    + requests.map((r,i)=>`Scene ${i+1}:\nName the downloadable video ${sceneToken(r.sceneId)}. Exactly ${r.duration} seconds.\n${museVideoBody(r.prompt)}`).join('\n\n'),'video');
}
// Legacy receipts still require labels. New numbered prompts explicitly define
// appearance order; callers retain the first observation order across polls.
export function mapBundleCards(cards,requests,{appearance=false}={}) {
  if(cards.length!==requests.length)return null;
  if(cards.some(c=>!c.id||(c.clipCount!==undefined&&c.clipCount!==1))||new Set(cards.map(c=>c.id)).size!==cards.length)return null;
  if(appearance)return cards.map(c=>c.id);
  const mapped=requests.map(r=>cards.filter(c=>new RegExp(`(?:^|[^\\w-])${sceneToken(r.sceneId)}(?:$|[^\\w-])`).test(c.text)));
  if(mapped.some(rows=>rows.length!==1)||new Set(mapped.map(rows=>rows[0].id)).size!==requests.length)return null;
  return mapped.map(rows=>rows[0].id);
}
export function useBundle(store,mode,ready,requests){
  return mode!=='separate'&&ready>0&&canBundle(requests)
    &&(mode==='bundle'||(ready<3&&store.get('muse_bundle_order_verified',false)&&!store.get('muse_bundle_order_failed',false)));
}
export function canBundle(requests) {
  if(requests.length<3)return false;
  const signature=r=>JSON.stringify({ratio:r.ratio,references:r.references.map(({id,version,sha256,role})=>({id,version,sha256,role}))});
  return requests.slice(0,3).every(r=>r.mediaType==='video'&&r.duration<=8&&signature(r)===signature(requests[0]))
    &&bundlePrompt(requests.slice(0,3)).length<=10000;
}
