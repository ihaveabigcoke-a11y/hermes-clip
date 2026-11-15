import {museMediaPrompt,museVideoBody} from './muse-video-prompt.mjs';

// Prompt-only context: never mutate the approved scene or its edit plan.
export function hookEndFrameLine(scene,project) {
  if(scene.role!=='hook'||scene.mediaType!=='video')return '';
  const variant=project.variants?.find(v=>v.hook?.sceneId===scene.id);
  const plan=project.reuseBodyPlan??project.renderPlans?.find(p=>p.variantId===variant?.id);
  const bodyId=plan?.segments[1]?.sceneId??project.bodies?.find(b=>b.id===variant?.bodyId)?.items[0]?.sceneId;
  const body=bodyId?project.scenes.find(s=>s.id===bodyId):project.scenes.find(s=>s.role==='body'&&s.storyboardApproved&&s.mediaType==='video');
  const hookSegment=plan?.segments[0];
  const end=hookSegment?(project.reuseBodyPlan?hookSegment.outSec-hookSegment.inSec:hookSegment.outSec):(scene.toSec>scene.fromSec?scene.toSec-scene.fromSec:scene.duration);
  const description=body?.storyboardApproved?museVideoBody(body.prompt).replace(/\s+/g,' ').trim():'';
  const opening=description?`the body shot described as "${description}"`:'the approved body shot';
  const start=plan?.segments[1]?.inSec;
  return `End-frame continuity: At ${end} seconds, match the opening frame of ${opening}${start>0?` at its selected start (${start} seconds)`:''}, with the same subject placement, camera framing, lighting and background; hold this composition until the hook ends for a seamless cut.`;
}

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
