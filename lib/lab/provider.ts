import { providerAdapter } from "./production.ts";
export type GenerationRequest = {
  clientRequestId: string; productId: string; sceneId: string; sceneRevision: number;
  kind: "image"|"video"; prompt: string; aspectRatio: string; durationSeconds?: number;
  references: {id:string;version:number;assetId:string}[];
};
export interface GenerationAdapter {
  readonly descriptor: {
    id: string; connected: boolean; state: "ready"|"awaiting_documentation"|"disabled"; notice: string;
    capabilities: Record<"image"|"video"|"reference"|"firstLast"|"audio"|"cancel"|"usage", boolean|"unknown"> & {
      aspectRatios: readonly string[]|"unknown"; durationsSeconds: readonly number[]|"unknown"; models: readonly string[]|"unknown";
    };
  };
  submit(request: GenerationRequest): Promise<{providerJobId:string;state:"submitted"|"unknown"}>;
  poll(providerJobId:string): Promise<{state:"running"|"complete"|"failed"|"unknown"}>;
  fetchOutput(providerJobId:string): Promise<{bytes:Uint8Array;contentType:string}>;
  cancel(providerJobId:string): Promise<{confirmed:boolean}>;
  usage(providerJobId:string): Promise<{usd:number|null;source:string|null}>;
}
export class ProviderNotConnected extends Error {
  constructor(){super("Chưa kết nối nhà cung cấp. Cần hợp đồng API và capabilities đã xác minh trước khi gửi tác vụ.");}
}
// Explicitly fail closed. No mock progress, vendor requests or credentials.
export const disconnectedAdapter: GenerationAdapter = {
  descriptor: providerAdapter,
  async submit(){throw new ProviderNotConnected();},
  async poll(){throw new ProviderNotConnected();},
  async fetchOutput(){throw new ProviderNotConnected();},
  async cancel(){throw new ProviderNotConnected();},
  async usage(){return {usd:null,source:null};},
};
