import {InstagramAdapter, instagramPostUrl} from './instagram-adapter.mjs';

export const metricKeys = ['views','likes','comments','saves','shares','profileVisits','linkClicks','viewers','interactions','reelInteractions','accountsEngaged','profileActivity','follows'];
const labels = {
  views: ['views','lượt xem'], viewers: ['viewers','người xem','số người xem'],
  likes: ['likes','lượt thích'], comments: ['comments','bình luận'], saves: ['saves','lượt lưu'], shares: ['shares','lượt chia sẻ'],
  interactions: ['interactions','lượt tương tác'], reelInteractions: ['reels interactions','reel interactions','lượt tương tác với thước phim'],
  accountsEngaged: ['accounts engaged','tài khoản đã tương tác'], profileActivity: ['profile activity','hoạt động trên trang cá nhân'],
  follows: ['follows','lượt theo dõi'], profileVisits: ['profile visits','lượt truy cập trang cá nhân'],
  linkClicks: ['external link taps','website taps','lượt nhấn vào liên kết bên ngoài','lượt nhấn vào trang web'],
};
const normalized = value => String(value).replace(/\s+/g,' ').trim().toLowerCase();

export function instagramCount(value) {
  const text = String(value).trim().replace(/[\u00a0\u202f]/g,' ');
  if (/^(?:--?|—|–|n\/a|not available|chưa có dữ liệu)$/i.test(text)) return {value:null, approximate:false};
  const short = text.match(/^(\d+(?:[.,]\d+)?)\s*(k|m|b|nghìn|triệu|tỷ)$/i);
  if (short) {
    const factors = {k:1e3,m:1e6,b:1e9,'nghìn':1e3,'triệu':1e6,'tỷ':1e9};
    const count = Number(short[1].replace(',','.')) * factors[short[2].toLowerCase()];
    return Number.isFinite(count) && count <= 1e12 ? {value:Math.round(count),approximate:true} : undefined;
  }
  if (!/^\d+$|^\d{1,3}(?:,\d{3})+$|^\d{1,3}(?:\.\d{3})+$|^\d{1,3}(?: \d{3})+$/.test(text)) return undefined;
  const count = Number(text.replace(/[,. ]/g,''));
  return Number.isSafeInteger(count) && count <= 1e12 ? {value:count,approximate:false} : undefined;
}

export function parseInstagramInsights(text) {
  const lines = String(text).split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  const metrics = Object.fromEntries(metricKeys.map(key=>[key,null]));
  const approximate = [];
  const reported = [];
  for (const key of metricKeys) {
    const candidates = [];
    for (let index=0; index<lines.length-1; index++) {
      if (!labels[key].includes(normalized(lines[index]))) continue;
      const count = instagramCount(lines[index+1]);
      if (count) candidates.push(count);
    }
    if (!candidates.length) continue;
    // Ambiguous duplicate rows are unavailable, never summed or guessed.
    if (candidates.some(item=>item.value !== candidates[0].value || item.approximate !== candidates[0].approximate)) continue;
    reported.push(key); metrics[key]=candidates[0].value;
    if (candidates[0].approximate) approximate.push(key);
  }
  return {metrics,approximate,reported};
}

export class InstagramInsights {
  constructor(adapter = new InstagramAdapter()) {this.adapter=adapter;}
  async read(page, target) {
    const sourceUrl = instagramPostUrl(target.postUrl);
    if (!sourceUrl || !/^[a-zA-Z0-9._]{1,30}$/.test(target.handle) || !/^\d+$/.test(target.userId)) throw Error('Chưa xác nhận đúng tài khoản hoặc bài đăng để đo.');
    await page.goto(sourceUrl,{waitUntil:'domcontentloaded',timeout:45000});
    let session;const deadline=Date.now()+20000;
    do {
      session=await this.adapter.session(page);
      if(session.session!=='unknown')break;
      await page.waitForTimeout(250);
    }while(Date.now()<deadline);
    if(session.session!=='signed_in')throw Object.assign(Error('Đăng nhập Instagram để tiếp tục cập nhật số liệu.'),{code:'login_required'});
    if(session.userId!==target.userId || session.handle.toLowerCase()!==target.handle.toLowerCase())throw Error('Hồ sơ đang đăng nhập tài khoản khác tài khoản của bài đăng.');
    if(instagramPostUrl(page.url())!==sourceUrl)throw Error('Instagram đã chuyển sang trang khác bài cần đo.');
    await this.adapter.dismissPrompts(page);
    const main=page.locator('main').first();
    await main.locator(`a[href="/${target.handle}/"]`).first().waitFor({state:'attached',timeout:20000});
    const insights=main.getByRole('button',{name:/^View insights$|^Xem thông tin chi tiết$/i})
      .or(main.getByRole('link',{name:/^View insights$|^Xem thông tin chi tiết$/i}));
    try {await insights.first().waitFor({timeout:15000});}
    catch {throw Object.assign(Error('Instagram chưa cung cấp Insights cho bài này. Kiểm tra quyền xem số liệu của tài khoản.'),{code:'unavailable'});}
    await insights.first().click();
    await page.waitForURL(url=>url.origin==='https://www.instagram.com'&&/^\/insights\/media\/\d+\/?$/.test(url.pathname),{timeout:20000});
    const insightsUrl=page.url();
    await page.getByRole('heading',{name:/^Interactions$|^Lượt tương tác$/i}).waitFor({timeout:20000});
    // Require labelled rows, not just an empty shell or a loading placeholder.
    await page.waitForFunction(() => {
      const text=document.body.innerText;
      return /(?:Likes|Lượt thích)\s*\n\s*(?:\d|--|—)/i.test(text) && /(?:Saves|Lượt lưu)\s*\n\s*(?:\d|--|—)/i.test(text);
    },null,{timeout:20000});
    const text=await page.locator('body').innerText();
    const parsed=parseInstagramInsights(text);
    if(parsed.reported.length<3)throw Error('Giao diện Insights chưa có đủ dòng số liệu để đọc chính xác.');
    if(page.url()!==insightsUrl)throw Error('Trang Insights đã đổi trong lúc đo số liệu.');
    const cookies=await page.context().cookies('https://www.instagram.com');
    if(cookies.find(cookie=>cookie.name==='ds_user_id')?.value!==target.userId)throw Error('Phiên Instagram đã đổi trong lúc đo số liệu.');
    return {...parsed.metrics,approximate:parsed.approximate,source:'instagram_browser',sourceUrl,
      insightsUrl,handle:session.handle,observedAt:new Date().toISOString(),
      notes:'Số liệu cộng dồn Instagram hiển thị tại thời điểm đo. Chỉ số để trống hoặc không có trên trang được giữ là chưa có dữ liệu.'};
  }
}
