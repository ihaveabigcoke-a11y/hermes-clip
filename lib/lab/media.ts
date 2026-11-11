import type { MediaMetadata } from "./production";

// Container inspection, not a claim of full video/frame decoding.
export function inspectMedia(bytes: Uint8Array, type: string): MediaMetadata | null {
  const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=bytes.length;
  const u32=(o:number)=>{if(o<0||o+4>n)throw new Error("File bị cắt hoặc cấu trúc không hợp lệ.");return dv.getUint32(o);};
  const ascii=(o:number,l:number)=>new TextDecoder().decode(bytes.slice(o,o+l));
  const result=(width:number,height:number,duration:number|null):MediaMetadata=>{
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>32768||height>32768||(duration!==null&&(!Number.isFinite(duration)||duration<=0||duration>7200)))throw new Error("Không đọc được kích thước/thời lượng hợp lệ của file.");
    return {width,height,duration,verifiedBy:"container"};
  };
  if(type==="image/png"){
    if(n<45||u32(8)!==13||ascii(12,4)!=="IHDR")throw new Error("PNG thiếu header hợp lệ.");
    let o=8,end=false,data=false;
    while(o+12<=n){const len=u32(o),tag=ascii(o+4,4);if(o+12+len>n)throw new Error("PNG bị cắt.");if(tag==="IDAT"&&len)data=true;o+=12+len;if(tag==="IEND"){end=true;break;}}
    if(!end||!data)throw new Error("PNG thiếu dữ liệu ảnh hoặc IEND.");
    return result(u32(16),u32(20),null);
  }
  if(type==="image/jpeg"){
    if(n<10||bytes[n-2]!==0xff||bytes[n-1]!==0xd9)throw new Error("JPEG bị cắt.");
    let o=2;
    while(o+4<n){if(bytes[o]!==0xff)break;const tag=bytes[o+1];if(tag===0xda)break;if(tag===0xd8||tag===0x01||(tag>=0xd0&&tag<=0xd7)){o+=2;continue;}const len=dv.getUint16(o+2);if(len<2||o+len+2>n)throw new Error("JPEG có segment lỗi.");if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(tag)){if(len<8)break;return result(dv.getUint16(o+7),dv.getUint16(o+5),null);}o+=len+2;}
    throw new Error("Không đọc được kích thước JPEG.");
  }
  if(type==="image/webp"){
    if(n<30||dv.getUint32(4,true)+8!==n)throw new Error("WebP bị cắt hoặc header sai.");
    const kind=ascii(12,4),le24=(o:number)=>bytes[o]+bytes[o+1]*256+bytes[o+2]*65536;
    if(kind==="VP8X")return result(1+le24(24),1+le24(27),null);
    if(kind==="VP8 "&&bytes[23]===0x9d&&bytes[24]===0x01&&bytes[25]===0x2a)return result(dv.getUint16(26,true)&0x3fff,dv.getUint16(28,true)&0x3fff,null);
    if(kind==="VP8L"&&bytes[20]===0x2f){const v=dv.getUint32(21,true);return result((v&0x3fff)+1,((v>>>14)&0x3fff)+1,null);}
    throw new Error("WebP không hỗ trợ hoặc thiếu kích thước.");
  }
  if(type!=="video/mp4")return null;
  type Atom={tag:string;p:number;end:number};
  const atoms=(from:number,to:number):Atom[]=>{
    const out:Atom[]=[];let o=from,count=0;
    while(o+8<=to){if(++count>5000)throw new Error("MP4 có quá nhiều atom.");let size=u32(o),header=8;if(size===1){if(o+16>to)throw new Error("MP4 bị cắt.");const wide=dv.getBigUint64(o+8);if(wide>BigInt(n))throw new Error("MP4 atom quá lớn.");size=Number(wide);header=16;}else if(size===0)size=to-o;if(size<header||o+size>to)throw new Error("MP4 có atom lỗi.");out.push({tag:ascii(o+4,4),p:o+header,end:o+size});o+=size;}
    if(o!==to)throw new Error("MP4 có phần cuối không hợp lệ.");return out;
  };
  const root=atoms(0,n),moov=root.find(a=>a.tag==="moov");
  if(!root.some(a=>a.tag==="ftyp")||!root.some(a=>a.tag==="mdat"&&a.end>a.p)||!moov)throw new Error("MP4 thiếu ftyp, moov hoặc dữ liệu video.");
  const children=atoms(moov.p,moov.end),mvhd=children.find(a=>a.tag==="mvhd");
  if(!mvhd)throw new Error("MP4 thiếu thời lượng.");
  const v=bytes[mvhd.p];if(v!==0&&v!==1)throw new Error("MP4 mvhd không hỗ trợ.");
  const scale=u32(mvhd.p+(v?20:12)),duration=v?Number(dv.getBigUint64(mvhd.p+24)):u32(mvhd.p+16);
  for(const trak of children.filter(a=>a.tag==="trak")){
    const cs=atoms(trak.p,trak.end),tkhd=cs.find(a=>a.tag==="tkhd"),mdia=cs.find(a=>a.tag==="mdia");if(!tkhd||!mdia)continue;
    const handler=atoms(mdia.p,mdia.end).find(a=>a.tag==="hdlr");if(!handler||ascii(handler.p+8,4)!=="vide")continue;
    if(tkhd.end-tkhd.p<84)throw new Error("MP4 track bị cắt.");
    let width=u32(tkhd.end-8)/65536,height=u32(tkhd.end-4)/65536;
    const matrix=tkhd.p+(bytes[tkhd.p]===1?52:40);
    if(dv.getInt32(matrix)===0&&dv.getInt32(matrix+16)===0&&dv.getInt32(matrix+4)!==0&&dv.getInt32(matrix+12)!==0)[width,height]=[height,width];
    // Track display dimensions use 16.16 fixed point and can be fractional
    // after sample-aspect-ratio scaling. Round to display pixels.
    return result(Math.round(width),Math.round(height),duration/scale);
  }
  throw new Error("MP4 không có video track hợp lệ.");
}
