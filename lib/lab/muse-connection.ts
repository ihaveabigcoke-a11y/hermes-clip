import type {DesktopStatus} from './desktop-client';

export function museConnectionSummary(status: DesktopStatus | null, available: boolean, error = '') {
  if (!available) return {state: 'desktop_required', title: "Mở Hermes Clip trên máy để kết nối Muse", description: "Hồ sơ và quá trình tạo media chạy trong ứng dụng trên máy.", action: 'Xem kết nối', view: 'settings'};
  if (error) return {state: 'unavailable', title: 'Chưa đọc được trạng thái Muse', description: error, action: 'Kiểm tra tài khoản', view: 'accounts'};
  if (!status) return {state: 'loading', title: 'Đang kiểm tra kết nối Muse', description: "Đang đọc phiên đăng nhập và cấu hình tác vụ nền.", action: 'Xem tài khoản', view: 'accounts'};
  if (status.musePaused!==false) return {state:'paused',title:'Muse đang tạm dừng',description:'Dùng manual để xuất prompt và nhận file từ Flow/Gemini hoặc Grok.',action:'Cài đặt media',view:'settings'};
  if (!status.generationReady) return {state: 'setup', title: 'Cần hoàn tất cấu hình Muse', description: 'Mở cài đặt để kiểm tra luồng tạo và tải media.', action: 'Cấu hình Muse', view: 'settings'};
  const enabled = status.profiles.filter(profile => profile.enabled);
  if (!enabled.length) return {state: 'profile_required', title: "Thêm hoặc bật hồ sơ Muse", description: "Mỗi hồ sơ lưu riêng phiên đăng nhập và Touch VPN.", action: "Quản lý hồ sơ", view: 'accounts'};
  const ready = enabled.filter(profile => profile.health === 'ready' && profile.session === 'signed_in'
    && profile.quota?.state === 'available'
    && !(profile.quota.weeklyRemainingPercent === 0 && !((profile.quota.additionalTokens ?? 0) > 0))
    && (status.batch?.submittedByProfile[profile.id] ?? 0) < 3);
  if (!ready.length) return {state: 'attention', title: 'Kiểm tra tài khoản Muse', description: 'Đo hạn mức và kiểm tra phiên đăng nhập để tiếp tục tạo media.', action: 'Kiểm tra tài khoản', view: 'accounts'};
  const quota = ready[0].quota;
  const remaining = quota?.state === 'available' && Number.isFinite(quota.weeklyRemainingPercent) ? ` · hạn mức tuần còn ${quota.weeklyRemainingPercent}% theo lần đo gần nhất` : '';
  return {state: 'ready', title: 'Muse đã kết nối', description: `${ready.length} hồ sơ sẵn sàng${remaining}. Sau khi duyệt kịch bản, chọn Chạy cảnh để mở hồ sơ Muse và tự tải kết quả vào Thư viện.`, action: 'Tạo video', view: 'production'};
}
