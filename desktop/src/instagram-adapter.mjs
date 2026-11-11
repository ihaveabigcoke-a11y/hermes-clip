const origin = 'https://www.instagram.com';
const handlePattern = /^[a-zA-Z0-9._]{1,30}$/;
const reserved = new Set(['accounts', 'direct', 'explore', 'reels', 'reel', 'p', 'stories', 'create']);
const normalized = text => String(text ?? '').replace(/\s+/g, ' ').trim();

export function instagramPostUrl(value) {
  try {
    const url = new URL(value);
    const post = url.pathname.match(/^\/(?:([a-zA-Z0-9._]{1,30})\/)?(p|reels?)\/([a-zA-Z0-9_-]+)\/?$/);
    return url.protocol === 'https:' && ['instagram.com', 'www.instagram.com'].includes(url.hostname)
      && !url.username && !url.password && !url.port && post && (!post[1] || !reserved.has(post[1].toLowerCase()))
      ? origin + '/' + (post[2] === 'p' ? 'p' : 'reel') + '/' + post[3] + '/' : null;
  } catch { return null; }
}

export function instagramReceipt(body, job) {
  if (body?.status === 'fail' || body?.errors?.length) return null;
  const candidates = [];
  function visit(value, depth) {
    if (!value || typeof value !== 'object' || depth > 6) return;
    if (typeof value.code === 'string' && value.user) candidates.push(value);
    for (const child of Object.values(value)) visit(child, depth + 1);
  }
  visit(body, 0);
  const media = candidates.find(value => /^[a-zA-Z0-9_-]+$/.test(value.code)
    && value.media_type === 2
    && value.user.username?.toLowerCase() === job.handle.toLowerCase()
    && String(value.user.pk ?? value.user.id ?? '') === String(job.userId)
    && normalized(value.caption?.text ?? value.caption) === normalized(job.snapshot.caption)
    && Number(value.taken_at) * 1000 >= job.submittingAt - 120000
    && Number(value.taken_at) * 1000 <= job.submittingAt + 300000);
  if (!media) return null;
  return {postUrl: origin + '/reel/' + media.code + '/', source: 'instagram_response',
    shortcode: media.code, mediaId: String(media.pk ?? media.id ?? ''), handle: media.user.username, checkedAt: Date.now()};
}

export class InstagramAdapter {
  async session(page) {
    if (!/^https:\/\/(www\.)?instagram\.com\//.test(page.url())) return {session: 'unknown', handle: '', userId: ''};
    if (/\/challenge\/|\/checkpoint\/|\/accounts\/login/.test(page.url())) return {session: 'login_required', handle: '', userId: ''};
    if (await page.locator('input[name="username"],input[name="password"],input[type="password"],input[autocomplete="current-password"]').first().isVisible()) return {session: 'login_required', handle: '', userId: ''};
    const links = await page.locator('a').filter({has: page.getByText(/^(Profile|Trang cá nhân|Hồ sơ)$/i)}).evaluateAll(elements => elements.map(element => element.getAttribute('href')));
    const fallback = await page.locator('nav a:has(img[alt*="profile picture" i]),[role="navigation"] a:has(img[alt*="ảnh đại diện" i])').evaluateAll(elements => elements.map(element => element.getAttribute('href')));
    const cookies = await page.context().cookies(origin);
    const userId = cookies.find(cookie => cookie.name === 'ds_user_id')?.value;
    const signedInNavigation = await page.locator('a[href="/direct/inbox/"],svg[aria-label="New post"],svg[aria-label="Bài viết mới"]').first().isVisible();
    for (const href of [...links, ...fallback]) {
      const url = new URL(href || '/', origin);
      const handle = url.pathname.split('/').filter(Boolean);
      if (url.origin === origin && handle.length === 1 && handlePattern.test(handle[0]) && !reserved.has(handle[0].toLowerCase())
        && userId && signedInNavigation) return {session: 'signed_in', handle: handle[0], userId};
    }
    return {session: 'unknown', handle: '', userId: ''};
  }

  async dismissPrompts(page) {
    for (const name of [/^Not now$|^Lúc khác$|^Để sau$/i, /^Only allow essential cookies$|^Chỉ cho phép cookie thiết yếu$/i]) {
      const button = page.getByRole('button', {name}).first();
      if (await button.isVisible()) await button.click();
    }
  }

  async recentPosts(page, handle) {
    await page.goto(origin + '/' + handle + '/', {waitUntil: 'domcontentloaded', timeout: 45000});
    await page.locator('main').first().waitFor({timeout: 20000});
    await page.getByRole('link', {name: /^(Edit profile|Chỉnh sửa trang cá nhân|Chỉnh sửa hồ sơ)$/i})
      .or(page.getByRole('button', {name: /^(Edit profile|Chỉnh sửa trang cá nhân|Chỉnh sửa hồ sơ)$/i})).first().waitFor({timeout: 20000});
    // The profile header is interactive before its asynchronous media grid loads.
    // An empty baseline is valid only after Instagram explicitly shows no posts.
    await page.waitForFunction(() => {
      const main = document.querySelector('main');
      return main && (main.querySelector('a[href*="/reel/"],a[href*="/reels/"],a[href*="/p/"]')
        || /(?:^|\s)0\s+(?:posts?|bài viết)(?:\s|$)|no posts yet|chưa có bài viết/i.test(main.innerText));
    }, null, {timeout: 20000});
    return (await page.locator('main a[href*="/reel/"],main a[href*="/reels/"],main a[href*="/p/"]').evaluateAll(links => links.map(link => link.href)))
      .map(instagramPostUrl).filter(Boolean);
  }

  async prepare(page, job) {
    await this.dismissPrompts(page);
    const existing = page.getByRole('dialog').filter({has: page.locator('input[type="file"], [contenteditable="true"]')});
    if (await existing.count()) throw Error('Instagram đang có nội dung soạn dở. Lưu hoặc đóng nội dung đó rồi thử lại.');
    const beforeLinks = await this.recentPosts(page, job.handle);
    const create = page.getByRole('link', {name: /^Create$|^Tạo$/i})
      .or(page.getByRole('button', {name: /^Create$|^Tạo$/i}))
      .or(page.locator('svg[aria-label="New post"],svg[aria-label="Bài viết mới"]').locator('xpath=ancestor::*[self::a or @role="button" or @role="link"][1]')).first();
    await create.click();
    const post = page.getByText(/^Post$|^Bài viết$/i).filter({visible:true}).first();
    const dialog = page.getByRole('dialog').last();
    await post.or(dialog).first().waitFor({timeout:15000});
    if (await post.isVisible()) await post.click();
    await dialog.waitFor();
    // Profile pages also contain hidden avatar upload inputs. Only use the
    // video-capable input belonging to the opened post composer.
    const upload = dialog.locator('input[type="file"][accept*="video"]').first();
    await upload.waitFor({state: 'attached', timeout: 30000});
    await upload.setInputFiles(job.snapshot.path);
    const reelsNotice = dialog.getByRole('button', {name: /^OK$|^Đồng ý$|^Got it$|^Đã hiểu$/i}).first();
    await reelsNotice.or(dialog.getByRole('button', {name: /^Next$|^Tiếp$|^Tiếp theo$/i})).first().waitFor({timeout:90000});
    if (await reelsNotice.isVisible()) await reelsNotice.click();
    const crop = dialog.getByRole('button', {name: /Select crop|Chọn tỷ lệ|Chọn tỉ lệ/i})
      .or(dialog.locator('svg[aria-label="Select crop"]').locator('xpath=ancestor::*[@role="button" or self::button][1]')).first();
    if (await crop.isVisible()) {
      await crop.click();
      await dialog.getByText(/^Original$|^Gốc$|^Nguyên bản$/i).first().click();
    }
    const caption = dialog.locator('[contenteditable="true"][role="textbox"],textarea[aria-label*="caption" i],textarea[placeholder*="caption" i],textarea[aria-label*="chú thích" i]').first();
    for (let step = 0; step < 4; step += 1) {
      if (await caption.isVisible()) break;
      const next = dialog.getByRole('button', {name: /^Next$|^Tiếp$|^Tiếp theo$/i});
      await next.waitFor({timeout: 90000});
      await next.click();
      await caption.or(dialog.getByRole('button', {name: /^Next$|^Tiếp$|^Tiếp theo$/i})).first().waitFor({timeout: 30000});
    }
    await caption.fill(job.snapshot.caption);
    const entered = await caption.evaluate(element => element.value ?? element.innerText);
    if (normalized(entered) !== normalized(job.snapshot.caption)) throw Error('Chú thích trong Instagram chưa khớp nội dung đã chọn.');
    await dialog.getByRole('button', {name: /^Share$|^Chia sẻ$/i}).waitFor({timeout: 30000});
    return {beforeLinks: [...new Set(beforeLinks)], preparedAt: Date.now()};
  }

  async publish(page, job, beforeShare) {
    let receipt = null;
    let sharedWithoutLink = false;
    const reads = new Set();
    const onResponse = response => {
      if (response.request().method() !== 'POST' || !/^https:\/\/(www\.)?instagram\.com\//.test(response.url())
        || !/configure|graphql/.test(response.url()) || !response.ok()) return;
      const read = response.json().then(body => {receipt ??= instagramReceipt(body, job);}).catch(() => {}).finally(() => reads.delete(read));
      reads.add(read);
    };
    page.on('response', onResponse);
    try {
      await beforeShare();
      await page.getByRole('dialog').last().getByRole('button', {name: /^Share$|^Chia sẻ$/i}).click();
      const deadline = Date.now() + 120000;
      while (Date.now() < deadline) {
        if (receipt) return receipt;
        const shared = page.getByText(/^(Your reel has been shared\.?|Your post has been shared\.?|Đã chia sẻ thước phim của bạn\.?|Đã chia sẻ bài viết của bạn\.?)$/i);
        if (await shared.first().isVisible()) {
          const links = await page.getByRole('dialog').last().locator('a[href]').evaluateAll(elements => elements.map(element => element.href));
          const postUrl = links.map(instagramPostUrl).find(url => url && !job.beforeLinks.includes(url));
          if (postUrl) return {postUrl, source: 'instagram_success_dialog', handle: job.handle, checkedAt: Date.now()};
          sharedWithoutLink = true;
          break;
        }
        await page.waitForTimeout(1000);
      }
      await Promise.allSettled([...reads]);
      // Current Instagram confirms sharing without a permalink. Read the actual
      // post to obtain proof; never retry Share or treat the dialog alone as proof.
      return receipt ?? (sharedWithoutLink ? await this.reconcile(page, job) : null);
    } finally { page.off('response', onResponse); }
  }

  async reconcile(page, job) {
    // A restored browser can reach DOMContentLoaded before its account menu.
    // Wait only for an unknown session; never retry a login challenge or mismatch.
    let session = await this.session(page);
    const sessionDeadline = Date.now() + 20000;
    while (session.session === 'unknown' && Date.now() < sessionDeadline) {
      await page.waitForTimeout(250);
      session = await this.session(page);
    }
    if (session.session !== 'signed_in' || session.userId !== job.userId || session.handle.toLowerCase() !== job.handle.toLowerCase()) throw Error('Đăng nhập đúng tài khoản đã dùng cho lượt đăng này.');
    const links = await this.recentPosts(page, job.handle);
    const candidates = [...new Set(links)].filter(link => !job.beforeLinks.includes(link)).slice(0, 8);
    const matches = [];
    for (const postUrl of candidates) {
      await page.goto(postUrl, {waitUntil: 'domcontentloaded', timeout: 45000});
      const main = page.locator('main').first();
      await main.waitFor({timeout: 15000});
      const owner = main.locator(`a[href="/${job.handle}/"]`);
      const video = main.locator('video').first();
      try {
        await main.locator('time[datetime]').first().waitFor({state: 'attached', timeout: 15000});
        await video.waitFor({state: 'attached', timeout: 15000});
      } catch { continue; }
      let matchesVideo = false;
      if (await video.count()) {
        await video.evaluate(element => element.readyState >= 1 || new Promise(resolve => {
          element.addEventListener('loadedmetadata', () => resolve(true), {once:true});
          setTimeout(() => resolve(false), 8000);
        }));
        matchesVideo = await video.evaluate((element, expected) => Number.isFinite(element.duration)
          && Math.abs(element.duration - expected.duration) < 1
          && element.videoWidth > 0 && Math.abs(element.videoWidth / element.videoHeight - expected.width / expected.height) < .05, job.snapshot);
      }
      const content = await main.innerText();
      const timestamps = await main.locator('time[datetime]').evaluateAll(nodes => nodes.map(node => Date.parse(node.getAttribute('datetime'))));
      if (matchesVideo && await owner.count() && normalized(content).includes(normalized(job.snapshot.caption))
        && timestamps.some(time => time >= job.submittingAt - 120000 && time <= job.submittingAt + 300000)) matches.push(postUrl);
    }
    if (matches.length === 1) return {postUrl: matches[0], source: 'instagram_post_page', handle: job.handle, checkedAt: Date.now()};
    return null;
  }
}
