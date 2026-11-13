"use client";
import {ArrowUpRight} from 'lucide-react';
import {Hint,ProgressRing} from './visual';
import type {JourneyStep} from '@/lib/lab/product-next-step';
export function ProductNextStepCard({next}:{next:JourneyStep}) {
 return <section className="info-panel next-step-visual" aria-label="Bước tiếp theo"><ProgressRing value={next.step-1} label="Tiến độ sản phẩm"/><div><small>Bước tiếp theo</small><h3>{next.title}</h3></div><Hint>{next.detail}</Hint><a className="office-text-button" href={next.href} aria-label="Mở bước tiếp theo"><ArrowUpRight size={22}/></a></section>;
}
