// Shared by the desktop worker and renderer, including packaged desktop builds.
export const uiCopy = {
  composeReview: 'Soạn và duyệt',
  preview: 'Xem trước',
  promptTemplates: 'Mẫu prompt',
  askMuse: 'Nhờ Muse viết',
  saveScene: 'Lưu cảnh nháp',
  newAttempt: 'Thêm lượt tạo nháp',
  attempt: 'Lượt tạo',
  take: 'Phiên bản',
  provider: 'Công cụ tạo',
  frames: 'Ảnh đầu và cuối',
  approveScript: 'Duyệt kịch bản',
  runScene: 'Chạy cảnh',
  downloadFile: 'Tải file',
  accounts: 'Tài khoản Muse',
  chat: 'Chat Muse',
  references: 'Ảnh tham chiếu',
  content: 'Nội dung sản phẩm',
  test: 'Kiểm thử kỹ thuật',
  openMuseResult: 'Mở hội thoại Muse',
  promptPlaceholder: 'Mô tả sản phẩm, hành động, bối cảnh và cách máy quay di chuyển…',
};

/** @type {Record<string, string>} */
export const workerStateLabels = {
  queued: 'Chờ tạo', preflight: 'Đang kiểm tra phiên', prepared: 'Đã điền bản nháp',
  submitting: 'Đang gửi yêu cầu', submitted: 'Đã nhận mã kết quả', waiting: 'Đang chờ Muse tạo',
  downloading: 'Đang tải kết quả', validating: 'Đang kiểm tra file', ready: 'Chờ duyệt',
  needs_attention: 'Cần kiểm tra kết quả', failed: 'Tạo thất bại', cancelled: 'Đã hủy bản nháp',
};

/** @type {Record<string, string>} */
export const sceneStateLabels = {
  ...workerStateLabels, draft: 'Cảnh nháp', running: 'Đang tạo', review: 'Chờ duyệt',
  rejected: 'Cần sửa', approved: 'Đã duyệt', unknown: 'Cần kiểm tra kết quả',
};

/** @type {Record<string, string>} */
export const reviewLabels = {pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Cần sửa', stale: 'Cần duyệt lại'};

/** @type {Record<string, string>} */
export const instagramStateLabels = {
  queued: 'Chờ đăng', waiting_login: 'Chờ đăng nhập', preparing: 'Đang kiểm tra', uploading: 'Đang tải video',
  submitting: 'Đang đăng', published: 'Đã đăng', needs_attention: 'Cần kiểm tra kết quả', failed: 'Đăng thất bại', cancelled: 'Đã hủy',
};

/** @type {Record<string, string>} */
export const instagramSessionLabels = {unknown: 'Chưa xác nhận phiên', login_required: 'Cần đăng nhập', signed_in: 'Đã đăng nhập'};

/** @type {Record<string, string>} */
export const instagramMetricLabels = {views:'Lượt xem',likes:'Lượt thích',comments:'Bình luận',saves:'Lượt lưu',shares:'Lượt chia sẻ',reach:'Tài khoản tiếp cận',
  follows:'Lượt theo dõi mới',viewers:'Người xem',interactions:'Lượt tương tác',reelInteractions:'Tương tác với Reel',
  accountsEngaged:'Tài khoản tương tác',profileActivity:'Hoạt động trên hồ sơ',profileVisits:'Vào profile',linkClicks:'Bấm link'};

/** @type {Record<string, string>} */
export const instagramMetricStates = {idle:'Chờ cập nhật',running:'Đang cập nhật',ready:'Đã cập nhật',partial:'Có chỉ số chưa được cung cấp',
  waiting_browser:'Chờ hồ sơ rảnh',login_required:'Cần đăng nhập',error:'Chưa cập nhật được',unavailable:'Chưa có quyền xem Insights'};

/** @type {Record<string, string>} */
export const contentPlanLabels = {draft: 'Nháp', planned: 'Đã lên kế hoạch', published_manual: 'Đã đăng · nhập tay', published_browser: 'Đã đăng qua app'};

/** @type {Record<string, string>} */
export const sceneRoleLabels = {hook: 'Mở đầu', body: 'Nội dung chính', cta: 'Kêu gọi hành động'};

/** @type {Record<string, string>} */
export const attemptLabels = {
  awaiting_provider: 'Lượt tạo nháp',
  cancelled: 'Đã hủy lượt tạo',
  manual_complete: 'Đã nhận file thủ công',
  local_complete: 'Đã nhận file',
  unknown: 'Cần kiểm tra kết quả',
};
