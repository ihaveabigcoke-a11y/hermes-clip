// These accessible names are deliberately narrow. Unknown Instagram UI must
// stop before Share; caption text and a screenshot are not toggle evidence.
const labelName = /^(Label as made with AI|Made with AI|Label as AI-generated|Gắn nhãn là được tạo bằng AI|Gắn nhãn là do AI tạo|Được tạo bằng AI)$/i;
const advancedName = /^(Advanced settings|Cài đặt nâng cao)$/i;
const shareName = /^Share$|^Chia sẻ$/i;

// User decision 12/11/2026: missing/null means off. Only an explicit
// 'required' enables the fail-closed AI-label check before Share.
export function instagramAiLabelMode(value) {
  if (value == null) return 'off';
  if (value === 'required' || value === 'off') return value;
  throw new InstagramAiLabelError('invalid_config');
}

export class InstagramAiLabelError extends Error {
  constructor(reason) {
    super('Cần đối soát/thao tác tay: chưa xác nhận được nhãn AI đang bật. Đã dừng trước Share; mở bản nháp để kiểm tra, không tự gửi lại.');
    this.code = 'INSTAGRAM_AI_LABEL_REQUIRED';
    this.aiLabelCheck = {mode: 'required', status: 'blocked', reason, checkedAt: Date.now()};
  }
}

// enable=false is the final, read-only gate. It never repairs/retries a toggle
// that changed while the publisher was revalidating account/video/caption.
export async function ensureInstagramAiLabel(page, mode, {enable = true, timeoutMs = 3000} = {}) {
  mode = instagramAiLabelMode(mode);
  if (mode === 'off') return {mode, status: 'skipped', checkedAt: Date.now()};
  const fail = reason => { throw new InstagramAiLabelError(reason); };
  try {
    const dialog = page.getByRole('dialog').filter({visible: true});
    if (await dialog.count() !== 1 || await dialog.getByRole('button', {name: shareName}).count() !== 1) fail('composer_not_unique');
    const controls = () => dialog.getByRole('switch', {name: labelName})
      .or(dialog.getByRole('checkbox', {name: labelName})).filter({visible: true});
    let toggle = controls();
    if (!await toggle.count() && enable) {
      const advanced = dialog.getByRole('button', {name: advancedName}).filter({visible: true});
      if (await advanced.count() > 1) fail('advanced_not_unique');
      if (await advanced.count() === 1 && await advanced.getAttribute('aria-expanded') !== 'true') {
        await advanced.click({timeout: timeoutMs});
      }
      // Wait for a lazy settings section without guessing at other buttons.
      await toggle.first().waitFor({state: 'visible', timeout: timeoutMs}).catch(() => {});
    }
    if (await toggle.count() !== 1) fail(await toggle.count() ? 'toggle_not_unique' : 'toggle_missing');
    if (!await toggle.isEnabled()) fail('toggle_disabled');
    const read = async () => {
      toggle = controls();
      if (await toggle.count() !== 1 || !await toggle.isEnabled()) fail('toggle_unavailable');
      return toggle.evaluate(element => {
        if (element instanceof HTMLInputElement && element.type === 'checkbox') {
          return element.indeterminate ? null : element.checked;
        }
        const value = element.getAttribute('aria-checked');
        return value === 'true' ? true : value === 'false' ? false : null;
      });
    };
    const state = await read();
    if (state == null) fail('state_unknown');
    if (!state) {
      if (!enable) fail('toggle_off_before_share');
      await toggle.click({timeout: timeoutMs});
      const deadline = Date.now() + timeoutMs;
      while (await read() !== true) {
        if (Date.now() >= deadline) fail('enable_unconfirmed');
        await page.waitForTimeout(100);
      }
    }
    if (await read() !== true) fail('enable_unconfirmed');
    return {mode, status: 'confirmed', checkedAt: Date.now(), source: 'composer_toggle'};
  } catch (error) {
    if (error.code === 'INSTAGRAM_AI_LABEL_REQUIRED') throw error;
    // Locator timeouts, detached DOM and navigation errors all fail closed.
    throw new InstagramAiLabelError('control_error');
  }
}
