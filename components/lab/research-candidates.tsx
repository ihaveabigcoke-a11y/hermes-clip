"use client";
import {useState} from 'react';
import {ExternalLink,Pencil,ImageOff} from 'lucide-react';
import {type LabRecord,formatMoney} from '@/lib/lab/domain';
import {type ResearchBatch,type Candidate,researchProductId,candidateCurrency} from '@/lib/lab/operations';
import {annotateResearchQuality,sharedSourceWarning,pageLevelEvidenceWarning} from '@/lib/lab/research-quality';
import {researchCoverage,landedCostBadge,researchRisks,logisticsLabels} from '@/lib/lab/research-view';
import {Badge,Button,Empty,Modal} from './primitives';
import {SourceCheckControls,SourceChip,ShortsSignal,SourceDetails} from './research-sources';
import {ProductCheck,RetailMarkup} from './product-check';
type Props={record:LabRecord;records:LabRecord[];disabled:boolean;onEdit:(candidate:Candidate)=>void;onSelect:(candidate:Candidate,checked:boolean)=>void};
function ProductPhoto({candidate}:{candidate:Candidate}){
  const [failed,setFailed]=useState(false);
  return candidate.imageUrl&&!failed?<img className="research-product-photo" src={candidate.imageUrl} referrerPolicy="no-referrer" loading="lazy" alt={candidate.name} onError={()=>setFailed(true)}/>:<span className="research-photo-empty"><ImageOff size={21}/><small>{failed?'Ảnh nguồn không tải được':'Chưa có ảnh nguồn'}</small></span>;
}
const metricNumber=(value:number)=>new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2}).format(value);
const verdictLabel=(value:Candidate['verdict'])=>value?({try:'Thử',hold:'Giữ',reject:'Loại'}[value]):'Chưa đánh giá';
const matchLabel=(value:Candidate['matchType'])=>value?({exact_sku:'Đúng SKU',similar:'Tương tự',unknown:'Chưa rõ'}[value]):'Chưa rõ';
function EvidenceTable({candidate}:{candidate:Candidate}){
 const metrics=candidate.marketEvidence??[];
 return metrics.length?<div className="operations-table-scroll" role="region" aria-label="Số liệu thị trường và nguồn" tabIndex={0}><table className="operations-comparison research-evidence-table"><caption>Số liệu nghiên cứu từ nguồn · cần đối chiếu trước quyết định thương mại</caption><thead><tr><th scope="col">Chỉ số</th><th scope="col">Giá trị</th><th scope="col">Phạm vi / kỳ đo</th><th scope="col">Nguồn / ngày đọc</th></tr></thead><tbody>{metrics.map((m,i)=><tr key={i}><th scope="row">{m.label}{m.pageLevel&&<small>{pageLevelEvidenceWarning}</small>}</th><td className="numeric">{metricNumber(m.value)} {m.unit}</td><td>{m.market||'Chưa rõ thị trường'}<small>{m.period||'Chưa rõ kỳ đo'}</small></td><td><a href={m.sourceUrl} target="_blank" rel="noreferrer">{new URL(m.sourceUrl).hostname}<ExternalLink size={13}/></a><small>{new Date(m.observedAt).toLocaleDateString('vi-VN')}</small></td></tr>)}</tbody></table></div>:<p className="info-panel">Chưa có số liệu thị trường có nguồn cho sản phẩm này. Giá bán giả định không phải bằng chứng về nhu cầu.</p>;
}
export default function ResearchCandidates({record,records,disabled,onEdit,onSelect}:Props){
  const savedBatch=record.data as ResearchBatch;
  const batch={...savedBatch,candidates:annotateResearchQuality(savedBatch.candidates)};
  const [detailId,setDetailId]=useState('');
  const [checkId,setCheckId]=useState('');
  const [selectedOnly,setSelectedOnly]=useState(false);
  const detail=batch.candidates.find(c=>c.id===detailId);
  const checkCandidate=batch.candidates.find(c=>c.id===checkId);
  const ceilingUsd=batch.maxLandedCostUsd??20;
  const selected=batch.candidates.filter(c=>batch.selectedIds.includes(c.id));
  const candidates=selectedOnly?selected:batch.candidates;
  const coverage=researchCoverage(batch.candidates);
  const productFor=(c:Candidate)=>records.find(r=>r.id===researchProductId(record.id,c.id));
  const price=(candidate:Candidate,key:'cost'|'price'|'shipping')=>candidate[key]==null?'Chưa biết':formatMoney(candidate[key]!,candidateCurrency(candidate,key));
  return <section className="research-comparison" aria-label="So sánh ứng viên sản phẩm">
    <SourceCheckControls batchId={record.id} disabled={disabled}/>
    <div className="research-data-coverage" aria-label="Độ đầy đủ của nghiên cứu">
      <span>Có giá vốn <strong>{coverage.cost}/{coverage.total}</strong></span><span>Có ship <strong>{coverage.shipping}/{coverage.total}</strong></span><span>Đúng SKU <strong>{coverage.exactSku}/{coverage.total}</strong></span><span>Có listing riêng <strong>{coverage.individualListing}/{coverage.total}</strong></span><span>Có chỉ số không phải cấp trang <strong>{coverage.productMetrics}/{coverage.total}</strong></span>
      <small>Listing riêng theo dạng URL hoặc lần đọc nguồn; chưa xác nhận báo giá. Chỉ đếm chỉ số có nguồn, ngày đọc và kỳ đo. Đối chiếu trên toàn bộ đợt.</small>
    </div>
    <div className="research-selection-bar"><div><strong>Chọn 3 sản phẩm để thử</strong><p>{selected.length?selected.map(c=>c.name).join(' · '):'Chưa chọn sản phẩm. Xem nguồn và điều kiện trước khi chọn.'}</p></div>
      <div className="queue-filters" role="group" aria-label="Lọc ứng viên"><button type="button" aria-pressed={!selectedOnly} onClick={()=>setSelectedOnly(false)}>Tất cả <span>{batch.candidates.length}</span></button><button type="button" aria-pressed={selectedOnly} onClick={()=>setSelectedOnly(true)}>Đã chọn <span>{selected.length}/3</span></button></div>
    </div>
    <p className="research-selection-note">Tick chọn sẽ tạo hồ sơ sản phẩm. Bỏ tick chỉ bỏ chọn · Hồ sơ vẫn giữ.</p>
    {candidates.length?<div className="operations-table-scroll" role="region" aria-label="Bảng 10 ứng viên" tabIndex={0}>
      <table className="operations-comparison research-candidate-table"><caption className="sr-only">Ứng viên nguồn hàng để chọn tối đa ba sản phẩm, giá bán chỉ là giả thuyết.</caption>
        <colgroup>{[42,292,90,178,170,108,150,145,90,240,150].map((width,index)=><col key={index} style={{width}}/>)}</colgroup>
        <thead><tr><th scope="col">Chọn</th><th scope="col">Sản phẩm / nguồn</th><th scope="col">Đối chiếu SKU</th><th scope="col">Giá vốn + ship</th><th scope="col">Bán lẻ Mỹ → vốn tối đa</th><th scope="col">Giá bán giả định</th><th scope="col">Cảnh kết quả</th><th scope="col">Cờ rủi ro</th><th scope="col">Thử / giữ / loại</th><th scope="col">Chất lượng nguồn</th><th scope="col">Chi tiết</th></tr></thead>
        <tbody>{candidates.map(candidate=>{const checked=batch.selectedIds.includes(candidate.id),cost=landedCostBadge(candidate),product=productFor(candidate);return <tr key={candidate.id} className={checked?'is-selected':''}>
          <td><input type="checkbox" aria-label={'Chọn '+candidate.name} checked={checked} disabled={disabled||!checked&&selected.length>=3} onChange={event=>onSelect(candidate,event.target.checked)}/></td>
          <th scope="row"><div className="research-product-cell"><button type="button" className="research-photo-button" onClick={()=>setDetailId(candidate.id)} aria-label={'Xem ảnh và số liệu '+candidate.name}><ProductPhoto key={candidate.imageUrl||candidate.id} candidate={candidate}/></button><div><span className="research-product-name" title={candidate.name}>{candidate.name}</span>{candidate.supplierUrl?<a className="research-source-link" href={candidate.supplierUrl} target="_blank" rel="noreferrer" title={candidate.supplierUrl}>{new URL(candidate.supplierUrl).hostname} <ExternalLink size={13}/></a>:<small>Chưa có listing</small>}{candidate.source&&<small>{candidate.source}</small>}{product?<small>{checked?'Hồ sơ đã tạo':'Hồ sơ vẫn giữ'}</small>:checked?<button type="button" className="comparison-name research-retry" disabled={disabled} onClick={()=>onSelect(candidate,true)}>Hoàn tất chọn</button>:null}</div></div></th>
          <td>{matchLabel(candidate.matchType)}</td>
          <td className="numeric"><span title={cost.explanation}><Badge tone={cost.tone}>{cost.label}</Badge></span><small>Vốn: {price(candidate,'cost')}</small><small>Ship: {price(candidate,'shipping')}</small><small>{cost.amount==null?cost.explanation:'Tổng: '+formatMoney(cost.amount,cost.currency!)}</small></td>
          <td className="numeric research-retail-cell"><RetailMarkup candidate={candidate} ceilingUsd={ceilingUsd}/></td>
          <td className="numeric">{price(candidate,'price')}</td>
          <td><p className="research-payoff" title={candidate.visualPayoff||'Chưa xác định'}>{candidate.visualPayoff||'Chưa xác định'}</p></td>
          <td><div className="research-risk-chips">{researchRisks(candidate).map(label=><span key={label}>{label}</span>)}</div></td>
          <td><span title={candidate.verdictReason||'Chưa có lý do đề xuất'}><Badge tone={candidate.verdict==='reject'?'error':'neutral'}>{verdictLabel(candidate.verdict)}</Badge></span></td>
          <td className="research-quality-cell"><SourceChip candidate={candidate}/>{candidate.qualityWarnings?.includes('shared_supplier_url')&&<small className="research-warning" title={sharedSourceWarning}>{sharedSourceWarning}</small>}{candidate.marketEvidence?.some(m=>m.pageLevel)&&<small className="research-warning" title={pageLevelEvidenceWarning}>{pageLevelEvidenceWarning}</small>}<div className="research-shorts" title="Tín hiệu YouTube tương tự; xem nguồn và kỳ đo trong chi tiết"><ShortsSignal candidate={candidate}/></div></td>
          <td><Button tone="neutral" onClick={()=>setDetailId(candidate.id)} aria-label={'Xem nguồn và điều kiện '+candidate.name}>Xem</Button><Button tone="ghost" onClick={()=>setCheckId(candidate.id)} aria-label={'Kiểm sản phẩm '+candidate.name}>Kiểm sản phẩm</Button></td>
        </tr>;})}</tbody>
      </table>
    </div>:<Empty title={selectedOnly?'Chưa chọn ứng viên':'Đang chờ danh sách ứng viên'} text={selectedOnly?'Mở Tất cả rồi chọn tối đa 3 sản phẩm.':'Copy prompt research rồi nhập JSON để lưu danh sách tại đây.'}/>}
    <p className="instagram-data-note">Giá vốn có thể yêu cầu mua nhiều sản phẩm. Mở chi tiết để xem số lượng tối thiểu và điều kiện nguồn hàng. Chưa xác nhận phí giao tới Mỹ hoặc lợi nhuận.</p>
    <Modal open={!!checkCandidate} title={'Kiểm sản phẩm · '+(checkCandidate?.name??'')} description="Đã quan sát / Suy luận / Chưa biết" onClose={()=>setCheckId('')}>
      {checkCandidate&&<div className="modal-body research-candidate-detail"><ProductCheck key={checkCandidate.id} candidate={checkCandidate} ceilingUsd={ceilingUsd}/><div className="button-row"><Button tone="neutral" disabled={disabled} onClick={()=>{setCheckId('');onEdit(checkCandidate);}}>Sửa ứng viên</Button></div></div>}
    </Modal>
    <Modal open={!!detail} title={detail?.name??''} description="Nguồn hàng, giả thuyết nội dung và điều cần xác minh" onClose={()=>setDetailId('')}>
      {detail&&<div className="modal-body research-candidate-detail"><Badge>{batch.selectedIds.includes(detail.id)?'Đã chọn để thử':'Ứng viên · chờ chọn'}</Badge>
        {detail.qualityWarnings?.includes('shared_supplier_url')&&<p className="info-panel">{sharedSourceWarning}</p>}
        <h3>Đề xuất và mức đối chiếu</h3><p>{verdictLabel(detail.verdict)} · {matchLabel(detail.matchType)}</p><p>{detail.verdictReason||'Chưa có lý do đề xuất.'}</p>
        <div className="research-detail-lead"><ProductPhoto key={detail.imageUrl||detail.id} candidate={detail}/><div><h3>Khách hàng tiềm năng</h3><p>{detail.targetCustomer||'Chưa xác định từ nguồn.'}</p><h3>Đánh giá tiềm năng</h3><p>{detail.marketAssessment||'Chưa đủ số liệu để đánh giá thị trường Mỹ.'}</p>{detail.imageSourceUrl&&<a href={detail.imageSourceUrl} target="_blank" rel="noreferrer">Nguồn ảnh <ExternalLink size={14}/></a>}</div></div>
        <EvidenceTable candidate={detail}/><SourceDetails candidate={detail}/>
        <dl className="preview-facts"><div><dt>Giá vốn tham khảo</dt><dd>{price(detail,'cost')}</dd></div><div><dt>Phí giao hàng</dt><dd>{price(detail,'shipping')}</dd></div><div><dt>Giá bán giả định</dt><dd>{price(detail,'price')}</dd></div><div><dt>Số lượng tối thiểu (MOQ)</dt><dd>{detail.minimumOrder??'Chưa biết'}</dd></div><div><dt>Quốc gia nguồn hàng</dt><dd>{detail.supplierCountry||'Chưa xác minh'}</dd></div></dl>
        <h3>Ý tưởng video thử</h3><p>{detail.contentAngle||'Chưa có ý tưởng.'}</p>
        <h3>Khung hình kết quả</h3><p>{detail.visualPayoff||'Chưa xác định cảnh kết quả quay được.'}</p>
        <h3>Chi tiết AI dễ làm sai</h3><p>{detail.aiFidelityRisks?.length?detail.aiFidelityRisks.join(' · '):'Chưa đánh giá.'}</p>
        <h3>Vận chuyển và độ phù hợp</h3><dl className="preview-facts">{Object.entries(logisticsLabels).map(([key,label])=>{const flag=detail.logisticsFlags?.[key as keyof typeof logisticsLabels];return <div key={key}><dt>{label}</dt><dd>{flag==null?'Chưa rõ':flag?'Có rủi ro':'Không ghi nhận'}</dd></div>;})}</dl>
        <h3>Cạnh tranh quan sát trên web</h3><dl className="preview-facts"><div><dt>Quảng cáo đang chạy đã thấy</dt><dd>{detail.competition?.activeAdsObserved==null?'Chưa biết':metricNumber(detail.competition.activeAdsObserved)}</dd></div><div><dt>Reels tương tự trong 30 ngày</dt><dd>{detail.competition?.similarReels30d==null?'Chưa biết':metricNumber(detail.competition.similarReels30d)}</dd></div></dl>
        <p>{detail.competition?.observedAt?'Ngày quan sát: '+new Date(detail.competition.observedAt).toLocaleString('vi-VN'):'Chưa rõ ngày quan sát.'}</p>
        {detail.competition?.sourceUrl&&<a href={detail.competition.sourceUrl} target="_blank" rel="noreferrer">Nguồn cạnh tranh <ExternalLink size={14}/></a>}
        <p>{detail.competition?.note||'Chưa có ghi chú phạm vi quan sát.'}</p>
        {detail.importMetadata&&<details><summary>JSON gốc từ công cụ nghiên cứu</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{detail.importMetadata.rawJson}</pre></details>}{detail.listingStatus&&<p>Listing theo kết quả nhập: {detail.listingStatus} · cần đối chiếu nguồn.</p>}<details><summary>Ghi chú chi tiết tại nguồn</summary><p className="muse-chat-text">{detail.evidenceNotes}</p></details>{detail.supplierUrl&&<a href={detail.supplierUrl} target="_blank" rel="noreferrer">Mở nguồn hàng <ExternalLink size={14}/></a>}
        {detail.evidenceUrl&&<a href={detail.evidenceUrl} target="_blank" rel="noreferrer">Mở nguồn bổ sung <ExternalLink size={14}/></a>}
        <h3>Điều cần kiểm chứng</h3><p className="muse-chat-text">{detail.risks||'Chưa có ghi chú.'}</p>
        <div className="button-row"><Button disabled={disabled||!batch.selectedIds.includes(detail.id)&&selected.length>=3} onClick={()=>onSelect(detail,!batch.selectedIds.includes(detail.id))}>{batch.selectedIds.includes(detail.id)?'Bỏ chọn · hồ sơ vẫn giữ':'Chọn và tạo hồ sơ'}</Button>
          {batch.selectedIds.includes(detail.id)&&!productFor(detail)&&<Button tone="neutral" disabled={disabled} onClick={()=>onSelect(detail,true)}>Hoàn tất chọn</Button>}
          {productFor(detail)&&<span>Hồ sơ vẫn giữ</span>}
          <Button tone="ghost" disabled={disabled} onClick={()=>{setDetailId('');onEdit(detail);}}><Pencil size={16}/>Sửa ứng viên</Button></div>
      </div>}
    </Modal>
  </section>;
}
