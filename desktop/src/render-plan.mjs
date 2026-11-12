// Timed text only. Caller paths, style code and arbitrary ASS tags are never accepted.
export function renderPlanAss(overlays) {
 const time=v=>{const c=Math.round(v*100);return `${Math.floor(c/360000)}:${String(Math.floor(c/6000)%60).padStart(2,'0')}:${String(Math.floor(c/100)%60).padStart(2,'0')}.${String(c%100).padStart(2,'0')}`;};
 const header=`[Script Info]\nScriptType: v4.00+\nPlayResX: 720\nPlayResY: 1280\nWrapStyle: 0\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,70,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,8,35,35,90,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
 const events=overlays.map(o=>{if(typeof o.text!=='string'||/[{}\\\r]/.test(o.text)||o.text.length>120||!Number.isFinite(o.fromSec)||!Number.isFinite(o.toSec)||o.fromSec<0||o.toSec<=o.fromSec)throw Error('Chữ đè không hợp lệ.');return `Dialogue: 0,${time(o.fromSec)},${time(o.toSec)},Default,,0,0,0,,{\\an8}${o.text.replace(/\n/g,'\\N')}`;});
 return header+events.join('\n')+'\n';
}
