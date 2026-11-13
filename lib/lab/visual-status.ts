/** One semantic palette for badges, services, timelines and publishing cells. */
export const visualStatus = {
  active: {color:'#d4ff3a',background:'#273018',label:'Xong / hoạt động',icon:'check'},
  waiting: {color:'#f6cc84',background:'#352e23',label:'Chờ',icon:'clock'},
  error: {color:'#ff9292',background:'#3b2428',label:'Lỗi',icon:'alert'},
  empty: {color:'#b4b5c0',background:'#24262e',label:'Chưa có',icon:'minus'},
} as const;
export type VisualState=keyof typeof visualStatus;
const aliases:Record<string,VisualState>={
  success:'active',approved:'active',ready:'active',done:'active',published:'active',measured:'active',connected:'active',
  warning:'waiting',pending:'waiting',queued:'waiting',paused:'waiting',generating:'waiting',sending:'waiting',checking:'waiting',attention:'waiting',needs_attention:'waiting',refused:'waiting',draft:'waiting',
  danger:'error',failed:'error',rejected:'error',blocked:'error',
  neutral:'empty',info:'empty',unconfigured:'empty',unknown:'empty',missing:'empty',
};
export function visualState(value?:string|null):VisualState {
  return value&&Object.hasOwn(visualStatus,value)?value as VisualState:aliases[value??'']??'empty';
}
export const visualStatusVariables=Object.fromEntries(Object.entries(visualStatus).flatMap(([key,value])=>[
  ['--status-'+key,value.color],['--status-'+key+'-bg',value.background],
]));
