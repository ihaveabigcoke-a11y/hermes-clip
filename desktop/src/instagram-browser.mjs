import {browserCacheArgs,trimProfileCaches} from './storage-policy.mjs';
import {join} from 'node:path';
import {profileInput} from './shared.mjs';
import {TouchVpn, TOUCH_VPN_ID} from './touch-vpn.mjs';
import {z} from 'zod';

const apiInput = z.object({apiMode:z.enum(['browser','api']).optional(),
  apiUserId:z.string().regex(/^\d{1,40}$|^$/).optional(),
  apiToken:z.string().trim().max(8192).optional(),clearApiToken:z.boolean().optional()});

export class InstagramBrowsers {
  constructor({store, root, browser, secret}) {
    this.store = store;
    this.root = root;
    this.browser = browser;
    this.secret = secret;
    this.vpn = new TouchVpn(join(root, 'extensions'));
    this.contexts = new Map();
    this.opening = new Map();
    this.pages = new Map();
    this.pageOpening = new Map();
    this.busy = new Set();
    this.background = new Set();
    this.saving = new Set();
  }

  rows() { return this.store.get('instagram_profiles', []); }
  profile(id) { return this.rows().find(profile => profile.id === id); }
  update(id, patch) {
    this.store.set('instagram_profiles', this.rows().map(profile => profile.id === id ? {...profile, ...patch} : profile));
  }
  status() {
    return this.rows().map(({proxy, encryptedApiToken, ...profile}) => ({...profile,
      apiMode: profile.apiMode ?? 'browser', hasApiToken: !!encryptedApiToken,
      session: profile.apiMode === 'api' || this.contexts.has(profile.id) ? profile.session : 'unknown',
      proxy: {server: proxy.server, username: proxy.username, hasPassword: !!proxy.encryptedPassword},
      open: this.contexts.has(profile.id), busy: this.busy.has(profile.id) || this.opening.has(profile.id) || this.pageOpening.has(profile.id),
      background: this.background.has(profile.id),
      vpn: {...profile.vpn, state: this.contexts.has(profile.id) ? profile.vpn?.state : profile.vpnEnabled ? 'closed' : 'off'},
    }));
  }

  async save(account, input = {}) {
    const id = account.id;
    if (this.contexts.has(id) || this.opening.has(id) || this.busy.has(id) || this.saving.has(id)) {
      throw Error('Đóng trình duyệt và chờ lượt đăng kết thúc trước khi sửa kết nối.');
    }
    this.saving.add(id);
    try {
      const old = this.profile(id);
      const api = apiInput.parse(input);
      let encryptedApiToken = old?.encryptedApiToken ?? null;
      if (api.clearApiToken) encryptedApiToken = null;
      if (api.apiToken) {
        try { encryptedApiToken = await this.secret.encrypt(api.apiToken); }
        catch { throw Error('Chưa mã hóa được token Instagram API. Không lưu token dạng rõ.'); }
      }
      const value = profileInput.parse({id, name: account.data.name.slice(0, 80), accountLabel: '', enabled: true,
        vpnEnabled: old?.vpnEnabled ?? true, proxy: old ? {server: old.proxy.server, username: old.proxy.username} : {server: '', username: ''}, ...input});
      const {password, clearPassword, ...proxy} = value.proxy;
      let encryptedPassword = old?.proxy.encryptedPassword ?? null;
      if (clearPassword || !proxy.server) encryptedPassword = null;
      if (password) encryptedPassword = await this.secret.encrypt(password);
      if (this.contexts.has(id) || this.opening.has(id) || this.busy.has(id)) throw Error('Hồ sơ đang được mở. Thử lưu lại sau.');
      const profile = {id, productId: account.data.productId, name: account.data.name,
        apiMode:api.apiMode ?? old?.apiMode ?? 'browser',apiUserId:api.apiUserId ?? old?.apiUserId ?? null,
        encryptedApiToken,apiConfigRevision:(old?.apiConfigRevision ?? 0) + 1,
        vpnEnabled: value.vpnEnabled, proxy: {...proxy, encryptedPassword},
        session: 'unknown', handle: old?.handle ?? '',
        userId: api.apiMode && api.apiMode !== (old?.apiMode ?? 'browser') ? '' : old?.userId ?? '', checkedAt: null,
        vpn: null, error: '', createdAt: old?.createdAt ?? Date.now()};
      this.store.set('instagram_profiles', [...this.rows().filter(row => row.id !== id), profile]);
      return id;
    } finally { this.saving.delete(id); }
  }

  async context(id, background = false) {
    if (this.saving.has(id)) throw Error('Chờ lưu cấu hình hồ sơ hoàn tất.');
    if (this.opening.has(id)) return this.opening.get(id);
    if (this.contexts.has(id)) {
      const current = this.profile(id);
      if (current.vpnEnabled && current.vpn?.state !== 'connected') {
        const pending = (async () => {
          const {manifest} = await this.vpn.ensure();
          const vpn = await this.vpn.connect(this.contexts.get(id), manifest);
          this.update(id, {vpn, error: ''});
          return this.contexts.get(id);
        })().finally(() => this.opening.delete(id));
        this.opening.set(id, pending);
        return pending;
      }
      return this.contexts.get(id);
    }
    const profile = this.profile(id);
    if (!profile) throw Error('Thêm hồ sơ trình duyệt Instagram trước.');
    const pending = this.launch(profile, background).finally(() => this.opening.delete(id));
    this.opening.set(id, pending);
    return pending;
  }

  async launch(profile, background) {
    let bridge;
    let context;
    try {
      const proxy = profile.proxy.server ? {server: profile.proxy.server, username: profile.proxy.username || undefined,
        password: profile.proxy.encryptedPassword ? await this.secret.decrypt(profile.proxy.encryptedPassword) : undefined} : undefined;
      if (proxy && profile.vpnEnabled) throw Error('Chọn Touch VPN hoặc proxy riêng cho hồ sơ.');
      if (proxy?.server.startsWith('socks5:') && (proxy.username || proxy.password)) {
        const {localProxy} = await import('./proxy.mjs');
        bridge = await localProxy(proxy);
      }
      const extension = profile.vpnEnabled ? await this.vpn.ensure() : null;
      const args = [...browserCacheArgs(this.store),'--disable-background-timer-throttling', '--disable-renderer-backgrounding'];
      if (background) args.push('--start-minimized');
      if (extension) args.push('--disable-extensions-except=' + extension.directory, '--load-extension=' + extension.directory);
      await trimProfileCaches(join(this.root, 'instagram', 'profiles', profile.id),this.store);
        context = await this.browser.launchPersistentContext(join(this.root, 'instagram', 'profiles', profile.id), {
        headless: false, acceptDownloads: false, args, ignoreDefaultArgs: extension ? ['--disable-extensions'] : [],
        proxy: bridge?.proxy ?? proxy, timeout: 30000,
      });
      this.contexts.set(profile.id, context);
      context.on('close', () => {
        this.contexts.delete(profile.id);
        this.pages.delete(profile.id);
        this.background.delete(profile.id);
        this.update(profile.id, {session: 'unknown', vpn: {state: 'closed'}});
        void bridge?.close();
      });
      if (extension) {
        this.update(profile.id, {vpn: {state: 'connecting', checkedAt: Date.now()}});
        const vpn = await this.vpn.connect(context, extension.manifest);
        this.update(profile.id, {vpn});
      }
      return context;
    } catch (error) {
      if (!context) await bridge?.close();
      this.update(profile.id, {error: 'Chưa mở được kết nối Instagram. Kiểm tra trình duyệt, proxy hoặc Touch VPN.',
        vpn: profile.vpnEnabled ? {state: 'error', checkedAt: Date.now()} : {state: 'off'}});
      throw Error('Chưa mở được kết nối Instagram. Kiểm tra trình duyệt, proxy hoặc Touch VPN.');
    }
  }

  async page(id, background = false) {
    if (this.pageOpening.has(id)) return this.pageOpening.get(id);
    const pending = (async () => {
      const context = await this.context(id, background);
      const saved = this.pages.get(id);
      const page = saved && !saved.isClosed() ? saved
        : context.pages().find(page => /^https:\/\/(www\.)?instagram\.com\//.test(page.url())) ?? await context.newPage();
      this.pages.set(id, page);
      page.setDefaultTimeout(15000);
      if (!/^https:\/\/(www\.)?instagram\.com\//.test(page.url())) {
        await page.goto('https://www.instagram.com/', {waitUntil: 'domcontentloaded', timeout: 45000});
      }
      return page;
    })().finally(() => this.pageOpening.delete(id));
    this.pageOpening.set(id, pending);
    return pending;
  }

  async visibility(id, visible) {
    const context = this.contexts.get(id);
    const page = context?.pages().find(page => page.url().includes('instagram.com')) ?? context?.pages()[0];
    if (!page) return;
    const cdp = await context.newCDPSession(page);
    try {
      const {windowId} = await cdp.send('Browser.getWindowForTarget');
      await cdp.send('Browser.setWindowBounds', {windowId, bounds: {windowState: visible ? 'normal' : 'minimized'}});
      if (visible) { this.background.delete(id); await page.bringToFront(); }
      else this.background.add(id);
    } finally { await cdp.detach(); }
  }

  async openVpn(id) {
    const profile = this.profile(id);
    if (!profile?.vpnEnabled) throw Error('Hồ sơ này chưa bật Touch VPN.');
    let context = this.contexts.get(id);
    if (!context) { try { context = await this.context(id); } catch { context = this.contexts.get(id); } }
    if (!context) throw Error('Chưa mở được trình duyệt của hồ sơ.');
    const {manifest} = await this.vpn.ensure();
    const page = await context.newPage();
    await page.goto('chrome-extension://' + TOUCH_VPN_ID + '/' + manifest.action.default_popup);
    await this.visibility(id, true);
    await page.bringToFront();
  }

  async close(id) {
    if (this.busy.has(id) || this.opening.has(id) || this.pageOpening.has(id)) throw Error('Chờ thao tác của hồ sơ kết thúc trước khi đóng.');
    await this.contexts.get(id)?.close();
    return true;
  }
}
