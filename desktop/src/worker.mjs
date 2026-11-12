import {museIsPaused,assertMuseAvailable,assertMuseNewTask,runMuseTask} from './muse-pause.mjs';
import {assertDiskSpace,diskStatus,storagePolicy,browserCacheArgs,trimProfileCaches} from './storage-policy.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile,readFile,stat,rename,unlink} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {freemem} from 'node:os';
import {profileInput,adapterInput,museConnectionInput,jobInput,jobFingerprint,labels,safeMessage} from './contracts.mjs';
import {validateMedia,toolchain,renderClips,hasAudio} from './media.mjs';
import {MuseAdapter} from './muse.mjs';
import {TouchVpn,TOUCH_VPN_ID} from './touch-vpn.mjs';
import {readMuseQuota,museQuotaExhausted} from './muse-quota.mjs';
import {mediaProviderReceipts} from './provider-routing.mjs';
import {removeProfile,profileRemovalBlocker} from './profile-removal.mjs';
export class Worker {
  validateOutput = validateMedia;
  checkToolchain = toolchain;
  chatting = new Set();
  deleting = new Set();
  dispatchVersion = 0;
  closing = new Map();
  reclaimingMemory = false;
  memoryRecoveryAttempts = new Set();
  constructor(store,root,browser,secret,memory=freemem){this.memory=memory;this.store=store;this.root=root;this.browser=browser;this.secret=secret;this.contexts=new Map();this.opening=new Map();this.bridges=new Map();this.active=new Map();this.paused=true;this.budget=0;this.approvedIds=[];this.maxConcurrent=1;this.attemptedProfiles=new Map();this.backgroundProfiles=new Set();this.store.recover();this.vpn=new TouchVpn(join(root,'extensions'));this.checking=new Map();this.connectingVpn=new Map();}
  async setMusePaused({paused}) {
    if (typeof paused !== 'boolean') throw Error('Chọn trạng thái tạm dừng Muse.');
    this.store.set('muse_paused', paused);
    // Invalidate admissions waiting on I/O, but keep running jobs and their contexts.
    if (paused) this.pause();
    else this.dispatchVersion++;
    return this.status();
  }
  profiles() {
    return this.store.get('profiles', []).map(profile => ({
      ...profile,
      vpn: profile.vpnEnabled ? {
        ...profile.vpn,
        state: this.contexts.has(profile.id) || this.opening.has(profile.id)
          ? profile.vpn?.state ?? 'unknown' : 'closed',
      } : {state: 'off'},
      proxy: {server: profile.proxy.server, username: profile.proxy.username, hasPassword: !!profile.proxy.encryptedPassword},
      busy: this.active.has(profile.id) || this.checking.has(profile.id) || this.closing.has(profile.id) || this.chatting.has(profile.id),
      open: this.contexts.has(profile.id),
      background: this.backgroundProfiles.has(profile.id),
      deleteBlockedReason: profileRemovalBlocker(this, profile.id),
    }));
  }
  async saveProfile(input) {
    const d = profileInput.parse(input);
    const id = d.id || randomUUID();
    if(this.deleting.has(id))throw Error('Hồ sơ đang được xóa.');
    if(this.store.get('deleted_profiles',[]).some(profile=>profile.id===id))throw Error('Hồ sơ đã xóa. Tạo hồ sơ mới để đăng nhập lại.');
    if (this.contexts.has(id) || this.opening.has(id) || this.active.has(id) || this.checking.has(id) || this.closing.has(id) || this.chatting.has(id)) throw Error('Đóng browser profile và chờ job dừng trước khi sửa proxy.');
    const newPassword = d.proxy.password ? await this.secret.encrypt(d.proxy.password) : null;
    if(this.deleting.has(id))throw Error('Hồ sơ đang được xóa.');
    if(this.store.get('deleted_profiles',[]).some(profile=>profile.id===id))throw Error('Hồ sơ đã xóa. Tạo hồ sơ mới để đăng nhập lại.');
    const profiles = this.store.get('profiles', []);
    const old = profiles.find(profile => profile.id === id);
    if (this.contexts.has(id) || this.opening.has(id) || this.active.has(id) || this.checking.has(id) || this.closing.has(id) || this.chatting.has(id)) throw Error('Đóng browser profile và chờ job dừng trước khi sửa proxy.');
    if (!old && profiles.length >= 20) throw Error('Tối đa 20 profile.');
    let encryptedPassword = old?.proxy.encryptedPassword || null;
    if (d.proxy.clearPassword || !d.proxy.server) encryptedPassword = null;
    if (d.proxy.password) encryptedPassword = newPassword;
    const {password, clearPassword, ...proxy} = d.proxy;
    const profile = {...d, id, proxy: {...proxy, encryptedPassword}, health: old?.health ?? 'unknown', ip: old?.ip ?? null, checkedAt: old?.checkedAt ?? null, session: old?.session ?? 'unknown', quota: old?.quota ?? null, vpn: old?.vpn ?? null};
    this.store.set('profiles', [...profiles.filter(profile => profile.id !== id), profile]);
    return id;
  }
  config(){return this.store.get('adapter',null);}
  deleteProfile(payload){return removeProfile(this,payload);}
  connection(){return this.store.get('muse_connection',null)??(this.config()?{startUrl:this.config().startUrl}:null);}
  saveMuseConnection(input){if(this.active.size||this.contexts.size||this.opening.size)throw Error('Đóng các profile trước khi đổi trang Muse.');const value=museConnectionInput.parse(input),old=this.config();if(old&&new URL(old.startUrl).href!==new URL(value.startUrl).href)this.store.set('adapter',null);this.store.set('muse_connection',value);this.store.set('profiles',this.store.get('profiles',[]).map(p=>({...p,health:'unknown',session:'unknown',checkedAt:null})));return true;}
  saveAdapter(input){if(this.active.size||this.contexts.size||this.opening.size)throw Error('Đóng các profile trước khi đổi luồng.');const c=adapterInput.parse(input),connection=this.connection();if(connection&&new URL(connection.startUrl).origin!==new URL(c.startUrl).origin)throw Error('Luồng phải thuộc đúng miền Muse đã chọn.');this.store.set('muse_connection',{startUrl:c.startUrl});this.store.set('adapter',c);return true;}
  updateProfile(id, patch) {
    this.store.set('profiles', this.store.get('profiles', []).map(profile => profile.id === id ? {...profile, ...patch} : profile));
  }

  async connectVpn(id, context, installed) {
    assertMuseAvailable(this.store, {profileId:id});
    const profile = this.store.get('profiles', []).find(profile => profile.id === id);
    if (!profile?.vpnEnabled) return;
    if (this.connectingVpn.has(id)) return this.connectingVpn.get(id);
    const pending = (async () => {
      this.updateProfile(id, {vpn:{state:'connecting',checkedAt:Date.now()}});
      try {
        const extension = installed ?? await this.vpn.ensure();
        const status = await this.vpn.connect(context, extension.manifest);
        this.updateProfile(id, {vpn:status});
      } catch (error) {
        this.updateProfile(id, {vpn:{state:'error',checkedAt:Date.now(),message:'Touch VPN chưa kết nối được.'}});
        error.code = 'MUSE_VPN_REQUIRED';
        throw error;
      }
    })();
    this.connectingVpn.set(id, pending);
    try { await pending; } finally { this.connectingVpn.delete(id); }
  }

  async context(id, background = false) {
    if(this.deleting.has(id))throw Error('Hồ sơ đang được xóa.');
    assertMuseAvailable(this.store, {profileId:id});
    if (this.closing.has(id)) await this.closing.get(id);
    assertMuseAvailable(this.store, {profileId:id});
    const profile = this.store.get('profiles', []).find(profile => profile.id === id);
    if (!profile?.enabled) throw Error('Profile không tồn tại hoặc đang tắt.');
    if (this.opening.has(id)) return this.opening.get(id);
    if (this.contexts.has(id)) return this.contexts.get(id);
    const pending = (async () => {
      let bridge;
      let context;
      try {
        const proxy = profile.proxy.server ? {server:profile.proxy.server,username:profile.proxy.username || undefined,
          password:profile.proxy.encryptedPassword ? await this.secret.decrypt(profile.proxy.encryptedPassword) : undefined} : undefined;
        assertMuseAvailable(this.store, {profileId:id});
        if (profile.vpnEnabled && proxy) throw Error('Chọn Touch VPN hoặc proxy riêng trong cấu hình profile.');
        if (proxy?.server.startsWith('socks5:') && (proxy.username || proxy.password)) {
          const {localProxy} = await import('./proxy.mjs');
          bridge = await localProxy(proxy);
          this.bridges.set(id, bridge);
        }
        if (profile.vpnEnabled) this.updateProfile(id,{vpn:{state:'installing',checkedAt:Date.now()}});
        const extension = profile.vpnEnabled ? await this.vpn.ensure() : null;
        assertDiskSpace(this.root,0,storagePolicy(this.store));
        const args = [...browserCacheArgs(this.store),'--disable-background-timer-throttling','--disable-renderer-backgrounding'];
        if (background) args.push('--start-minimized');
        if (extension) args.push('--disable-extensions-except=' + extension.directory,'--load-extension=' + extension.directory);
        await trimProfileCaches(join(this.root,'profiles',id),this.store);
        assertMuseAvailable(this.store, {profileId:id});
        context = await this.browser.launchPersistentContext(join(this.root,'profiles',id), {
          headless:false, acceptDownloads:true, args, ignoreDefaultArgs:extension ? ['--disable-extensions'] : [],
          proxy:bridge?.proxy ?? proxy, timeout:30000,
        });
        context.on('close', () => {
          this.contexts.delete(id);
          this.backgroundProfiles.delete(id);
          this.bridges.delete(id);
          if (profile.vpnEnabled) this.updateProfile(id,{vpn:{state:'closed',checkedAt:Date.now()}});
          void bridge?.close();
        });
        this.contexts.set(id,context);
        if (extension) await this.connectVpn(id,context,extension);
        return context;
      } catch (cause) {
        if (!context) {
          this.bridges.delete(id);
          await bridge?.close();
        }
        if (cause.code === 'MUSE_VPN_REQUIRED' || cause.code === 'MUSE_PAUSED') throw cause;
        const error = Error('Không mở được browser profile. Kiểm tra Chromium, Touch VPN và proxy.');
        error.code = 'MUSE_PROFILE_UNAVAILABLE';
        throw error;
      }
    })();
    const opening = pending.finally(() => this.opening.delete(id));
    this.opening.set(id, opening);
    return opening;
  }

  async openVpn(id) {
    assertMuseNewTask(this.store);
    const profile = this.store.get('profiles', []).find(profile => profile.id === id);
    if (!profile?.vpnEnabled) throw Error('Bật Touch VPN trong cấu hình profile.');
    let context = this.contexts.get(id);
    if (!context) {
      try { context = await this.context(id); }
      catch (error) { context = this.contexts.get(id); if (!context) throw error; }
    }
    const page = await context.newPage();
    const {manifest} = await this.vpn.ensure();
    await page.goto('chrome-extension://' + TOUCH_VPN_ID + '/' + manifest.action.default_popup);
    await this.setProfileVisibility(id,true);
    await page.bringToFront();
    return true;
  }

  async measureQuota(id, context) {
    assertMuseAvailable(this.store, {profileId:id});
    const config = this.config();
    if (!config) return null;
    let page;
    try {
      page = await context.newPage();
      const quota = await readMuseQuota(page,new MuseAdapter(config));
      this.updateProfile(id, {quota});
      return quota;
    } catch {
      const previous = this.store.get('profiles', []).find(profile => profile.id === id)?.quota;
      const quota = {...previous,state:'error',attemptedAt:Date.now(),message:'Chưa đọc được hạn mức Muse. Bấm Đo hạn mức để thử lại.'};
      this.updateProfile(id, {quota});
      return quota;
    } finally {
      await page?.close().catch(() => {});
    }
  }

  async setProfileVisibility(id, visible) {
    const context = this.contexts.get(id);
    const page = context?.pages().find(page => page.url().startsWith(this.connection()?.startUrl)) ?? context?.pages()[0];
    if (!page) return;
    const session = await context.newCDPSession(page);
    try {
      const {windowId} = await session.send('Browser.getWindowForTarget');
      await session.send('Browser.setWindowBounds', {windowId, bounds: {windowState: visible ? 'normal' : 'minimized'}});
      if (visible) {
        this.backgroundProfiles.delete(id);
        await page.bringToFront();
      } else {
        this.backgroundProfiles.add(id);
      }
    } finally {
      await session.detach();
    }
  }
  async openProfile(id) {
    assertMuseNewTask(this.store);
    if (this.chatting.has(id)) {
      await this.setProfileVisibility(id, true);
      return true;
    }
    const url = this.connection()?.startUrl;
    if (!url) throw Error('Điền URL ở Trang Muse trước khi mở profile.');
    const alreadyOpen = this.contexts.has(id);
    const context = await this.context(id);
    if (alreadyOpen && !this.active.has(id)) await this.connectVpn(id,context);
    const page = context.pages?.().find(page => page.url().startsWith(new URL(url).origin + '/')) ?? await context.newPage();
    if (!page.url || page.url() === 'about:blank') await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 30000});
    else if (!page.url().startsWith(new URL(url).origin + '/')) await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 30000});
    if (context.newCDPSession) await this.setProfileVisibility(id, true);
    if (!this.active.has(id)) await this.checkProfile(id);
    return true;
  }
  note(id, note) {
    const job = this.store.job(id);
    const now = Date.now();
    this.store.put({...job, updatedAt: now, history: [...job.history, {at: now, state: job.state, profileId: job.profileId, note}].slice(-100)});
  }
  profileHealth(id, health) {
    this.store.set('profiles', this.store.get('profiles', []).map(profile => profile.id === id
      ? {...profile, health, session: health === 'ready' ? 'signed_in' : health === 'login_required' ? 'expired' : profile.session, checkedAt: Date.now()}
      : profile));
  }
  async closeProfile(id) {
    if (this.chatting.has(id)) throw Error('Chờ chat Muse kết thúc trước khi đóng profile.');
    if (this.closing.has(id)) return this.closing.get(id);
    if (this.active.has(id) || this.checking.has(id)) throw Error('Profile đang có job. Tạm dừng giao mới và chờ job kết thúc.');
    const pending = (async () => {
      await this.opening.get(id)?.catch(() => {});
      if (this.active.has(id) || this.checking.has(id)) throw Error('Profile đang có job. Tạm dừng giao mới và chờ job kết thúc.');
      await this.contexts.get(id)?.close();
      return true;
    })();
    this.closing.set(id, pending);
    try { return await pending; }
    finally { this.closing.delete(id); this.tick(); }
  }
  async checkAllProfiles() {
    assertMuseNewTask(this.store);
    const profiles = this.store.get('profiles', []).filter(profile => profile.enabled && !this.active.has(profile.id));
    const failures = [];
    for (const profile of profiles) {
      try { await this.checkProfile(profile.id); }
      catch { failures.push(profile.name); }
    }
    if (failures.length) throw Error('Cần kiểm tra kết nối của ' + failures.join(', '));
    return true;
  }
  async openResult(payload) {
    assertMuseNewTask(this.store);
    const job = this.store.job(payload.id);
    const profileId = job.profileId;
    if (!profileId || !job.providerUrl) throw Error('Lượt tạo chưa lưu hội thoại Muse.');
    const url = new URL(job.providerUrl);
    if (!this.config() || url.protocol !== 'https:' || url.origin !== new URL(this.config().startUrl).origin || url.username || url.password) {
      throw Error('Hội thoại cần thuộc đúng trang Muse đã cấu hình.');
    }
    if (this.active.has(profileId) || this.chatting.has(profileId) || this.checking.has(profileId) || this.closing.has(profileId)) {
      throw Error('Hồ sơ đang xử lý tác vụ. Chờ tác vụ kết thúc rồi mở hội thoại.');
    }
    this.chatting.add(profileId);
    try {
      const context = await this.context(profileId);
      await this.connectVpn(profileId, context);
      const page = context.pages().find(page => page.url() === url.href) ?? await context.newPage();
      await page.goto(url.href, {waitUntil:'domcontentloaded', timeout:30000});
      await this.setProfileVisibility(profileId, true);
      await page.bringToFront();
      return true;
    } finally {
      this.chatting.delete(profileId);
      this.tick();
    }
  }

  async recheckResult({id}) {
    await this.assertJobNotSkipped(id);
    assertMuseNewTask(this.store);
    const job = this.store.job(id);
    const profileId = job.profileId;
    if (job.state !== 'needs_attention' || job.providerId || !job.providerResponse || !job.providerUrl || !profileId) {
      throw Error('Chỉ kiểm tra lại lượt đã có phản hồi Muse nhưng chưa có file.');
    }
    if (this.active.has(profileId) || this.chatting.has(profileId) || this.checking.has(profileId) || this.closing.has(profileId)) {
      throw Error('Hồ sơ đang bận. Chờ tác vụ hiện tại kết thúc.');
    }
    this.chatting.add(profileId);
    let page;
    try {
      const context = await this.context(profileId);
      await this.connectVpn(profileId, context);
      page = await context.newPage();
      const result = await new MuseAdapter(this.config()).inspectResponse(page, job);
      const current = this.store.job(id);
      if (current.state !== 'needs_attention' || current.providerId || current.providerUrl !== job.providerUrl) {
        throw Error('Tác vụ đã thay đổi trong lúc kiểm tra. Tải lại để xem trạng thái mới.');
      }
      if (result.providerId) {
        this.linkResult({id, providerId: result.providerId, url: result.providerUrl});
        this.note(id, 'Đã tìm thấy file trong hội thoại cũ. Chọn Tiếp tục lấy kết quả.');
      } else {
        this.store.transition(id, 'failed', {note: 'Đã kiểm tra lại hội thoại Muse. Phản hồi đã kết thúc và chỉ có văn bản. Có thể thêm lượt tạo nháp để thử lại.'});
      }
      return this.store.job(id);
    } finally {
      await page?.close().catch(() => {});
      this.chatting.delete(profileId);
      this.tick();
    }
  }

  async checkProfile(id) {
    assertMuseNewTask(this.store);
    if (this.chatting.has(id)) throw Error('Profile đang chat. Hạn mức sẽ cập nhật sau tác vụ.');
    if (this.active.has(id)) throw Error('Profile đang chạy. Hạn mức sẽ cập nhật sau tác vụ.');
    if (this.checking.has(id)) return this.checking.get(id);
    const pending = (async () => {
      let page;
      const wasOpen = this.contexts.has(id);
      try {
        const context = await this.context(id,true);
        if (wasOpen) await this.connectVpn(id,context);
        page = await context.newPage();
        let ip = null;
        try {
          const response = await page.goto('https://api.ipify.org?format=json',{waitUntil:'domcontentloaded',timeout:20000});
          if (response?.ok()) {
            const value = JSON.parse(await page.locator('body').innerText()).ip;
            if (typeof value === 'string' && value.length < 60) ip = value;
          }
        } catch {}
        const config = this.config();
        const session = config ? await new MuseAdapter(config).session(page) : null;
        this.updateProfile(id,{health:session === true ? 'ready' : session === false ? 'login_required' : 'flow_required',
          session:session === true ? 'signed_in' : session === false ? 'expired' : 'unknown',ip,checkedAt:Date.now()});
        if (session) await this.measureQuota(id,context);
        else this.updateProfile(id,{quota:{state:'login_required',checkedAt:Date.now(),message:'Đăng nhập Muse để đọc hạn mức.'}});
        if (!wasOpen) await this.setProfileVisibility(id,false);
        return true;
      } catch (error) {
        this.updateProfile(id,{health:'connection_error',checkedAt:Date.now()});
        throw error;
      } finally {
        await page?.close().catch(() => {});
      }
    })();
    this.checking.set(id,pending);
    try { return await pending; } finally { this.checking.delete(id); this.tick(); }
  }
  async enqueue(payload,{profileId,batchId}={}){
    assertMuseNewTask(this.store);
    await this.validateMediaProvider?.(payload);
    assertMuseAvailable(this.store);
    assertDiskSpace(this.root,32*1024**2,storagePolicy(this.store));
    const d=jobInput.parse(payload);
    for(const r of d.references)if(createHash('sha256').update(r.bytes).digest('hex')!==r.sha256)throw Error('Reference tải về sai checksum.');
    const fp=jobFingerprint(d),refDir=join(this.root,'references');
    await mkdir(refDir,{recursive:true});
    const refs=[];
    for(const r of d.references){
      const ext=r.type==='image/jpeg'?'.jpg':r.type==='image/png'?'.png':'.webp',path=join(refDir,r.sha256+ext);
      await writeFile(path,r.bytes);const {bytes,...rest}=r;refs.push({...rest,path});
    }
    const legacyFingerprint=jobFingerprint({...d,references:d.references.map(({role,...reference})=>reference)});
    assertMuseNewTask(this.store);
    if(profileId){
      if(this.deleting.has(profileId)||!this.store.get('profiles',[]).some(p=>p.id===profileId&&p.enabled))throw Error('Hồ sơ đã xóa, đang xóa hoặc đang tắt. Chưa thêm lượt tạo.');
      if(batchId&&this.store.batch()?.id!==batchId)throw Error('Đợt hạn mức Muse đã thay đổi. Chưa thêm lượt tạo.');
    }
    const result=this.store.enqueue({...d,references:refs},fp,legacyFingerprint);
    if(profileId){
      if(result.job.preferredProfileId&&result.job.preferredProfileId!==profileId)throw Error('Lượt tạo đã gắn hồ sơ khác.');
      if(!result.job.preferredProfileId)result.job=this.store.put({...result.job,preferredProfileId:profileId,deploymentBatchId:batchId});
      else if(result.job.deploymentBatchId!==batchId)throw Error('Lượt tạo thuộc đợt Muse khác. Giữ nguyên để đối soát.');
    }
    return result;
  }
  async enqueueAndRun(payload) {
    assertMuseNewTask(this.store);
    const dispatchVersion = this.dispatchVersion;
    if (!this.config()?.enabled) throw Error('Cấu hình luồng Muse trước khi tạo và chạy.');
    if (!this.store.get('profiles', []).some(profile => profile.enabled)) throw Error('Thêm profile và đăng nhập Muse trong Tài khoản.');
    const result = await this.enqueue(payload);
    if (result.job.state === 'queued' && dispatchVersion === this.dispatchVersion) {
      await this.start({count: 1, jobIds: [result.job.id], maxConcurrent: this.maxConcurrent});
    }
    return {...result, job: this.store.job(result.job.id)};
  }
  async start({count, maxConcurrent, jobIds}) {
    assertMuseNewTask(this.store);
    const dispatchVersion = this.dispatchVersion;
    if (!Number.isInteger(count) || count < 1 || count > 30) throw Error('Mỗi lần chạy tối đa 30 tác vụ.');
    if (!this.config()?.enabled) throw Error('Luồng Muse chưa được bật.');
    await this.checkToolchain();
    assertDiskSpace(this.root,64*1024**2,storagePolicy(this.store));
    if (dispatchVersion !== this.dispatchVersion) return false;
    assertMuseNewTask(this.store);
    const queued = this.store.jobs().reverse().filter(job => job.state === 'queued');
    const pending = jobIds ? queued.filter(job => jobIds.includes(job.id)) : queued.slice(0, count);
    if (pending.length !== count) throw Error('Số lượt vượt số job nháp hiện có.');
    if (!this.store.get('profiles', []).some(profile => profile.enabled)) throw Error('Thêm profile và đăng nhập Muse trong Tài khoản.');
    for (const job of pending) await this.validateMediaProvider?.(job.request);
    if (dispatchVersion !== this.dispatchVersion) return false;
    assertMuseNewTask(this.store);
    for (const job of pending) {
      this.attemptedProfiles.set(job.id, new Set());
      this.memoryRecoveryAttempts.delete(job.id);
    }
    this.approvedIds = [...new Set([...this.approvedIds, ...pending.map(job => job.id)])];
    this.maxConcurrent = Math.max(1, Math.min(4, Number(maxConcurrent) || 1));
    this.budget = this.approvedIds.length;
    this.paused = false;
    this.tick();
    return true;
  }
  pause() {
    this.dispatchVersion++;
    for (const id of this.approvedIds) this.note(id, 'Đã dừng giao mới. Tác vụ đang chờ trong app.');
    this.paused = true;
    this.budget = 0;
    this.approvedIds = [];
    return true;
  }
  newBatch() {
    if (this.chatting.size) throw Error('Chờ chat Muse kết thúc trước khi mở đợt mới.');
    if (this.active.size) throw Error('Chờ tác vụ tạo media kết thúc trước khi mở đợt mới.');
    const batch = this.store.newBatch();
    this.pause();
    return batch;
  }
  tick() {
    if (museIsPaused(this.store) || this.paused || this.reclaimingMemory || !this.approvedIds.length || this.active.size >= this.maxConcurrent) return;
    const disk=this.diskStatus();
    if(disk.blocked){for(const id of this.approvedIds)this.note(id,disk.message);this.paused=true;return;}
    const profiles = this.store.get('profiles', []).filter(profile => profile.enabled)
      .sort((a, b) => Number(this.contexts.has(b.id)) - Number(this.contexts.has(a.id))
        || Number(b.health === 'ready') - Number(a.health === 'ready'));
    for (const id of [...this.approvedIds]) {
      if (this.active.size >= this.maxConcurrent) break;
      if (this.store.job(id).state !== 'queued') {
        this.approvedIds = this.approvedIds.filter(candidate => candidate !== id);
        continue;
      }
      const queuedJob=this.store.job(id);
      if(queuedJob.deploymentBatchId&&queuedJob.deploymentBatchId!==this.store.batch()?.id){this.note(id,'Đợt Muse đã thay đổi; chưa giao tác vụ từ đợt cũ.');this.approvedIds=this.approvedIds.filter(candidate=>candidate!==id);continue;}
      const attempted = this.attemptedProfiles.get(id) ?? new Set();
      const candidates = profiles.filter(profile => (!queuedJob.preferredProfileId||profile.id===queuedJob.preferredProfileId)&&!this.deleting.has(profile.id)&&!attempted.has(profile.id));
      const profile = candidates.find(profile => !this.active.has(profile.id) && !this.checking.has(profile.id) && !this.closing.has(profile.id) && !this.chatting.has(profile.id));
      if (!profile && candidates.length) continue;
      if (!profile) {
        this.note(id, 'Chưa có hồ sơ Muse dùng được. Kiểm tra phiên và hạn mức Muse trong Tài khoản, rồi bấm Chạy cảnh để tiếp tục.');
        this.approvedIds = this.approvedIds.filter(candidate => candidate !== id);
        continue;
      }
      if (!this.contexts.has(profile.id) && this.memory() / 1024 ** 3 < 1.5) {
        const idle = [...this.contexts.keys()].filter(candidate => candidate !== profile.id && this.backgroundProfiles.has(candidate)
          && !this.active.has(candidate) && !this.chatting.has(candidate) && !this.checking.has(candidate)
          && !this.closing.has(candidate) && !this.opening.has(candidate));
        if (idle.length && !this.memoryRecoveryAttempts.has(id)) {
          this.memoryRecoveryAttempts.add(id);
          this.reclaimingMemory = true;
          this.note(id, 'Đang đóng hồ sơ chạy nền đã rảnh để giải phóng RAM.');
          void this.reclaimMemory(id, idle);
          return;
        }
        this.note(id, 'RAM trống chưa đủ để mở thêm browser. Tác vụ được giữ trong hàng chờ.');
        this.approvedIds = this.approvedIds.filter(candidate => candidate !== id);
        continue;
      }
      attempted.add(profile.id);
      this.attemptedProfiles.set(id, attempted);
      this.approvedIds = this.approvedIds.filter(candidate => candidate !== id);
      this.store.transition(id, 'preflight', {profileId: profile.id, note: 'Đang mở profile ' + profile.name + ' và kiểm tra phiên Muse.'});
      this.active.set(profile.id, id);
      void this.run(id, profile.id).finally(() => {
        this.active.delete(profile.id);
        this.tick();
      });
    }
    this.budget = this.approvedIds.length;
  }
  async reclaimMemory(jobId, profileIds) {
    try {
      for (const profileId of profileIds) {
        if (this.paused || this.memory() / 1024 ** 3 >= 1.5) break;
        // Recheck visibility and locks because the user may have opened a profile while another closes.
        if (!this.backgroundProfiles.has(profileId) || this.active.has(profileId) || this.chatting.has(profileId)
          || this.checking.has(profileId) || this.closing.has(profileId) || this.opening.has(profileId)) continue;
        await this.closeProfile(profileId);
      }
    } catch {
      this.note(jobId, 'Chưa đóng được một hồ sơ chạy nền. Đang kiểm tra lại RAM.');
    } finally {
      this.reclaimingMemory = false;
      this.tick();
    }
  }
  async run(id, profileId, resume = false) {
    const check = this.assertJobNotSkipped(id);
    if (check) await check;
    return runMuseTask(this.store, {jobId:id, profileId}, () => this.runAdmitted(id, profileId, resume));
  }
  async runAdmitted(id, profileId, resume) {
    let page;
    try {
      if(!resume)await this.validateMediaProvider?.(this.store.job(id).request, {admitted:true});
      assertMuseAvailable(this.store, {jobId:id, profileId});
      assertDiskSpace(this.root,64*1024**2,storagePolicy(this.store));
      const alreadyOpen = this.contexts.has(profileId);
      const context = await this.context(profileId, true);
      if (alreadyOpen) await this.connectVpn(profileId,context);
      const startUrl = new URL(this.config().startUrl);
      page = context.pages().find(tab => {
        try { return new URL(tab.url()).origin === startUrl.origin; } catch { return false; }
      }) ?? await context.newPage();
      await this.setProfileVisibility(profileId, false);
      this.note(id, 'Browser Muse đang chạy nền.');
      if (this.store.get('profiles',[]).find(profile => profile.id === profileId)?.vpnEnabled) this.note(id,'Touch VPN đã kết nối trong profile.');
      const adapter = new MuseAdapter(this.config());
      const checkpoint = (state, patch = {}) => {
        assertMuseAvailable(this.store, {jobId:id, profileId});
        return state === 'submitting'
          ? this.store.beginSubmit(id, profileId, {note: labels[state], ...patch})
          : this.store.transition(id, state, {note: labels[state], ...patch});
      };
      if (!resume) {
        const profile = this.store.get('profiles', []).find(profile => profile.id === profileId);
        const quotaNeedsRefresh = quota => !quota || (
          quota.state !== 'available'
          || museQuotaExhausted(quota)
          || (quota.weeklyRemainingPercent === 0 && !(quota.additionalTokens > 0))
        );
        if (quotaNeedsRefresh(profile?.quota)) {
          const refreshed = await this.measureQuota(profileId, context);
          if (quotaNeedsRefresh(refreshed)) {
            let code = 'MUSE_QUOTA_UNCONFIRMED';
            if (refreshed?.state === 'login_required') {
              code = 'MUSE_LOGIN_REQUIRED';
            } else if (refreshed?.state === 'exhausted'
              || (refreshed?.state === 'available' && museQuotaExhausted(refreshed))) {
              code = 'MUSE_QUOTA_EXHAUSTED';
            }
            const error = Error(safeMessage({code}));
            error.code = code;
            throw error;
          }
        }
        await adapter.prepare(page, this.store.job(id).request);
        this.profileHealth(profileId, 'ready');
        this.store.transition(id, 'prepared', {note: 'Đã đính kèm reference và điền prompt.'});
        assertMuseAvailable(this.store, {jobId:id, profileId});
        await adapter.submit(page, checkpoint);
      }
      const job = this.store.job(id);
      const directory = join(this.root, 'outputs');
      await mkdir(directory, {recursive: true});
      const extension = job.request.mediaType === 'video' ? 'mp4' : 'png';
      const requestedOutput = join(directory, `${id}.${extension}`);
      assertDiskSpace(this.root,64*1024**2,storagePolicy(this.store));
      const output = await adapter.fetch(page, job, checkpoint, requestedOutput);
      this.store.transition(id, 'validating', {failedFilePath: output, note: 'Đang kiểm tra định dạng, tỷ lệ, thời lượng và giải mã file.'});
      const report = await this.validateOutput(output, job.request);
      this.store.transition(id, 'ready', {
        failedFilePath: null,
        output: {path: output, name: output.split(/[\\/]/).at(-1), ...(adapter.compression?{compression:adapter.compression}:{}), ...report},
        note: 'Đã ghi file và giải mã toàn bộ; vẫn cần người duyệt nội dung.',
      });
      await this.importReady(id);
      await this.measureQuota(profileId,context);
    } catch (error) {
      const job = this.store.job(id);
      if(job.state==='preflight'&&error.code==='STORAGE_LOW'){this.store.transition(id,'queued',{note:error.message});this.paused=true;return;}
      if (job.state === 'preflight' && ['MUSE_LOGIN_REQUIRED', 'MUSE_PROFILE_UNAVAILABLE', 'MUSE_VPN_REQUIRED', 'MUSE_QUOTA_EXHAUSTED', 'MUSE_QUOTA_UNCONFIRMED'].includes(error.code)) {
        if (!['MUSE_QUOTA_EXHAUSTED', 'MUSE_QUOTA_UNCONFIRMED'].includes(error.code)) this.profileHealth(profileId, error.code === 'MUSE_LOGIN_REQUIRED' ? 'login_required' : 'connection_error');
        this.store.transition(id, 'queued', {profileId: null, note: safeMessage(error) + ' Đang chọn profile khác.'});
        if (!this.paused) this.approvedIds.push(id);
        await this.contexts.get(profileId)?.close().catch(() => {});
        return;
      }
      if (!['ready', 'failed', 'cancelled', 'needs_attention'].includes(job.state)) {
        const failed = ['preflight', 'prepared', 'validating'].includes(job.state);
        this.store.transition(id, failed ? 'failed' : 'needs_attention', {
          ...(error.code === 'MUSE_NO_MEDIA' ? {providerUrl:error.providerUrl,providerResponse:error.providerResponse} : {}),
          note: job.state === 'validating'
            ? 'File không đạt tỷ lệ/thời lượng hoặc không giải mã được. Giữ file trên máy để xem lại.'
            : safeMessage(error),
        });
      }
      if (page) {
        const diagnosticPath = join(this.root, 'diagnostics', `${id}.png`);
        await mkdir(join(this.root, 'diagnostics'), {recursive: true});
        await page.screenshot({path: diagnosticPath, fullPage: false}).catch(() => {});
        this.store.put({...this.store.job(id), diagnosticPath});
      }
    }
  }
  async importReady(id) {
    if (!this.receiveOutput || this.store.job(id).state !== 'ready' || this.store.job(id).importedAt) return;
    this.imports ??= new Map();
    if (this.imports.has(id)) return this.imports.get(id);
    const pending = (async () => {
      try {
        await this.receiveOutput(id);
        const job = this.store.job(id);
        const now = Date.now();
        this.store.put({...job, importedAt: now, importError: null,
          history: [...job.history, {at: now, state: 'ready', profileId: job.profileId, note: 'Đã tự nhập file vào đúng cảnh trong Thư viện.'}].slice(-100)});
      } catch (error) {
        const job = this.store.job(id);
        this.store.put({...job, importError: error.message,
          history: [...job.history, {at: Date.now(), state: 'ready', note: `Nhập file cần xử lý. ${error.message}`}].slice(-100)});
      }
    })();
    this.imports.set(id, pending);
    try { await pending; } finally { this.imports.delete(id); }
  }
  assertJobNotSkipped(id) {
    let job;
    try { job = this.store.job(id); }
    catch (error) { assertMuseNewTask(this.store); throw error; }
    if ((job.provider ?? 'muse') !== 'muse' || !['needs_attention', 'unknown'].includes(job.state)) return;
    // Local production records are authoritative; never infer this decision from job history.
    return (async () => {
      if (!this.readProductionRecord) throw Error('Chưa đọc được cảnh để kiểm tra quyết định bỏ qua đối soát.');
      const project = await this.readProductionRecord(job.request.projectId);
      const scene = project?.data.scenes.find(row => row.id === job.request.sceneId);
      if (!scene) throw Error('Không tìm thấy cảnh để kiểm tra quyết định bỏ qua đối soát.');
      if (mediaProviderReceipts({jobs:[job], scene, projectId:project.id})[0]?.reconciled) {
        throw Error('Đã bỏ qua kết quả Muse cũ; app sẽ không gửi lại.');
      }
    })();
  }
  async retry(id) {
    await this.assertJobNotSkipped(id);
    return this.store.retry(id);
  }
  async resume(id) {
    await this.assertJobNotSkipped(id);
    assertMuseNewTask(this.store);
    const job = this.store.job(id);
    if (this.chatting.has(job.profileId)) throw Error('Chờ chat Muse kết thúc trước khi tiếp tục job.');
    if (job.state !== 'needs_attention' || !job.providerId || !job.providerUrl || !job.profileId) {
      throw Error('Thiếu mã kết quả để tiếp tục an toàn. Mở profile và đối soát thủ công.');
    }
    if (this.active.has(job.profileId)) throw Error('Profile đang có job khác.');
    if (this.active.size >= this.maxConcurrent) throw Error('Đã đủ số tác vụ chạy đồng thời. Chờ tác vụ hiện tại kết thúc.');
    if (this.checking.has(job.profileId)) throw Error('Profile đang được kiểm tra. Chờ kiểm tra kết thúc.');
    if (this.closing.has(job.profileId)) throw Error('Profile đang đóng browser. Chờ đóng xong rồi tiếp tục lấy kết quả.');
    if (!this.contexts.has(job.profileId) && this.memory() / 1024 ** 3 < 1.5) throw Error('RAM trống chưa đủ để mở thêm browser.');
    this.store.transition(id, 'submitted', {note: 'Tiếp tục mã kết quả cũ; không bấm tạo mới.'});
    this.active.set(job.profileId, id);
    void this.run(id, job.profileId, true).finally(() => {
      this.active.delete(job.profileId);
      this.tick();
    });
    return true;
  }
  linkResult({id,providerId,url}){const j=this.store.job(id);if(j.state!=='needs_attention'||!j.profileId)throw Error('Chỉ đối soát job đã bị gián đoạn.');if(!/^[a-zA-Z0-9_-]{1,200}$/.test(providerId)||(!this.config()||new URL(url).origin!==new URL(this.config().startUrl).origin||new URL(url).username||new URL(url).password))throw Error('Cần mã kết quả và URL Muse hợp lệ.');this.store.put({...j,providerId,providerUrl:url,history:[...j.history,{at:Date.now(),state:'needs_attention',note:'Người dùng chỉ định kết quả cũ để đối soát; chưa xác nhận file.'}]});return true;}
  cancel(id){const j=this.store.job(id);if(j.state!=='queued')throw Error('Chỉ hủy job chưa gửi. Chưa có xác nhận hủy từ Muse.');this.store.transition(id,'cancelled',{note:'Hủy nháp local, chưa có lượt gửi.'});return true;}
  diskStatus(){return diskStatus(this.root,storagePolicy(this.store));}
  status(){return {storage:this.diskStatus(),version:'0.2.0',profiles:this.profiles(),jobs:this.store.jobs().map(j=>({...j,profileName:(this.store.get('profiles',[]).find(p=>p.id===j.profileId)??this.store.get('deleted_profiles',[]).find(p=>p.id===j.profileId))?.name,provider:j.provider??'muse',request:{...j.request,references:j.request.references.map(({path,...r})=>r)},label:j.importedAt?'Đã vào Thư viện':j.importError?'File đã tải · lỗi nhập':labels[j.state]})),paused:this.paused,active:this.active.size,budget:this.budget,batch:this.store.batch(),freeRamGb:Math.round(this.memory()/1024**3*10)/10,adapter:this.config(),connection:this.connection(),musePaused:museIsPaused(this.store),generationReady:!museIsPaused(this.store)&&!!this.config()?.enabled};}
  async output(id){const j=this.store.job(id);if(j.state!=='ready'||!j.output)throw Error('Chưa có file đã kiểm tra.');const bytes=new Uint8Array(await readFile(j.output.path));if(createHash('sha256').update(bytes).digest('hex')!==j.output.sha256)throw Error('File đã thay đổi sau kiểm tra.');return {bytes,name:j.output.name,type:j.request.mediaType==='video'?'video/mp4':({'.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.png':'image/png'}[extname(j.output.path)]||'image/png'),sha256:j.output.sha256};}
  acknowledge(id,assetId){if(!/^[a-zA-Z0-9_-]{1,120}$/.test(assetId))throw Error('Asset ID không hợp lệ.');this.store.put({...this.store.job(id),uploadedAssetId:assetId});return true;}
  async render(payload,ass=null){assertDiskSpace(this.root,256*1024**2,storagePolicy(this.store));const {z}=await import('zod');const d=z.object({ratio:z.enum(['9:16','16:9','1:1','4:3','3:4']),clips:z.array(z.object({bytes:z.instanceof(Uint8Array),sha256:z.string().regex(/^[a-f0-9]{64}$/),duration:z.number().positive().max(120)})).min(1).max(30)}).parse(payload);if(d.clips.reduce((n,c)=>n+c.bytes.length,0)>60*1024*1024)throw Error('Tổng nguồn tối đa 60 MB.');await toolchain();const id=randomUUID(),dir=join(this.root,'renders',id);await mkdir(dir,{recursive:true});const clips=[];for(const [i,c] of d.clips.entries()){if(createHash('sha256').update(c.bytes).digest('hex')!==c.sha256)throw Error('Nguồn dựng sai checksum.');const path=join(dir,`${i}.mp4`);await writeFile(path,c.bytes);await validateMedia(path,{mediaType:'video',ratio:d.ratio,duration:c.duration});clips.push({path,duration:c.duration,audio:await hasAudio(path)});}const path=join(dir,'output.mp4'),report=await renderClips(clips,d.ratio,path,{ass});for(const clip of clips)await unlink(clip.path);return {bytes:new Uint8Array(await readFile(path)),name:`render_${id}.mp4`,type:'video/mp4',path,...report};}
}
