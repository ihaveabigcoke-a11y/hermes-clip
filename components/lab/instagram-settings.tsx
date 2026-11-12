"use client";
import {useState} from 'react';
import {type LabRecord} from '@/lib/lab/domain';
import {desktopBridge} from '@/lib/lab/desktop-client';
import {useInstagramStatus, type InstagramProfile} from '@/lib/lab/instagram-client';
import {INSTAGRAM_BROWSER_WARNING} from '@/desktop/src/instagram-policy.mjs';
import {buildUtmLink} from '@/lib/lab/utm';
import {Button} from './primitives';

function AccountApi({account,profile,disabled,refresh}:{account:LabRecord;profile?:InstagramProfile;disabled:boolean;refresh:()=>void}) {
  const [appId,setAppId]=useState(profile?.apiAppId??''),[userId,setUserId]=useState(profile?.apiUserId??'');
  const [token,setToken]=useState(''),[clear,setClear]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
  async function act(check=false){
    setBusy(true);setError('');setNotice('');
    try{
      if(check){
        const result=await desktopBridge()!.instagramCheck({id:account.id});
        setNotice(`@${result.handle} · ${result.accountType??'Loại tài khoản chưa được API trả về'}`);
      }else{
        await desktopBridge()!.instagramSaveProfile({id:account.id,apiMode:'api',apiAppId:appId,apiUserId:userId,apiToken:token,clearApiToken:clear});
        setToken('');setClear(false);setNotice('Đã lưu API; token được mã hóa bằng kho hệ điều hành.');
      }
      refresh();
    }catch(reason){setError((reason as Error).message);}finally{setBusy(false);}
  }
  return <section className="production-card production-card-body" aria-label={'API '+account.data.name}>
    <h4>{account.data.name} · @{account.data.handle||'chưa có handle'}</h4>
    <div className="form-grid">
      <label className="field">Meta App ID<input value={appId} inputMode="numeric" disabled={disabled||busy} onChange={e=>setAppId(e.target.value)}/></label>
      <label className="field">Instagram user_id<input value={userId} inputMode="numeric" disabled={disabled||busy} onChange={e=>setUserId(e.target.value)}/></label>
      <label className="field">Access token<input type="password" autoComplete="new-password" value={token} maxLength={8192} disabled={disabled||busy} onChange={e=>setToken(e.target.value)} placeholder={profile?.hasApiToken?'Đã lưu mã hóa; để trống để giữ':'Token Instagram Login'}/></label>
    </div>
    <label className="field"><span><input type="checkbox" checked={clear} disabled={disabled||busy} onChange={e=>setClear(e.target.checked)}/> Xóa token đã lưu</span></label>
    <div className="button-row"><Button disabled={disabled||busy||!appId||!userId} onClick={()=>void act()}>Lưu API {account.data.name}</Button>
      <Button tone="neutral" disabled={disabled||busy||!profile?.hasApiToken||profile.apiMode==='browser'} onClick={()=>void act(true)}>Kiểm tra kết nối {account.data.name}</Button></div>
    {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
  </section>;
}

function DmRule({plan,account,product,rule,disabled,refresh}:{plan:LabRecord;account?:LabRecord;product?:LabRecord;rule?:any;disabled:boolean;refresh:()=>void}) {
  const [keyword,setKeyword]=useState(rule?.keyword??plan.data.ctaKeyword??'');
  const [template,setTemplate]=useState(rule?.template??'Here is the link you requested: {link}');
  const [follow,setFollow]=useState(rule?.requireFollow??true),[enabled,setEnabled]=useState(rule?.enabled??false);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  let link='';
  try{link=buildUtmLink(plan.data.landingBaseUrl||plan.data.utmLink||'',{productSlug:product?.data.name??'',accountHandle:account?.data.handle??'',planId:plan.id,hookId:plan.data.utmHookId,ctaKeyword:keyword});}catch{/* Save supplies the validation message. */}
  return <details className="production-card production-card-body"><summary>{plan.data.name} · @{account?.data.handle||'chưa rõ tài khoản'} · {rule?.enabled?'DM đã bật':'DM tắt'}</summary>
    <p>Chỉ bài này · {plan.data.postUrl}. Link lấy từ landing và UTM đã lưu trong nội dung.</p>
    <label className="field">Link sẽ gửi<input readOnly value={link} placeholder="Lưu landing và từ khóa trước khi bật"/></label>
    <label className="field">Từ khóa CTA<input value={keyword} maxLength={40} disabled={disabled||busy} onChange={e=>setKeyword(e.target.value)}/></label>
    <label className="field">Mẫu private reply<textarea value={template} maxLength={800} disabled={disabled||busy} onChange={e=>setTemplate(e.target.value)}/><small>Dùng {'{link}'} để chèn landing + UTM tài khoản × hook.</small></label>
    <label className="field"><span><input type="checkbox" checked={follow} disabled={disabled||busy} onChange={e=>setFollow(e.target.checked)}/> Chỉ gửi link khi xác minh đã follow</span></label>
    <p>Polling chưa xác minh follow. Nếu giữ điều kiện này, app ghi “Chưa xác minh follow” và không gửi link. Bỏ chọn nghĩa là bạn cho phép trả link cho comment CTA mà không yêu cầu follow.</p>
    <label className="field"><span><input type="checkbox" checked={enabled} disabled={disabled||busy} onChange={e=>setEnabled(e.target.checked)}/> Bật quy tắc cho bài này</span></label>
    <Button disabled={disabled||busy||!keyword} onClick={async()=>{
      if(enabled&&!window.confirm(`Duyệt private reply cho @${account?.data.handle}, bài “${plan.data.name}”, từ khóa “${keyword}”?\n${template.replaceAll('{link}',link)}\n${follow?'Chỉ gửi khi xác minh follow.':'Không yêu cầu follow.'}\nLưu sẽ bật lại polling DM theo các quy tắc đã duyệt.`))return;
      setBusy(true);setMessage('');try{await desktopBridge()!.instagramSaveDmRule({planId:plan.id,enabled,keyword,template,requireFollow:follow,approved:enabled});setMessage('Đã lưu quy tắc DM.');refresh();}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
    }}>Duyệt và lưu quy tắc DM</Button>{message&&<p role="status">{message}</p>}
  </details>;
}

export function InstagramSettings({records,demo}:{records:LabRecord[];demo:boolean}) {
  const live=useInstagramStatus(!demo),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const disabled=demo||!live.status||!desktopBridge();
  const products=records.filter(row=>row.kind==='product'&&!row.data.archived);
  const accounts=records.filter(row=>row.kind==='social_account'&&!row.data.archived&&products.some(product=>product.id===row.data.productId));
  const plans=records.filter(row=>row.kind==='content_plan'&&['published_browser','published_manual'].includes(row.data.status)&&accounts.some(account=>account.id===row.data.accountId));
  return <section className="production-card production-card-body" aria-label="Cài đặt Instagram">
    <h3>Instagram · API chính thức</h3><p>Instagram Login dành cho Business/Creator. Mặc định dùng API. Lưu App ID và token cho từng tài khoản rồi kiểm tra kết nối.</p>
    <label className="account-toggle"><input type="checkbox" role="switch" aria-label="Bật Instagram trình duyệt" checked={live.status?.browserEnabled===true} disabled={disabled||busy} onChange={async e=>{
      const enabled=e.target.checked;if(enabled&&!window.confirm(INSTAGRAM_BROWSER_WARNING))return;
      setBusy(true);setError('');try{await desktopBridge()!.instagramConfigureBrowser({enabled,confirmation:enabled?INSTAGRAM_BROWSER_WARNING:undefined});live.refresh();}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}
    }}/><span>Instagram trình duyệt: {live.status?.browserEnabled?(live.status?.browserRunning?'Đang bật':'Đã cho phép · chờ bật tay'):'Đang tắt'}</span></label>
    {live.status?.browserEnabled&&!live.status.browserRunning&&<Button tone="neutral" disabled={disabled||busy} onClick={async()=>{
      if(!window.confirm(INSTAGRAM_BROWSER_WARNING))return;setBusy(true);setError('');
      try{await desktopBridge()!.instagramConfigureBrowser({enabled:true,confirmation:INSTAGRAM_BROWSER_WARNING});live.refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}
    }}>Chạy worker trình duyệt đã cho phép</Button>}
    <p>Mở lại app không tự chạy worker trình duyệt, kể cả đã cho phép trước đó. Khi tắt, app không mở profile và không đọc số liệu bằng trình duyệt. Profile, dữ liệu và lịch sử vẫn được giữ.</p>
    {(error||live.error)&&<p role="alert">{error||live.error}</p>}
    {!accounts.length&&<p>Thêm tài khoản của sản phẩm tại Kinh doanh → Instagram để cấu hình API.</p>}
    {accounts.map(account=><AccountApi key={account.id+':'+(live.status?.profiles.find(p=>p.id===account.id)?.apiUserId??'')} account={account} profile={live.status?.profiles.find(p=>p.id===account.id)} disabled={!!disabled} refresh={live.refresh}/>)}
    <h3>Comment → DM</h3><p>Không có webhook công khai: poll mỗi 3 phút khi app mở. Tắt app hoặc máy ngủ sẽ ngừng nhận comment. Tối đa 10 trang/bài/lượt; private reply trong 7 ngày, mỗi comment gửi tối đa một lần.</p>
    <p>Giới hạn nội bộ: 20 DM/giờ/tài khoản, cách ít nhất 10 giây. Lỗi không rõ kết quả cần đối soát; không tự gửi lại.</p>
    <Button tone="danger" disabled={disabled} onClick={async()=>{try{await desktopBridge()!.instagramDmEmergencyStop();live.refresh();}catch(e){setError((e as Error).message);}}}>Tắt khẩn cấp mọi DM</Button>
    <p role="status">DM: {live.status?.comments?.stopped===false?'Đang bật theo quy tắc đã duyệt':'Đang tắt'}</p>
    {plans.map(plan=><DmRule key={plan.id+':'+(live.status?.comments?.rules.find(row=>row.planId===plan.id)?.approvedAt??'')} plan={plan} product={products.find(row=>row.id===plan.data.productId)} account={accounts.find(row=>row.id===plan.data.accountId)} rule={live.status?.comments?.rules.find(row=>row.planId===plan.id)} disabled={!!disabled} refresh={live.refresh}/>)}
    {!plans.length&&<p>Quy tắc chỉ bật được sau khi có bài đăng, landing và tài khoản cụ thể.</p>}
    <details><summary>Nhật ký comment → DM (200 mục gần nhất)</summary><p>Chỉ lưu ID comment, từ khóa và trạng thái; không thu thập hộp thư hay nội dung DM khách.</p>
      {live.status?.comments?.polls.map(row=><p key={row.planId}>{row.planId} · {row.complete?'Đã đọc hết trang trong lượt':'Chưa đọc đủ'} · {row.error}</p>)}
      <div className="operations-table-scroll"><table className="operations-comparison"><thead><tr><th>Comment ID</th><th>Từ khóa</th><th>Trạng thái</th><th>Kết quả</th></tr></thead><tbody>{live.status?.comments?.rows.map(row=><tr key={row.commentId}><td>{row.commentId}</td><td>{row.keyword}</td><td>{row.state}</td><td>{row.error||row.messageId||'—'}</td></tr>)}</tbody></table></div>
    </details>
  </section>;
}
