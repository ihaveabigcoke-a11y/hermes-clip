import {productFinancials,productCurrency,unitMargin,type LabRecord} from './domain.ts';
export {profileOptionalFields,competitorSchema} from './product-profile-schema.ts';
export const profileTabs=[['overview','Tổng quan'],['market','Thị trường'],['competitors','Đối thủ'],['finance','Giá & lợi nhuận'],['supply','Nguồn hàng & mẫu'],['brand','Bao bì & thương hiệu'],['risks','Tiềm năng & rủi ro'],['content','Nội dung'],['results','Kết quả']] as const;
export function contentReadiness(p:Record<string,any>){
 const present=(v:unknown)=>typeof v==='string'&&!!v.trim();
 return [{id:'cta',label:'Từ khóa CTA',ready:/^[A-Z]{2,20}$/.test(String(p.ctaKeyword??''))&&p.ctaKeyword!=='LINK'},
 {id:'situation',label:'Tình huống mở đầu',ready:present(p.situation)},
 {id:'packaging',label:'Tên in trên hộp',ready:present(p.brandName)&&present(p.boxText)},
 {id:'quote',label:'Có báo giá vốn, ship và giá bán',ready:['cost','shipping','price'].every(k=>typeof productFinancials(p)[k]==='number')}];
}
export function profileFinance(input:Record<string,any>){
 const p=productFinancials(input),costCurrency=productCurrency(p,'cost'),shippingCurrency=productCurrency(p,'shipping'),currency=productCurrency(p,'price');
 const valid=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
 const landed=costCurrency===shippingCurrency&&valid(p.cost)&&valid(p.shipping)?Math.round((p.cost+p.shipping)*100)/100:null;
 const mixed=costCurrency!==shippingCurrency||costCurrency!==currency;
 return {landed,currency:costCurrency,mixed,within20:landed!==null&&costCurrency==='USD'?landed<=20:null,markup:!mixed&&landed!==null&&landed>0&&valid(p.price)?p.price/landed:null,margin:unitMargin(p)};
}
export function profileCandidate(product:LabRecord,records:LabRecord[]){const o=product.data.researchOrigin;return o?records.find(r=>r.kind==='research_batch'&&r.id===o.batchId)?.data.candidates?.find((c:any)=>c.id===o.candidateId)??null:null;}
