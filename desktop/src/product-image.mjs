import {lookup} from 'node:dns/promises';
import {get} from 'node:https';
import {isIP} from 'node:net';
const maxBytes=8*1024**2;
function isPublic(address){
  if(isIP(address)===4){const [a,b]=address.split('.').map(Number);return ![0,10,127].includes(a)&&a<224&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&(b===168||b===0))&&!(a===100&&b>=64&&b<=127)&&!(a===198&&(b===18||b===19));}
  // Restrict to globally routed IPv6; reject mapped IPv4 and local/link-local/multicast ranges.
  return isIP(address)===6&&/^[23][0-9a-f]{3}:/i.test(address)&&!/^2001:db8:/i.test(address);
}
async function fetchImage(value, redirects=0,deadline=Date.now()+45000){
  const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443')throw Error('Ảnh nguồn cần URL HTTPS công khai.');
  const addresses=await lookup(url.hostname,{all:true});if(!addresses.length||addresses.some(r=>!isPublic(r.address)))throw Error('Địa chỉ ảnh nguồn không phải mạng công khai.');
  const selected=addresses[0];
  const result=await new Promise((resolve,reject)=>{
    const req=get(url,{agent:false,autoSelectFamily:true,autoSelectFamilyAttemptTimeout:1000,lookup:(_host,options,callback)=>options.all?callback(null,addresses):callback(null,selected.address,selected.family)},response=>{
      if([301,302,303,307,308].includes(response.statusCode)){response.resume();resolve({location:response.headers.location});return;}
      if(response.statusCode!==200){response.resume();reject(Error('Không tải được ảnh nguồn (HTTP '+response.statusCode+').'));return;}
      let size=0;const chunks=[];
      response.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){response.destroy(Error('Ảnh tham chiếu vượt 8 MB.'));return;}chunks.push(chunk);});
      response.on('error',reject);response.on('end',()=>resolve({bytes:Buffer.concat(chunks)}));
    });
    const timer=setTimeout(()=>req.destroy(Object.assign(Error('Tải ảnh nguồn quá thời gian.'),{code:'ETIMEDOUT'})),Math.max(1,Math.min(20000,deadline-Date.now())));
    req.on('close',()=>clearTimeout(timer));req.on('error',reject);
  });
  if(result.location){if(redirects>=3)throw Error('Ảnh nguồn chuyển hướng quá nhiều.');return fetchImage(new URL(result.location,url).href,redirects+1,deadline);}
  if(!result.bytes?.length)throw Error('Ảnh nguồn rỗng.');return result.bytes;
}
export async function fetchProductImage(value){
  const deadline=Date.now()+45000;
  for(let attempt=0;attempt<2;attempt++)try{return await fetchImage(value,0,deadline);}catch(error){
    const network=error instanceof AggregateError||['ETIMEDOUT','ECONNRESET','EHOSTUNREACH','ENETUNREACH','ECONNREFUSED','EAI_AGAIN'].includes(error.code);
    if(!network)throw error;
    if(attempt===1||Date.now()>=deadline)throw Error('Chưa tải được ảnh nguồn vì kết nối mạng. Kiểm tra mạng rồi bấm Tiếp tục cùng đợt; chưa gửi video.',{cause:error});
  }
}
