"use client";
import type {JourneyStep} from '@/lib/lab/product-next-step';
export function ProductNextStepCard({next}:{next:JourneyStep}) {
 return <section className="info-panel" aria-label="Bước tiếp theo"><strong>Bước tiếp theo · {next.step}/10</strong><h3>{next.title}</h3><p>{next.detail}</p><a className="office-text-button" href={next.href}>Mở bước tiếp theo →</a></section>;
}
