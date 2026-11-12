// Pure routing policy shared by the renderer and desktop. Never sends a task.
// Historical entries in these two Muse-only stores may omit provider. Preserve
// explicit provenance and reconciliation; a new batch has no old receipts.
export function textProviderReceipts({kind, scope, runs = [], chats = []}) {
  if (typeof scope !== 'string' || !scope) return [];
  const scopedRuns = kind === 'research' ? runs.filter(row => (row.taskScope ?? row.batchId) === scope) : [];
  const scopedChats = chats.filter(row => row.projectId === scope
    || (kind === 'research' && row.projectId === 'task_research_' + scope));
  return [...scopedRuns, ...scopedChats].map(row => ({provider:row.provider ?? 'muse', state:row.state, reconciled:row.reconciled === true}));
}

export function resolveProvider({kind, status, available = true, error = '', codexEnabled = false, selection, previous = []}) {
  const readyProfiles = available && !error && status?.musePaused === false && status.generationReady
    ? status.profiles.filter(profile => profile.enabled && profile.health === 'ready' && profile.session === 'signed_in'
      && profile.quota?.state === 'available'
      && !(profile.quota.weeklyRemainingPercent === 0 && !((profile.quota.additionalTokens ?? 0) > 0))
      && (status.batch?.submittedByProfile[profile.id] ?? 0) < 3) : [];
  const ready = readyProfiles.length > 0;
  // Check every receipt, not just the latest: a newer draft cannot settle an older send.
  const uncertain = previous.some(task => task.provider === 'muse' && !task.reconciled
    && ['unknown', 'needs_attention'].includes(task.state));
  const running = previous.some(task => task.provider === 'muse' && !task.reconciled
    && ['preflight', 'prepared', 'preparing', 'submitting', 'submitted', 'waiting', 'running', 'downloading', 'validating'].includes(task.state));
  const provider = selection && selection !== 'auto' ? selection : ready ? 'muse' : kind === 'media' ? 'manual' : codexEnabled ? 'codex' : 'import:json';
  const reason = uncertain ? 'Cần đối soát' : running ? 'Tác vụ Muse đang chạy' :
    provider === 'muse' && !ready ? (status?.musePaused !== false ? 'Muse đang tạm dừng, bật lại ở Tài khoản Muse' : 'Muse chưa sẵn sàng; kiểm tra phiên và hạn mức') :
    provider === 'grok-cli' ? 'Chưa kiểm' : provider === 'fal' ? 'Trả phí, phải báo giá trước' : '';
  return {provider, ready, readyProfileIds: readyProfiles.map(profile => profile.id), blocked: !!reason, reason};
}
