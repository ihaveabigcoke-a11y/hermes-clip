import {museThreadUrl} from './muse-thread-url.mjs';
import {museMediaPrompt, museVideoBody} from './muse-video-prompt.mjs';

export function continueBlockedReason(source, profile, mediaType, jobs = [], excludeId) {
  if (!source || source.provider && source.provider !== 'muse' || !museThreadUrl(source.providerUrl)) return 'Chưa có link hội thoại Muse hợp lệ.';
  if (source.state !== 'ready' || !source.output || source.reconciliation === 'skipped'
    || source.failureCode === 'WORKER_LOST' && source.reconciled !== true) return 'Việc gốc chưa hoàn tất đối soát. Kiểm tra kết quả cũ trước khi gửi tiếp.';
  if (!profile || profile.id !== source.profileId) return 'Hồ sơ tạo việc gốc đã xóa hoặc không khớp. Không thể gửi bằng hồ sơ khác.';
  if (!profile.enabled || profile.dispatch?.stopped) return 'Hồ sơ tạo việc gốc đang dừng gửi. Kiểm tra hồ sơ trước khi gửi tiếp.';
  if (profile.vpnEnabled !== true) return 'Bật VPN của hồ sơ gốc trước khi gửi tiếp.';
  if (mediaType === 'video' && profile.name?.trim().toLocaleLowerCase('vi') === 'chi') return 'Hồ sơ Chi không gửi video.';
  const thread = museThreadUrl(source.providerUrl)?.replace(/\/$/, '');
  if (jobs.some(job => job.id !== excludeId && job.id !== source.id
    && (!job.profileId || job.profileId === source.profileId)
    && (museThreadUrl(job.continueThreadUrl ?? job.providerUrl)?.replace(/\/$/, '') === thread || source.bundleJobIds?.includes(job.id))
    && job.state !== 'ready' && (!(job.reconciled === true && ['failed', 'cancelled'].includes(job.state))
      // A legacy continuation may have downloaded a late-loading old card
      // while its new reply was still running. Its duplicate receipt cannot
      // establish the outcome of the new turn, even if it says reconciled.
      || job.continueOf && job.failureCode === 'MUSE_OLD_CLIP'
        && job.continuationBaseline?.assistantIds?.includes(job.providerId)))) {
    return 'Hội thoại còn việc đang chờ hoặc chưa đối soát. Kiểm tra kết quả cũ trước khi gửi tiếp.';
  }
  return '';
}

export function continuationPrompt(description, mediaType, ratio, duration) {
  const brief = museVideoBody(description).trim();
  if (!brief) throw Error('Nhập mô tả muốn Muse làm tiếp.');
  // One Muse turn: the instructions are English; the user's quoted brief is
  // preserved as source data, including Vietnamese, with no extra text send.
  return museMediaPrompt([
    `Continue this conversation by creating one new ${mediaType === 'video' ? `${duration}-second video` : 'image'} in ${ratio} format.`,
    'Use the established product and context. Interpret the user brief below, translating its intent into an English media-generation prompt before using your media tool. All generated dialogue and on-screen text must be English. Return the actual new downloadable file.',
    'User brief (source text): ' + JSON.stringify(brief),
  ].join('\n'), mediaType);
}
