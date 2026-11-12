import type {DesktopStatus} from '../../lib/lab/desktop-client';
export type RoutedProvider = 'muse' | 'manual' | 'codex' | 'grok-cli' | 'fal' | `import:${string}`;
export type ProviderReceipt = {provider: string; state: string; reconciled?: boolean};
export function textProviderReceipts(input: {
  kind: 'research' | 'content' | 'landing'; scope?: string;
  runs?: {taskScope?:string; batchId?:string; state:string; provider?:string; reconciled?:boolean}[];
  chats?: {projectId:string; state:string; provider?:string; reconciled?:boolean}[];
}): ProviderReceipt[];
export function resolveProvider(input: {
  kind: 'media' | 'research' | 'content' | 'landing'; status?: DesktopStatus | null;
  available?: boolean; error?: string; codexEnabled?: boolean;
  selection?: RoutedProvider | 'auto'; previous?: ProviderReceipt[];
}): {provider: RoutedProvider; ready: boolean; readyProfileIds: string[]; blocked: boolean; reason: string};
