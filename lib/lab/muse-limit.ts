const LIMIT_24H=/(video\s*(generation)?\s*limit|generation\s*limit|rate\s*limit|too\s+many\s+(video|request)|(?:limit|quota)[^.]{0,60}(?:24\s*(?:h|hours?)|past\s+day)|(?:24\s*(?:h|hours?)|past\s+day)[^.]{0,60}(?:limit|quota)|hết\s*giới\s*hạn[^.]{0,40}24|giới\s*hạn[^.]{0,40}24\s*giờ)/i;
export const MUSE_LIMIT_FALLBACK='Muse giới hạn video 24 giờ. Thử lại sau, không gửi lại ngay.';
export function isMuseVideoLimit(message: unknown): boolean {
  return typeof message==='string'&&LIMIT_24H.test(message);
}
const hhmm=(date: Date)=>`${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
/** Vietnamese label for Muse's 24h video limit; null when the message is something else. Never schedules a retry. */
export function museVideoLimitLabel(message: unknown, errorAt?: unknown, retryAt?: unknown): string|null {
  if(!isMuseVideoLimit(message))return null;
  const at=(v:unknown)=>{if(v==null||v==='')return null;const d=new Date(v as any);return Number.isFinite(d.getTime())?d:null;};
  const exact=at(retryAt),failed=at(errorAt);
  const when=exact??(failed?new Date(failed.getTime()+24*3600_000):null);
  return when?`Muse giới hạn video 24 giờ. Thử lại sau ${hhmm(when)}`:MUSE_LIMIT_FALLBACK;
}
