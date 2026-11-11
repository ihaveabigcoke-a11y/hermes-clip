"use client";
import {useState} from 'react';
import {ExternalLink,Pencil,ImageOff} from 'lucide-react';
import {type LabRecord,formatMoney} from '@/lib/lab/domain';
import {type ResearchBatch,type Candidate,researchProductId} from '@/lib/lab/operations';
import {Badge,Button,Empty,Modal} from './primitives';
type Props={record:LabRecord;records:LabRecord[];disabled:boolean;onEdit:(candidate:Candidate)=>void;onSelect:(candidate:Candidate)=>void;onPromote:(candidate:Candidate)=>void};
function ProductPhoto({candidate}:{candidate:Candidate}){
  const [failed,setFailed]=useState(false);
  return candidate.imageUrl&&!failed?<img className="research-product-photo" src={candidate.imageUrl} referrerPolicy="no-referrer" loading="lazy" alt={candidate.name} onError={()=>setFailed(true)}/>:<span className="research-photo-empty"><ImageOff size={21}/><small>{failed?'Ảnh nguồn không tải được':'Chưa có ảnh nguồn'}</small></span>;
}
const metricNumber=(value:number)=>new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2}).format(value);
function EvidenceTable({candidate}:{candidate:Candidate}){
 const metrics=candidate.marketEvidence??[];
 return metrics.length?<div className="operations-table-scroll" role="region" aria-label="Số liệu thị trường và nguồn" tabIndex={0}><table className="operations-comparison research-evidence-table"><caption>Số liệu Muse đọc từ nguồn · cần đối chiếu trước quyết định thương mại</caption><thead><tr><th scope="col">Chỉ số</th><th scope="col">Giá trị</th><th scope="col">Phạm vi / kỳ đo</th><th scope="col">Nguồn / ngày đọc</th></tr></thead><tbody>{metrics.map((m,i)=><tr key={i}><th scope="row">{m.label}</th><td className="numeric">{metricNumber(m.value)} {m.unit}</td><td>{m.market||'Chưa rõ thị trường'}<small>{m.period||'Chưa rõ kỳ đo'}</small></td><td><a href={m.sourceUrl} target="_blank" rel="noreferrer">{new URL(m.sourceUrl).hostname}<ExternalLink size={13}/></a><small>{new Date(m.observedAt).toLocaleDateString('vi-VN')}</small></td></tr>)}</tbody></table></div>:<p className="info-panel">Chưa có số liệu thị trường có nguồn cho sản phẩm này. Giá bán giả định không phải bằng chứng về nhu cầu.</p>;
}
export default function ResearchCandidates({record,records,disabled,onEdit,onSelect,onPromote}:Props){
  const batch=record.data as ResearchBatch;
  const [detailId,setDetailId]=useState('');
  const [selectedOnly,setSelectedOnly]=useState(false);
  const detail=batch.candidates.find(c=>c.id===detailId);
  const selected=batch.candidates.filter(c=>batch.selectedIds.includes(c.id));
  const candidates=selectedOnly?selected:batch.candidates;
  const productFor=(c:Candidate)=>records.find(r=>r.id===researchProductId(record.id,c.id));
  const price=(candidate:Candidate,key:'cost'|'price'|'shipping')=>candidate[key]===null?'Chưa biết':formatMoney(candidate[key]!,candidate.currency);
  return <section className="research-comparison" aria-label="So sánh ứng viên sản phẩm">
    <div className="research-data-coverage" aria-label="Độ đầy đủ của nghiên cứu"><span><strong>{batch.candidates.length}</strong> ứng viên</span><span><strong>{batch.candidates.filter(c=>c.imageUrl).length}/{batch.candidates.length}</strong> có link ảnh nguồn</span><span><strong>{batch.candidates.filter(c=>c.marketEvidence?.length).length}/{batch.candidates.length}</strong> có chỉ số kèm nguồn</span><small>Số liệu Muse thu thập · không phải dự báo doanh thu</small></div>
    <div className="research-selection-bar"><div><strong>Chọn 3 sản phẩm để thử</strong><p>{selected.length?selected.map(c=>c.name).join(' · '):'Chưa chọn sản phẩm. Xem nguồn và điều kiện trước khi chọn.'}</p></div>
      <div className="queue-filters" role="group" aria-label="Lọc ứng viên"><button type="button" aria-pressed={!selectedOnly} onClick={()=>setSelectedOnly(false)}>Tất cả <span>{batch.candidates.length}</span></button><button type="button" aria-pressed={selectedOnly} onClick={()=>setSelectedOnly(true)}>Đã chọn <span>{selected.length}/3</span></button></div>
    </div>
    {candidates.length?<div className="operations-table-scroll" role="region" aria-label="Bảng 10 ứng viên" tabIndex={0}>
      <table className="operations-comparison research-candidate-table"><caption className="sr-only">Ứng viên nguồn hàng để chọn tối đa ba sản phẩm, giá bán chỉ là giả thuyết.</caption>
        <thead><tr><th scope="col">Chọn</th><th scope="col">Sản phẩm / ảnh nguồn</th><th scope="col">Giá vốn / MOQ</th><th scope="col">Giá bán giả định</th><th scope="col">Tín hiệu thị trường</th><th scope="col">Tiềm năng / khách hàng</th><th scope="col">Chi tiết</th></tr></thead>
        <tbody>{candidates.map(candidate=>{const checked=batch.selectedIds.includes(candidate.id);return <tr key={candidate.id} className={checked?'is-selected':''}>
          <td><input type="checkbox" aria-label={'Chọn '+candidate.name} checked={checked} disabled={disabled||!checked&&selected.length>=3} onChange={()=>onSelect(candidate)}/></td>
          <th scope="row"><div className="research-product-cell"><button type="button" className="research-photo-button" onClick={()=>setDetailId(candidate.id)} aria-label={'Xem ảnh và số liệu '+candidate.name}><ProductPhoto key={candidate.imageUrl||candidate.id} candidate={candidate}/></button><div><button className="comparison-name" type="button" onClick={()=>setDetailId(candidate.id)}>{candidate.name}</button><small>{candidate.supplierCountry||'Chưa xác minh quốc gia'}</small><a href={candidate.supplierUrl} target="_blank" rel="noreferrer">{new URL(candidate.supplierUrl).hostname} <ExternalLink size={13}/></a></div></div></th>
          <td className="numeric">{price(candidate,'cost')}<small>MOQ: {candidate.minimumOrder??'Chưa biết'}</small><small>Ship: {price(candidate,'shipping')}</small></td><td className="numeric">{price(candidate,'price')}<small>Chưa tính lợi nhuận</small></td>
          <td>{candidate.marketEvidence?.length?candidate.marketEvidence.slice(0,2).map((m,i)=><div className="research-signal" key={i}><span className="numeric">{metricNumber(m.value)} {m.unit}</span><small>{m.label}</small><a href={m.sourceUrl} target="_blank" rel="noreferrer">Nguồn <ExternalLink size={12}/></a></div>):<span className="muted">Chưa có số liệu</span>}</td>
          <td><p className="comparison-excerpt">{candidate.targetCustomer||'Chưa phân tích khách hàng'}</p><button type="button" className="comparison-name" onClick={()=>setDetailId(candidate.id)}>Xem phân tích</button></td>
          <td><Button tone="neutral" onClick={()=>setDetailId(candidate.id)} aria-label={'Xem nguồn và điều kiện '+candidate.name}>Xem</Button></td>
        </tr>;})}</tbody>
      </table>
    </div>:<Empty title={selectedOnly?'Chưa chọn ứng viên':'Đang chờ danh sách ứng viên'} text={selectedOnly?'Mở Tất cả rồi chọn tối đa 3 sản phẩm.':'Dùng Nghiên cứu bằng Muse để tìm nguồn và lưu danh sách tại đây.'}/>}
    <p className="instagram-data-note">Giá vốn có thể yêu cầu mua nhiều sản phẩm. Mở chi tiết để xem số lượng tối thiểu và điều kiện nguồn hàng. Chưa xác nhận phí giao tới Mỹ hoặc lợi nhuận.</p>
    <Modal open={!!detail} title={detail?.name??''} description="Nguồn hàng, giả thuyết nội dung và điều cần xác minh" onClose={()=>setDetailId('')}>
      {detail&&<div className="modal-body research-candidate-detail"><Badge>{batch.selectedIds.includes(detail.id)?'Đã chọn để thử':'Ứng viên · chờ chọn'}</Badge>
        <div className="research-detail-lead"><ProductPhoto key={detail.imageUrl||detail.id} candidate={detail}/><div><h3>Khách hàng tiềm năng</h3><p>{detail.targetCustomer||'Chưa xác định từ nguồn.'}</p><h3>Đánh giá tiềm năng</h3><p>{detail.marketAssessment||'Chưa đủ số liệu để đánh giá thị trường Mỹ.'}</p>{detail.imageSourceUrl&&<a href={detail.imageSourceUrl} target="_blank" rel="noreferrer">Nguồn ảnh <ExternalLink size={14}/></a>}</div></div>
        <EvidenceTable candidate={detail}/>
        <dl className="preview-facts"><div><dt>Giá vốn tham khảo</dt><dd>{price(detail,'cost')}</dd></div><div><dt>Phí giao hàng</dt><dd>{price(detail,'shipping')}</dd></div><div><dt>Giá bán giả định</dt><dd>{price(detail,'price')}</dd></div></dl>
        <h3>Ý tưởng video thử</h3><p>{detail.contentAngle||'Chưa có ý tưởng.'}</p>
        <details><summary>Ghi chú chi tiết tại nguồn</summary><p className="muse-chat-text">{detail.evidenceNotes}</p></details><a href={detail.supplierUrl} target="_blank" rel="noreferrer">Mở nguồn hàng <ExternalLink size={14}/></a>
        {detail.evidenceUrl&&<a href={detail.evidenceUrl} target="_blank" rel="noreferrer">Mở nguồn bổ sung <ExternalLink size={14}/></a>}
        <h3>Điều cần kiểm chứng</h3><p className="muse-chat-text">{detail.risks||'Chưa có ghi chú.'}</p>
        <div className="button-row"><Button disabled={disabled||!batch.selectedIds.includes(detail.id)&&selected.length>=3} onClick={()=>onSelect(detail)}>{batch.selectedIds.includes(detail.id)?'Bỏ chọn sản phẩm':'Chọn để thử content'}</Button>
          <Button tone="neutral" disabled={disabled||!batch.selectedIds.includes(detail.id)||!!productFor(detail)} onClick={()=>onPromote(detail)}>{productFor(detail)?'Đã có hồ sơ sản phẩm':'Tạo hồ sơ sản phẩm'}</Button>
          <Button tone="ghost" disabled={disabled} onClick={()=>{setDetailId('');onEdit(detail);}}><Pencil size={16}/>Sửa ứng viên</Button></div>
      </div>}
    </Modal>
  </section>;
}
