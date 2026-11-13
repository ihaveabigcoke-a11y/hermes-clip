"use client";
import {useEffect, useState} from 'react';
import {FileText,Play} from 'lucide-react';
import {type Take} from '@/lib/lab/production';

export function MediaPlayer({take}: {take: Take}) {
  const [error, setError] = useState(false);
  useEffect(() => setError(false), [take.assetId]);
  if (error) return <p className="media-unavailable" role="alert">Không đọc được file. Kiểm tra kết nối không gian làm việc rồi mở lại.</p>;
  return take.type.startsWith('video/')
    ? <video key={take.assetId} src={`/api/assets/${take.assetId}`} poster={`/api/assets/${take.assetId}?thumbnail=1`} controls playsInline preload="metadata" aria-label={`Xem trước ${take.name}`} onError={() => setError(true)}/>
    : <img src={`/api/assets/${take.assetId}`} alt={take.name} onError={() => setError(true)}/>;
}

export function MediaThumbnail({take}: {take: Take}) {
  const [error, setError] = useState(false);
  useEffect(() => setError(false), [take.assetId]);
  if (error) return <span className="thumbnail-error" role="img" aria-label="Mở chi tiết để kiểm tra file"><FileText size={22}/></span>;
  return take.type.startsWith('video/')
    ? <img src={`/api/assets/${take.assetId}?thumbnail=1`} loading="lazy" alt="Ảnh xem trước video" onError={() => setError(true)}/>
    : <img src={`/api/assets/${take.assetId}`} alt="" loading="lazy" onError={() => setError(true)}/>;
}

// Lists render a small JPEG. The original video is requested only on click.
export function VideoOnDemand({assetId,name}:{assetId:string;name:string}) {
  const [playing,setPlaying]=useState(false);
  useEffect(()=>setPlaying(false),[assetId]);
  return playing?<video src={`/api/assets/${assetId}`} controls autoPlay playsInline preload="none" aria-label={name}/>
    :<button type="button" className="media-load-button" onClick={()=>setPlaying(true)} aria-label={`Phát video ${name}`}><img src={`/api/assets/${assetId}?thumbnail=1`} loading="lazy" alt=""/><span><Play size={24} fill="currentColor"/><span className="sr-only">Phát video</span></span></button>;
}
