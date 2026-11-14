import {museMediaPrompt,museVideoBody} from './muse-video-prompt.mjs';

export const sceneToken = sceneId => `SCENE_${sceneId}`;
export function bundlePrompt(requests) {
  return museMediaPrompt('Make 3 separate videos, one per scene below.\n'
    + requests.map(r=>`Name the downloadable video ${sceneToken(r.sceneId)}. Exactly ${r.duration} seconds.\n${museVideoBody(r.prompt)}`).join('\n\n'),'video');
}
// DOM order alone cannot establish which approved scene a clip belongs to.
export function mapBundleCards(cards,requests) {
  if(cards.length!==requests.length)return null;
  const mapped=requests.map(r=>cards.filter(c=>new RegExp(`(?:^|[^\\w-])${sceneToken(r.sceneId)}(?:$|[^\\w-])`).test(c.text)));
  if(mapped.some(rows=>rows.length!==1)||new Set(mapped.map(rows=>rows[0].id)).size!==requests.length)return null;
  return mapped.map(rows=>rows[0].id);
}
export function canBundle(requests) {
  if(requests.length<3)return false;
  const signature=r=>JSON.stringify({ratio:r.ratio,references:r.references.map(({id,version,sha256,role})=>({id,version,sha256,role}))});
  return requests.slice(0,3).every(r=>r.mediaType==='video'&&r.duration<=8&&signature(r)===signature(requests[0]))
    &&bundlePrompt(requests.slice(0,3)).length<=10000;
}
