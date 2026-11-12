import type {Take} from '@/lib/lab/production';

export function CompressionNote({take}:{take:Pick<Take,'compression'>}) {
  const c=take.compression;if(!c)return null;
  const mb=(bytes:number)=>(bytes/1024**2).toLocaleString('vi-VN',{minimumFractionDigits:1,maximumFractionDigits:1});
  return <p data-testid="compression-note"><small>{c.mode==='original'?`Giữ bản nhỏ nhất: ${mb(c.size)} MB`:`Đã nén: ${mb(c.sourceSize)} MB → ${mb(c.size)} MB`}{c.overLimit&&<><br/>Vượt 6 MB để giữ chất lượng ({mb(c.size)} MB)</>}</small></p>;
}
