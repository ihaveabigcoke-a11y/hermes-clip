import {z} from 'zod';
import {emptyProduct,schemas,type LabRecord} from './domain.ts';
import {suggestProductKey} from './daily-selection.ts';
export const compactProductInput=z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/),revision:z.number().int().nonnegative(),data:z.unknown()});
/** Keep old record fields; a compact edit only changes fields explicitly supplied. */
export function planCompactProduct(records:LabRecord[],raw:unknown,now=Date.now()):LabRecord{
 const input=compactProductInput.parse(raw),previous=records.find(r=>r.id===input.id);
 if(previous&&(previous.kind!=='product'||previous.revision!==input.revision)||!previous&&input.revision!==0)throw Error('Hồ sơ đã thay đổi. Tải lại trước khi lưu.');
 if(!input.data||typeof input.data!=='object'||Array.isArray(input.data))throw Error('Hồ sơ không hợp lệ.');
 const allowed=['name','productKey','imageUrl','supplierUrl','proofNotes','cost','shipping','price','currency','costCurrency','shippingCurrency','ctaKeyword','purchaseUrl','competitorVideos'];
 const supplied=Object.fromEntries(Object.entries(input.data).filter(([k])=>allowed.includes(k)));
 const data=schemas.product.parse({...emptyProduct,...previous?.data,...supplied});
 if(!data.productKey){const base=suggestProductKey(data.name).slice(0,54)||'SAN-PHAM';let key=base.length<2?'SP-'+base:base,n=2;while(records.some(r=>r.kind==='product'&&r.id!==input.id&&r.data.productKey===key))key=base+'-'+n++;data.productKey=key;}
 if(records.some(r=>r.kind==='product'&&r.id!==input.id&&r.data.productKey===data.productKey))throw Error('Mã đã thuộc sản phẩm khác.');
 for(const video of data.competitorVideos??[])if(video.referenceId&&!records.some(r=>r.kind==='reference_video_draft'&&r.id===video.referenceId))throw Error('Bản phân tích video chưa tồn tại.');
 if(!previous&&records.length>=2000)throw Error('Workspace đã đủ 2.000 bản ghi.');
 return {id:input.id,kind:'product',data,revision:input.revision+1,createdAt:previous?.createdAt??now,updatedAt:now};
}
/** Conservative pasted supplier text: only labelled values, no price inference. */
export function pastedProductSource(text:string){
 const value=text.slice(0,50000),line=(keys:string)=>value.match(new RegExp('(?:^|\\n)(?:'+keys+')\\s*[:：]\\s*([^\\n]+)','i'))?.[1]?.trim();
 const number=(v:string|undefined)=>v&&/^\d+(?:[.,]\d+)?(?:\s*(?:USD|US\$|\$))?$/i.test(v)?Number(v.replace(/\s*(USD|US\$|\$)$/i,'').replace(',','.')):null;
 const https=(s:string|undefined)=>{try{const u=new URL(s??'');return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
 return {name:line('Tên|Name|Title')?.slice(0,120)??null,imageUrl:https(line('Ảnh|Image|Image URL')),cost:number(line('Giá vốn|Cost')),shipping:number(line('Ship|Shipping')),source:'pasted_supplier_text'};
}
