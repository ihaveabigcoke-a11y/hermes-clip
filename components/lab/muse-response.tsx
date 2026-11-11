import {structuredMuseResponse} from '@/lib/lab/media-catalog';

const fields: Record<string, string> = {hook: "Mở đầu", prompt: 'Prompt', script: 'Kịch bản', caption: "Chú thích", contentAngle: 'Hướng nội dung', evidenceNotes: 'Bằng chứng nguồn', risks: 'Điểm cần kiểm tra', description: 'Mô tả', benefits: 'Lợi ích', limitations: 'Giới hạn'};

export default function MuseResponse({text}: {text: string}) {
  const data = structuredMuseResponse(text);
  const cards = data && (Array.isArray(data.items) ? data.items : Array.isArray(data.candidates) ? data.candidates : [data])
    .filter(item => item && typeof item === 'object' && !Array.isArray(item));
  const supported = cards?.some(item => item && Object.keys(fields).some(key => typeof item[key] === 'string'));
  if (!supported) return <p className="muse-chat-text">{text}</p>;
  return <div className="muse-result-cards">
    {typeof data?.summary === 'string' && <p>{data.summary}</p>}
    {cards?.slice(0, 10).map((item, index) => <section className="muse-result-card" key={index}>
      <h4>{typeof item.name === 'string' ? item.name : typeof item.headline === 'string' ? item.headline : 'Nội dung Muse'}</h4>
      {Object.entries(fields).map(([key, label]) => typeof item[key] === 'string' && item[key] && <div key={key}>
        <strong>{label}</strong><p className="muse-chat-text">{item[key]}</p>
      </div>)}
    </section>)}
    <details><summary>Phản hồi gốc</summary><pre className="muse-chat-text">{text}</pre></details>
  </div>;
}
