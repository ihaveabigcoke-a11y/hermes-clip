export const INSTAGRAM_BROWSER_WARNING = 'Instagram trình duyệt tự động có thể khiến Meta khoá tài khoản (kể cả dây chuyền). Nên dùng API chính thức. Bật?';
export const browserEnabled = store => store.get('instagram_browser_enabled', false) === true;
export const apiMode = profile => profile?.apiMode !== 'browser';
export function assertBrowserEnabled(store) {
  if (!browserEnabled(store)) throw Error('Instagram trình duyệt đang tắt. Chỉ bật bằng tay trong Cài đặt → Instagram sau khi xác nhận cảnh báo.');
}
// Called by main: API timers are independent of the browser worker setting.
export function bootInstagram(publisher) { publisher?.boot(); }
