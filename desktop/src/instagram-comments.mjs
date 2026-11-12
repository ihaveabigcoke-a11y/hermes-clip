import {z} from 'zod';
import {buildUtmLink} from './utm.mjs';
import {apiMode} from './instagram-policy.mjs';
import {nextCursor} from './instagram-api.mjs';
import {instagramPostUrl} from './instagram-adapter.mjs';

export const COMMENTS_INTERVAL = 3 * 60 * 1000;
const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/);
const ruleInput = z.object({planId:identifier,enabled:z.boolean(),keyword:z.string().trim().min(2).max(40),
  template:z.string().trim().min(1).max(800).refine(value=>value.includes('{link}'),'Mẫu DM phải có {link}.'),
  requireFollow:z.boolean().default(true), approved:z.boolean()});
const normalize = value => String(value).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
// Whole words. Typos stay narrow because a false match sends an unsolicited DM:
// - keywords >= 4 letters: exact, plural "s"/"es", or one adjacent transposition (LINK ~ lnik);
// - keywords >= 6 letters: additionally one insertion/deletion/substitution.
// Short words like LINK/SHOP/WANT must not match pink/line/ink, stop/show/ship or went.
export function matchCta(text, keyword) {
  const wanted = normalize(keyword).trim();
  const words = normalize(text).match(/[\p{L}\p{N}]+/gu) ?? [];
  if (words.includes(wanted)) return true;
  if (!/^[\p{L}\p{N}]{4,40}$/u.test(wanted)) return false;
  const loose = wanted.length >= 6;
  return words.some(word => {
    if (word === wanted + 's' || word === wanted + 'es') return true;
    if (Math.abs(word.length-wanted.length)>1) return false;
    if (word.length === wanted.length) {
      const mismatch=[...word].map((c,i)=>c===wanted[i]?-1:i).filter(i=>i>=0);
      const transposed = mismatch.length===2 && mismatch[1]===mismatch[0]+1
        && word[mismatch[0]]===wanted[mismatch[1]] && word[mismatch[1]]===wanted[mismatch[0]];
      return transposed || loose && mismatch.length===1;
    }
    if (!loose) return false;
    const [short,long] = word.length < wanted.length ? [word,wanted] : [wanted,word];
    let a=0,b=0,skips=0;
    while(a<short.length&&b<long.length) {if(short[a]===long[b]){a++;b++;}else{b++;skips++;}}
    return skips<=1;
  });
}
export function followAllowsLink(required, state) { return !required || state === true; }

export class InstagramComments {
  constructor(publisher,{now=()=>Date.now()}={}) {
    this.p=publisher; this.now=now; this.running=null; this.nextPoll=0;
    // A crash after write-ahead must never turn into an automatic resend.
    for(const row of this.rows())if(row.state==='sending')this.update(row.commentId,{state:'needs_attention',error:'App đóng trong lúc gửi; đối soát trên Instagram, không tự gửi lại.'});
  }
  rows(){return this.p.store.get('instagram_comment_replies',[]);}
  rules(){return this.p.store.get('instagram_dm_rules',[]);}
  update(commentId,patch){
    const rows=this.rows(),old=rows.find(row=>row.commentId===commentId);
    const row={...old,...patch,commentId,updatedAt:this.now()};
    this.p.store.set('instagram_comment_replies',[...rows.filter(row=>row.commentId!==commentId),row]);return row;
  }
  status(){return {intervalMs:COMMENTS_INTERVAL,stopped:this.p.store.get('instagram_dm_stopped',true)!==false,
    rules:this.rules(),rows:this.rows().slice(-200).reverse(),polls:this.p.store.get('instagram_comment_polls',[]),
    totals:this.totals(),active:!!this.running};}
  totals(){
    const map=new Map();
    for(const poll of this.p.store.get('instagram_comment_polls',[]))if(poll.complete)
      map.set(poll.productId,{productId:poll.productId,ctaComments:0,dmSent:0});
    for(const row of this.rows()){
      if(!map.has(row.productId))map.set(row.productId,{productId:row.productId,ctaComments:0,dmSent:0});
      const total=map.get(row.productId);total.ctaComments++;if(row.state==='sent')total.dmSent++;
    }
    return [...map.values()];
  }
  emergencyStop(){this.p.store.set('instagram_dm_stopped',true);return this.status();}
  async saveRule(payload){
    const rule=ruleInput.parse(payload);
    if(rule.enabled&&!rule.approved)throw Error('Duyệt tài khoản, bài đăng, từ khóa, mẫu và link trước khi bật DM.');
    if(!rule.enabled){
      this.p.store.set('instagram_dm_rules',this.rules().map(row=>row.planId===rule.planId?{...row,enabled:false}:row));
      return this.status();
    }
    const context=await this.context(rule.planId);
    if(!/^[\p{L}\p{N}]{2,40}$/u.test(rule.keyword))throw Error('CTA cần một từ từ 2–40 chữ/số.');
    const link=this.link(context,rule.keyword);
    if(Buffer.byteLength(rule.template.replaceAll('{link}',link))>1000)throw Error('Mẫu DM và link vượt 1000 byte.');
    const stored={...rule,productId:context.product.id,accountId:context.account.id,mediaId:context.mediaId,
      postUrl:context.plan.data.postUrl,link,accountRevision:context.account.revision,planRevision:context.plan.revision,
      apiConfigRevision:context.profile.apiConfigRevision,approvedAt:this.now(),
      revision:(this.rules().find(row=>row.planId===rule.planId)?.revision??0)+1};
    this.p.store.set('instagram_dm_rules',[...this.rules().filter(row=>row.planId!==rule.planId),stored]);
    if(rule.enabled)this.p.store.set('instagram_dm_stopped',false);
    this.nextPoll=0;return this.status();
  }
  link({plan,product,account},keyword){
    return buildUtmLink(plan.data.landingBaseUrl || plan.data.utmLink || '',{productSlug:product.data.name,
      accountHandle:account.data.handle,planId:plan.id,hookId:plan.data.utmHookId,ctaKeyword:keyword});
  }
  async context(planId){
    const records=await this.p.workspace.records();
    const plan=records.find(row=>row.id===planId&&row.kind==='content_plan');
    const account=records.find(row=>row.id===plan?.data.accountId&&row.kind==='social_account'&&!row.data.archived);
    const product=records.find(row=>row.id===plan?.data.productId&&row.kind==='product'&&!row.data.archived);
    const profile=this.p.browsers.profile(account?.id);
    if(!plan||!account||!product||account.data.productId!==product.id||!['published_browser','published_manual'].includes(plan.data.status)
      ||!profile||!apiMode(profile)||!profile.encryptedApiToken)throw Error('Cần bài đã đăng, sản phẩm/tài khoản hoạt động và cấu hình API.');
    const published=this.p.jobs().find(row=>row.state==='published'&&row.snapshot.planId===plan.id&&row.snapshot.accountId===account.id&&row.postUrl===plan.data.postUrl);
    let mediaId=published?.apiReceipt?.mediaId;
    if(!mediaId){
      const client=await this.p.apiAdapter.client(profile);const identity=await client.identity();
      this.p.apiAdapter.matchHandle(identity.handle,account.data.handle);
      // Fixed-origin, cursor-based lookup also supports preserved browser-era posts.
      let after=null;const seen=new Set();
      for(let page=0;page<5;page++){
        const result=await client.mediaPage(after);
        const expected=instagramPostUrl(plan.data.postUrl);
        const matches=(result.data??[]).filter(row=>expected&&instagramPostUrl(row.permalink)===expected);
        if(matches.length===1){mediaId=matches[0].id;break;}
        if(matches.length>1)break;
        after=nextCursor(result);if(!after||seen.has(after))break;seen.add(after);
      }
    }
    if(!/^\d{1,40}$/.test(mediaId??''))throw Error('Chưa xác định được media ID đúng bài; kiểm tra kết nối và receipt.');
    return {plan,account,product,profile,mediaId};
  }
  allowed(rule){return !this.p.stopped && this.p.store.get('instagram_dm_stopped',true)===false
    && this.rules().some(current=>current.planId===rule.planId&&current.enabled&&current.approvedAt===rule.approvedAt
      &&(current.revision??0)===(rule.revision??0));}
  tick(){
    if(this.running)return this.running;
    if(this.p.stopped||this.now()<this.nextPoll||this.p.store.get('instagram_dm_stopped',true)!==false)return;
    this.nextPoll=this.now()+COMMENTS_INTERVAL;
    this.running=this.poll().finally(()=>{this.running=null;});return this.running;
  }
  async poll(){
    for(const rule of this.rules().filter(row=>row.enabled)){
      if(!this.allowed(rule))return;
      const backoff=this.p.store.get('instagram_dm_backoff',{})[rule.accountId]??0;
      if(backoff>this.now())continue;
      let error='',complete=false;
      try {
        const context=await this.context(rule.planId);
        if(context.account.id!==rule.accountId||context.product.id!==rule.productId||context.mediaId!==rule.mediaId
          ||context.plan.revision!==rule.planRevision||context.account.revision!==rule.accountRevision
          ||context.profile.apiConfigRevision!==rule.apiConfigRevision||this.link(context,rule.keyword)!==rule.link)
          throw Error('Nội dung, link hoặc cấu hình đã thay đổi. Duyệt lại quy tắc DM.');
        const client=await this.p.apiAdapter.client(context.profile);const identity=await client.identity();
        this.p.apiAdapter.matchHandle(identity.handle,context.account.data.handle);
        for await(const comment of client.comments(rule.mediaId,{maxPages:10})){
          if(!this.allowed(rule))return;
          if(comment.username?.toLowerCase()===identity.handle.toLowerCase())continue;
          await this.process(rule,comment,client);
        }
        complete=true;
      }catch(failure){
        // Whitelist messages; never persist response bodies, tokens or thrown fetch text.
        error=['login_required','rate_limit','permission','api_uncertain'].includes(failure.code)?failure.message:'Chưa đọc đủ comment hoặc quy tắc đã đổi. Kiểm tra kết nối và duyệt lại quy tắc DM.';
        if(failure.code==='rate_limit')this.backoff(rule.accountId);
      }
      const polls=this.p.store.get('instagram_comment_polls',[]);
      this.p.store.set('instagram_comment_polls',[...polls.filter(row=>row.planId!==rule.planId),{planId:rule.planId,productId:rule.productId,at:this.now(),complete,error}]);
    }
  }
  backoff(accountId){this.p.store.set('instagram_dm_backoff',{...this.p.store.get('instagram_dm_backoff',{}),[accountId]:this.now()+3600000});}
  async process(rule,comment,client){
    if(!this.allowed(rule)||!/^\d{1,40}$/.test(comment.id)||!matchCta(comment.text,rule.keyword))return;
    const existing=this.rows().find(row=>row.commentId===comment.id);
    if(existing){
      // Saving a rule authorizes a fresh evaluation, never a resend. Legacy rows
      // have revision 0; the next explicit save advances their rule to revision 1.
      if(existing.planId!==rule.planId||existing.accountId!==rule.accountId||existing.productId!==rule.productId)return existing;
      const reconsider=existing.state==='follow_unknown'&&existing.attemptedAt==null&&!existing.messageId
        &&(existing.ruleRevision??0)!==(rule.revision??0);
      if(existing.state!=='rate_wait'&&!reconsider)return existing;
    }
    // Synchronous claim before the first await makes concurrent duplicate deliveries harmless.
    const base={planId:rule.planId,productId:rule.productId,accountId:rule.accountId,keyword:rule.keyword,
      ruleRevision:rule.revision??0,commentAt:existing?.commentAt??comment.timestamp,
      matchedAt:existing?.matchedAt??this.now(),state:'matched',error:''};
    this.update(comment.id,base);
    const created=Date.parse(base.commentAt);
    if(!Number.isFinite(created)||created>this.now()+60000||this.now()-created>=7*86400000)
      return this.update(comment.id,{state:'expired',error:'Comment thiếu thời gian hợp lệ hoặc quá cửa sổ private reply 7 ngày.'});
    // Polling does not establish messaging consent to query a user profile. Unknown
    // follow state stays unknown: never reproduce OpenReply's fail-open behavior.
    if(!followAllowsLink(rule.requireFollow,null))return this.update(comment.id,{state:'follow_unknown',error:'Chưa xác minh follow; không gửi link. Polling này chưa hỗ trợ kiểm follow.'});
    const recent=this.rows().filter(row=>row.accountId===rule.accountId&&row.attemptedAt>this.now()-3600000);
    if((this.p.store.get('instagram_dm_backoff',{})[rule.accountId]??0)>this.now()||recent.length>=20||recent.some(row=>row.attemptedAt>this.now()-10000))
      return this.update(comment.id,{state:'rate_wait',error:'Chờ giới hạn nội bộ: 20 DM/giờ/tài khoản, cách nhau ít nhất 10 giây.'});
    if(!this.allowed(rule))return;
    this.update(comment.id,{state:'sending',attemptedAt:this.now()});
    try{
      const receipt=await client.privateReply(comment.id,rule.template.replaceAll('{link}',rule.link));
      return this.update(comment.id,{state:'sent',messageId:receipt.messageId,error:''});
    }catch(failure){
      if(failure.code==='rate_limit')this.backoff(rule.accountId);
      return this.update(comment.id,{state:failure.code==='api_uncertain'?'needs_attention':'error',
        error:['login_required','rate_limit','permission','api_uncertain','api_rejected'].includes(failure.code)?failure.message:'Private reply thất bại; không tự gửi lại.'});
    }
  }
}
