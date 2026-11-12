export const skillProduct = {
  name:'Reflective strap',supplierUrl:'https://supplier.example/item/strap',supplierCountry:'China',listingStatus:'single',
  cost:12,costCurrency:'CNY',shipping:null,shippingCurrency:null,price:19,currency:'USD',minimumOrder:null,
  matchType:'similar',usRetail:{low:15,high:22,currency:'USD',sources:[{url:'https://retail.example/strap',price:15,title:'Generic strap',observedAt:'2026-11-12T00:00:00Z'}]},
  maxLandedForMarkup:{x3:6.33,x4:4.75,currency:'USD'},visualPayoff:'Visible reflection at dusk',aiFidelityRisks:['Small clasp'],
  logisticsFlags:['fragile'],competition:{activeAdsObserved:null,similarReels30d:null,observedAt:null,sourceUrl:null,note:'Not counted; manual checks needed'},
  verdict:'hold',verdictReason:'Need a US shipping quote',evidenceNotes:'Observed similar retail item. Exact SKU and shipping unknown.',
  supplierQuestions:['Confirm the exact SKU and MOQ.'],
};
export const researchResult = {summary:'Fixture research; no real sources opened.',candidates:Array.from({length:10},(_,index)=>({
  name:'Candidate '+index,supplierUrl:'https://supplier.example/item/'+index,evidenceNotes:'Fixture only; SKU and costs not verified.',
  cost:null,shipping:null,price:null,costCurrency:null,shippingCurrency:null,currency:'USD',
}))};
export const contentResult = {name:'Night walk',hook:'Seen at dusk',script:'Show the strap under a light.',caption:'A closer look.'};
export const landingResult = {headline:'Reflective strap',description:'See the details.',benefits:'Reflective material',limitations:'Shipping and inventory unknown.'};
