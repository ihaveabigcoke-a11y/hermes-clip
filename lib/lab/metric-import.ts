import {z} from 'zod';
import {socialMetricSchema} from './operations.ts';
import type {LabRecord} from './domain.ts';
export const metricColumns=['views','likes','comments','saves','shares','keywordComments','dms','utmClicks','orders'] as const;
export const metricLabels:Record<typeof metricColumns[number],string>={views:'Lượt xem',likes:'Like',comments:'Comment',saves:'Lưu',shares:'Share',keywordComments:'Comment đúng từ khóa',dms:'DM',utmClicks:'Click UTM',orders:'Đơn'};
const count=z.number().int().nonnegative().max(1e12).nullable();
const metricShape=Object.fromEntries(metricColumns.map(k=>[k,count])) as {[K in typeof metricColumns[number]]:typeof count};
export const metricImportRow=z.object({planId:z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/),planRevision:z.number().int().positive(),observedAt:z.string().datetime({offset:true}),sourceLabel:z.string().trim().min(2).max(300),...metricShape});
export const metricImportInput=z.object({batchId:z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),rows:z.array(metricImportRow).min(1).max(200)});
export function metricNumber(value:string):number|null{const v=value.trim();if(!v)return null;if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(v))throw Error('Dùng số nguyên không âm; số nghìn cần dạng 1,234.');const n=Number(v.replaceAll(',',''));if(!Number.isSafeInteger(n)||n>1e12)throw Error('Số vượt giới hạn 1.000.000.000.000.');return n;}
const norm=(s:string)=>s.trim().replace(/^\uFEFF/,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases:Record<string,string>={planid:'planId',postid:'planId',baidang:'planId',mabaidang:'planId',observedat:'observedAt',thoidiem:'observedAt',thoidiemdo:'observedAt',nguon:'sourceLabel',source:'sourceLabel',sourcelabel:'sourceLabel',views:'views',luotxem:'views',likes:'likes',like:'likes',luotthich:'likes',comments:'comments',comment:'comments',binhluan:'comments',saves:'saves',luu:'saves',luotluu:'saves',shares:'shares',share:'shares',chiase:'shares',keywordcomments:'keywordComments',commentdungtukhoa:'keywordComments',binhluandungtukhoa:'keywordComments',dms:'dms',dm:'dms',tinnhan:'dms',utmclicks:'utmClicks',clickutm:'utmClicks',orders:'orders',don:'orders',donhang:'orders'};
function table(text:string){
 const delimiter=text.split(/\r?\n/,1)[0].includes('\t')?'\t':',';const rows:string[][]=[],lines:number[]=[];let row:string[]=[],cell='',quoted=false,closed=false,line=1,startLine=1;
 const pushCell=()=>{row.push(cell);cell='';closed=false;};const pushRow=()=>{pushCell();if(row.some(x=>x.trim())){rows.push(row);lines.push(startLine);}row=[];startLine=line+1;};
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else{cell+=c;if(c==='\n')line++;}continue;}
 if(c==='"'){if(cell||closed)throw Error(`Dòng ${line}: dấu nháy không hợp lệ.`);quoted=true;}
 else if(c===delimiter)pushCell();else if(c==='\n'){pushRow();line++;}else if(c==='\r'&&text[i+1]==='\n')continue;else{if(closed&&!/\s/.test(c))throw Error(`Dòng ${line}: ký tự sau dấu nháy đóng.`);if(!closed)cell+=c;}}
 if(quoted)throw Error(`Dòng ${startLine}: thiếu dấu nháy đóng.`);if(cell||row.length)pushRow();return {rows,lines};
}
export type MetricPreview={rows:z.infer<typeof metricImportRow>[];errors:string[]};
export function previewMetrics(text:string,records:readonly LabRecord[]):MetricPreview{
 const result:MetricPreview={rows:[],errors:[]};if(text.length>200000)return {rows:[],errors:['Tối đa 200.000 ký tự.']};
 let parsed:ReturnType<typeof table>;try{parsed=table(text);}catch(e){return {rows:[],errors:[(e as Error).message]};}
 const [header,...rows]=parsed.rows;if(!header||!rows.length)return {rows:[],errors:['Dán tiêu đề và ít nhất một dòng số liệu.']};if(rows.length>200)return {rows:[],errors:['Tối đa 200 dòng mỗi lô.']};
 const keys=header.map(h=>aliases[norm(h)]);header.forEach((h,i)=>{if(!keys[i])result.errors.push(`Cột không được hỗ trợ: ${h}`);});if(new Set(keys).size!==keys.length)result.errors.push('Tiêu đề cột bị trùng.');for(const key of ['planId','observedAt','sourceLabel'])if(!keys.includes(key))result.errors.push('Thiếu cột '+key);if(result.errors.length)return result;
 const seen=new Set<string>();
 rows.forEach((cells,index)=>{const line=parsed.lines[index+1];if(cells.length!==keys.length){result.errors.push(`Dòng ${line}: số cột không khớp. Với CSV, đặt số 1,234 trong dấu nháy kép.`);return;}
  const value=Object.fromEntries(keys.map((key,i)=>[key,cells[i].trim()]));const plan=records.find(r=>r.kind==='content_plan'&&r.id===value.planId);let failed=false;
  if(!plan||!['published_manual','published_browser'].includes(plan.data.status)||!plan.data.postUrl){result.errors.push(`Dòng ${line}: bài đăng không tồn tại hoặc chưa ghi URL đã đăng.`);return;}
  const unique=plan.id+':'+value.observedAt;if(seen.has(unique)){result.errors.push(`Dòng ${line}: trùng bài và thời điểm trong lô.`);return;}seen.add(unique);
  const data:Record<string,any>={planId:plan.id,planRevision:plan.revision,observedAt:value.observedAt,sourceLabel:value.sourceLabel};for(const key of metricColumns)try{data[key]=metricNumber(value[key]??'');}catch(e){result.errors.push(`Dòng ${line} · ${metricLabels[key]}: ${(e as Error).message}`);failed=true;}
  const checked=metricImportRow.safeParse(data);if(!checked.success){if(!failed)result.errors.push(`Dòng ${line}: kiểm thời điểm ISO có múi giờ và nguồn (ít nhất 2 ký tự).`);}else if(!failed)result.rows.push(checked.data);
 });
 return result;
}
/** Transaction caller snapshots records under BEGIN IMMEDIATE. Append-only, replay-safe. */
export function planMetricImport(records:readonly LabRecord[],raw:unknown,now=Date.now()):LabRecord[]{
 const input=metricImportInput.parse(raw),seen=new Set<string>();
 const result=input.rows.map((row,i)=>{
  const key=row.planId+':'+row.observedAt;if(seen.has(key))throw Error(`Dòng ${i+2}: trùng bài và thời điểm trong lô.`);seen.add(key);
  const plan=records.find(r=>r.id===row.planId&&r.kind==='content_plan');if(!plan||!['published_manual','published_browser'].includes(plan.data.status)||!plan.data.postUrl)throw Error(`Dòng ${i+2}: chưa có bài đã đăng.`);
  if(plan.revision!==row.planRevision)throw Error(`Dòng ${i+2}: bài đã thay đổi. Xem trước lại.`);
  const data=socialMetricSchema.parse({...row,source:'manual',accountId:plan.data.accountId??'',sourceUrl:plan.data.postUrl,profileVisits:null,linkClicks:null,notes:row.sourceLabel,importBatchId:input.batchId});
  const id=`manual_metric_${input.batchId}_${i}`,prior=records.find(r=>r.id===id);
  if(prior){if(prior.kind!=='social_metric'||JSON.stringify(prior.data)!==JSON.stringify(data))throw Error('Mã lô đã dùng cho dữ liệu khác. Xem trước lại.');return prior;}
  return {id,kind:'social_metric' as const,data,revision:1,createdAt:now,updatedAt:now};
 });
 if(records.length+result.filter(r=>!records.some(old=>old.id===r.id)).length>2000)throw Error('Workspace vượt giới hạn 2.000 bản ghi.');return result;
}
