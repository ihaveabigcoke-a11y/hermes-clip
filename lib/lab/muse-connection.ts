import type {DesktopStatus} from './desktop-client';
import {resolveProvider} from '../../desktop/src/provider-routing.mjs';

export function museConnectionSummary(status: DesktopStatus | null, available: boolean, error = '') {
  if (!available) return {state: 'desktop_required', title: "Mở Hermes Clip trên máy để kết nối Muse", description: "Hồ sơ và quá trình tạo media chạy trong ứng dụng trên máy.", action: 'Xem kết nối', view: 'settings'};
  if (error) return {state: 'unavailable', title: 'Chưa đọc được trạng thái Muse', description: error, action: 'Kiểm tra tài khoản', view: 'accounts'};
  if (!status) return {state: 'loading', title: 'Đang kiểm tra kết nối Muse', description: "Đang đọc phiên đăng nhập và cấu hình tác vụ nền.", action: 'Xem tài khoản', view: 'accounts'};
  if (status.musePaused!==false) return {state:'paused',title:'Muse: đang tạm dừng',description:'Muse đang tạm dừng, bật lại ở Tài khoản Muse. Tác vụ đang chạy vẫn hoàn tất.',action:'Tài khoản Muse',view:'accounts'};
  if (!status.generationReady) return {state: 'setup', title: 'Muse: đang bật · cần cấu hình', description: 'Mở cài đặt để kiểm tra luồng tạo và tải media.', action: 'Cấu hình Muse', view: 'settings'};
  const enabled = status.profiles.filter(profile => profile.enabled);
  if (!enabled.length) return {state: 'profile_required', title: 'Muse: đang bật · cần hồ sơ', description: "Mỗi hồ sơ lưu riêng phiên đăng nhập và Touch VPN.", action: "Quản lý hồ sơ", view: 'accounts'};
  const routing = resolveProvider({kind:'media', status, available, error});
  const ready = enabled.filter(profile => routing.readyProfileIds.includes(profile.id));
  if (!ready.length) return {state: 'attention', title: 'Muse: đang bật · cần kiểm tra tài khoản', description: 'Đo hạn mức và kiểm tra phiên đăng nhập để tiếp tục tạo media.', action: 'Kiểm tra tài khoản', view: 'accounts'};
  const quota = ready[0].quota;
  const remaining = quota?.state === 'available' && Number.isFinite(quota.weeklyRemainingPercent) ? ` · hạn mức tuần còn ${quota.weeklyRemainingPercent}% theo lần đo gần nhất` : '';
  return {state: 'ready', title: 'Muse: đang bật', description: `${ready.length} hồ sơ sẵn sàng${remaining}. Sau khi duyệt kịch bản, chọn Chạy cảnh để mở hồ sơ Muse và tự tải kết quả vào Thư viện.`, action: 'Tạo video', view: 'production'};
}
