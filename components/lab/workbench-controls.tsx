"use client";
import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "./primitives";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";

/** Selection is scoped to an explicit complete bounded dataset, never all server results. */
export function useWorkbenchSelection(scope: string) {
  const [keys, setKeys] = useState<string[]>([]);
  useEffect(() => setKeys([]), [scope]);
  return { keys, setKeys, toggle: (id: string) => setKeys(v => v.includes(id) ? v.filter(x => x !== id) : [...v, id]), togglePage: (ids: string[]) => setKeys(v => ids.every(id => v.includes(id)) ? v.filter(id => !ids.includes(id)) : [...new Set([...v, ...ids])]) };
}
export function PageSelection({ids,selected,onToggle}:{ids:string[];selected:string[];onToggle:()=>void}) {
  const input=useRef<HTMLInputElement>(null),count=ids.filter(id=>selected.includes(id)).length,mixed=count>0&&count<ids.length;
  useEffect(()=>{if(input.current)input.current.indeterminate=mixed;},[mixed]);
  return <label><input ref={input} type="checkbox" disabled={!ids.length} checked={!!ids.length&&count===ids.length} aria-checked={mixed?"mixed":count===ids.length&&!!ids.length} onChange={onToggle}/>Chọn trang</label>;
}
export function RowActions({ name, actions }: { name: string; actions: { label: string; disabled?: boolean; run: () => void }[] }) {
  return <DropdownMenu><DropdownMenuTrigger className="lab-button ghost row-menu-trigger" aria-label={`Thao tác ${name}`}><MoreHorizontal size={17}/></DropdownMenuTrigger><DropdownMenuContent className="workbench-menu" align="end" collisionPadding={12}>{actions.map(a => <DropdownMenuItem key={a.label} disabled={a.disabled} onSelect={a.run}>{a.label}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>;
}
export async function downloadOwnedMedia(assetId: string, name: string, signal?: AbortSignal) {
  try {
  const r = await fetch(`/api/assets/${encodeURIComponent(assetId)}`, { signal: signal ? AbortSignal.any([signal,AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000), cache: "no-store" });
  if (!r.ok) throw new Error(r.status === 401 ? "Phiên đã hết hạn. Đăng nhập lại rồi tải file." : "Chưa tải được file. Kiểm tra kết nối rồi thử lại.");
  const blob = await r.blob();
  if (!blob.size) throw new Error("File nhận được rỗng. Chưa tải bản này.");
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch (e) {
    const name=(e as Error).name;
    if(name==="TimeoutError"||name==="AbortError")throw new Error("Tải file quá lâu hoặc đã hủy. Kiểm tra kết nối rồi thử lại.");
    if(e instanceof TypeError)throw new Error("Không kết nối được để tải file. Dữ liệu gốc vẫn giữ; thử lại khi có mạng.");
    throw e;
  }
}

export async function copyWorkbenchText(text: string) {
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
  const previous=document.activeElement as HTMLElement|null, input=document.createElement('textarea');
  input.value=text;input.style.position='fixed';input.style.opacity='0';document.body.appendChild(input);input.select();
  try { if(!document.execCommand('copy'))throw new Error('Không sao chép được. Chọn văn bản trong Prompt đầy đủ rồi nhấn Ctrl+C.'); }
  finally { input.remove();previous?.focus(); }
}
