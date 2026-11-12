// Synthetic only. No source URLs are fetched by T-005 tests.
export function t005Batch(schema) {
  return schema.parse({name:'T-005 · 10 sản phẩm kiểm thử', selectedIds:['candidate_1','candidate_2','candidate_3'],
    candidates:Array.from({length:10},(_,i)=>({id:`candidate_${i+1}`,name:['Đèn cảm biến tủ bếp','Con lăn gom lông thú','Giá đỡ điện thoại'][i]??`Ứng viên kiểm thử ${i+1}`,
      provider:'muse',supplierUrl:`https://supplier.example/item/${i+1}`,evidenceNotes:'E'.repeat(1500),risks:'R'.repeat(800),contentAngle:'A'.repeat(1200),
      cost:null,shipping:null,price:null,currency:'USD'}))});
}
