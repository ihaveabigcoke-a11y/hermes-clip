import {compressMedia} from './compress.mjs';
import {resolveProvider,mediaProviderReceipts} from './provider-routing.mjs';
import {museIsPaused} from './muse-pause.mjs';
import {createHash, randomUUID} from 'node:crypto';
import {mkdir, readdir, readFile, writeFile, rename, stat, lstat, copyFile, unlink} from 'node:fs/promises';
import {join, resolve, isAbsolute, extname, basename, dirname} from 'node:path';
import {spawn} from 'node:child_process';
import {sessionCookie} from '../local/server.mjs';
import {assertDiskSpace, storagePolicy} from './storage-policy.mjs';
import {confinedFile} from './reference-structure.mjs';

const types = {'.mov':'video/quicktime', '.mp4':'video/mp4', '.webm':'video/webm', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp'};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const pad = value => String(value).padStart(2, '0');
const stamp = date => `${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;

export async function probeManualMedia(path) {
  const type = types[extname(path).toLowerCase()];
  if (!type) throw Error('Chỉ nhận MP4, WebM, PNG, JPG hoặc WebP.');
  const info = await stat(path);
  if (!info.size || info.size > (type.startsWith('image/') ? 8 : 25)*1024**2) throw Error('Ảnh tối đa 8 MB, video tối đa 25 MB.');
  const header=(await readFile(path)).subarray(0,16), signature=header.toString('latin1');
  const detected=header[0]===0xff&&header[1]===0xd8&&header[2]===0xff?'image/jpeg':
    header[0]===0x89&&signature.slice(1,4)==='PNG'?'image/png':
    signature.startsWith('RIFF')&&signature.slice(8,12)==='WEBP'?'image/webp':
    signature.slice(4,8)==='ftyp'?'video/mp4':
    header[0]===0x1a&&header[1]===0x45&&header[2]===0xdf&&header[3]===0xa3?'video/webm':null;
  if(detected!==type)throw Error('Nội dung file không khớp phần mở rộng ảnh/video. Kiểm tra file tải về.');
  // A bounded temporary report also works on Windows hosts that disallow child pipes.
  const report=path+'.probe-'+randomUUID()+'.json';
  let data;
  try {
    await new Promise((resolve,reject)=>{
      const child=spawn('ffprobe',['-v','error','-protocol_whitelist','file','-show_format','-show_streams','-of','json','-o',report,path],{timeout:15000,windowsHide:true,stdio:'ignore'});
      child.once('error',reject);
      child.once('close',(code,signal)=>code===0?resolve():reject(Error(signal?'ffprobe quá thời gian kiểm file.':'ffprobe không đọc được ảnh/video.')));
    });
    if((await stat(report)).size>1024**2)throw Error('Thông tin ffprobe vượt giới hạn.');
    data=JSON.parse(await readFile(report,'utf8'));
  }finally{await unlink(report).catch(()=>{});}
  const video = data.streams?.find(stream => stream.codec_type === 'video');
  if (!video?.width || !video?.height) throw Error('ffprobe không đọc được ảnh/video.');
  const duration = type.startsWith('video/') ? Number(data.format?.duration) : null;
  if (duration !== null && (!Number.isFinite(duration) || duration <= 0)) throw Error('Không đọc được thời lượng video.');
  const rotation = Number(video.side_data_list?.find(side => side.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0);
  const rotated = Math.abs(rotation)%180 === 90;
  const metadata = {width:rotated?video.height:video.width, height:rotated?video.width:video.height, duration, verifiedBy:'container'};
  const warning = Math.abs((metadata.width/metadata.height)/(9/16)-1) > .01 ? 'Sai tỷ lệ 9:16; file vẫn được nhập, cần xem lại.' : '';
  return {type, metadata, warning};
}

// Only loopback workspace requests. No provider, browser or external API is used.
export class ManualMedia {
  constructor({store, local, changed=()=>{}, now=()=>new Date(), trashItem=null, compress=compressMedia}) {
    this.store=store; this.local=local; this.trashItem=trashItem; this.compress=compress; this.changed=changed; this.now=now;
    this.observed=new Map(); this.processed=new Map(); this.errors=new Map(); this.tail=Promise.resolve();
  }
  exclusive(operation) {
    const pending=this.tail.then(operation); this.tail=pending.catch(()=>{}); return pending;
  }
  async request(path, options={}) {
    const response=await fetch(this.local.origin+path, {...options, headers:{Cookie:`${sessionCookie}=${this.local.session}`, Origin:this.local.origin, ...options.headers}, signal:AbortSignal.timeout(120000)});
    if (!response.ok) {const data=await response.json(); throw Object.assign(Error(data.error || 'Chưa lưu được media.'), {status:response.status});}
    return response;
  }
  async records() {return (await (await this.request('/api/lab')).json()).records;}
  route(project, scene, projectId) {
    return resolveProvider({kind:'media', selection:scene.mediaProvider??project.mediaProvider,
      status:{musePaused:museIsPaused(this.store),generationReady:!!this.store.get('adapter')?.enabled,
        profiles:this.store.get('profiles',[]),batch:this.store.batch()},
      previous:mediaProviderReceipts({jobs:this.store.jobs(),scene,projectId})});
  }
  async assertMuseScene(request, {admitted=false}={}) {
    const row=this.catalog(await this.records()).find(row=>row.project.id===request.projectId&&row.scene.id===request.sceneId&&!row.archived);
    if(!row)throw Error('Không tìm thấy cảnh.');
    const selected=row.scene.mediaProvider??row.project.data.mediaProvider;
    if(admitted&&selected&&selected!=='muse')throw Error('Cảnh đã đổi nhà cung cấp; chưa gửi Muse.');
    if(!admitted){const route=this.route(row.project.data,row.scene,row.project.id);
      if(route.blocked)throw Error(route.reason);
      if(route.provider!=='muse')throw Error('Cảnh chưa chọn nhà cung cấp Muse.');}
    if(!row.scene.storyboardApproved||row.scene.revision!==request.sceneRevision||row.product.revision!==request.productRevision||row.project.data.productRevision!==request.productRevision)throw Error('Cảnh hoặc sản phẩm đã đổi; duyệt lại trước khi gửi Muse.');
  }
  inbox() {return this.store.get('manual_inbox', join(this.local.root, 'media-inbox'));}
  receipts() {return this.store.get('manual_receipts', []);}
  saveReceipt(receipt) {
    receipt={...receipt,provider:'manual'};
    this.store.set('manual_receipts', [...this.receipts().filter(row=>(row.sourceSha256??row.sha256)!==(receipt.sourceSha256??receipt.sha256)), receipt]);
    this.changed(); return receipt;
  }
  catalog(records) {
    const codes=this.store.get('manual_codes', {products:{}, scenes:{}});
    const before=JSON.stringify(codes);
    const rows=[];
    for (const project of records.filter(row=>row.kind==='production')) {
      const product=records.find(row=>row.kind==='product' && row.id===project.data.productId);
      if (!product) continue;
      if(!Object.hasOwn(codes.products,product.id))codes.products={...codes.products,[product.id]:`P${Object.keys(codes.products).length+1}`};
      for (const scene of project.data.scenes) {
        const key=JSON.stringify([project.id,scene.id]), productCode=codes.products[product.id];
        codes.scenes[key] ??= `${productCode}-S${String(Object.values(codes.scenes).filter(code=>code.startsWith(productCode+'-')).length+1).padStart(2,'0')}`;
        rows.push({project, scene, product, code:codes.scenes[key], productCode, archived:!!product.data.archived});
      }
    }
    if (JSON.stringify(codes)!==before) this.store.set('manual_codes', codes);
    return rows;
  }
  async status() {
    const rows=this.catalog(await this.records()), exports=this.store.get('manual_exports', {}), receipts=this.receipts();
    return {inbox:this.inbox(), scenes:rows.map(({project,scene,code,productCode})=>({projectId:project.id,sceneId:scene.id,code,productCode,
      provider:this.route(project.data,scene,project.id).provider,
      state:this.route(project.data,scene,project.id).blocked?this.route(project.data,scene,project.id).reason:receipts.some(row=>row.state==='received'&&row.projectId===project.id&&row.sceneId===scene.id&&row.sceneRevision===scene.revision)?'Đã nhận':
        exports[code]?.revision===scene.revision ? (exports[code].waiting?'Chờ file':'Đã xuất') : 'Chờ xuất prompt',
      exportedPath:exports[code]?.path ?? null})),
      unmatched:receipts.filter(row=>row.state!=='received'), errors:[...this.errors].map(([name,message])=>({name,message}))};
  }
  configure({inbox}) {return this.exclusive(async()=>{
    if (typeof inbox!=='string' || !isAbsolute(inbox.trim())) throw Error('Nhập đường dẫn tuyệt đối cho Hộp nhận media.');
    const path=resolve(inbox.trim()); await mkdir(path,{recursive:true});
    this.store.set('manual_inbox',path); this.observed.clear(); this.processed.clear(); this.errors.clear(); return this.status();
  });}
  exportPack({projectId, sceneIds}, date=this.now()) {return this.exclusive(async()=>{
    const records=await this.records();
    const rows=this.catalog(records).filter(row=>row.project.id===projectId&&!row.archived&&row.scene.storyboardApproved&&this.route(row.project.data,row.scene,row.project.id).provider==='manual'&&!this.route(row.project.data,row.scene,row.project.id).blocked&&(!sceneIds?.length||sceneIds.includes(row.scene.id)));
    if (!rows.length) throw Error('Duyệt ít nhất một cảnh manual trước khi xuất prompt.');
    if (rows.some(row=>row.product.revision!==row.project.data.productRevision)) throw Error('Đồng bộ phiên bản sản phẩm trước khi xuất prompt.');
    const units=new Map();
    for(const row of rows.filter(row=>row.scene.storyboardVersion===2)) {
      const s=row.scene;
      if(!s.packaging?.brandName?.trim())throw Error('Chưa đặt tên bao bì.');
      if(!s.packaging?.boxText?.trim()||!s.situation?.trim()||!s.ctaKeyword?.trim())throw Error('Điền chữ trên hộp, tình huống mở đầu và từ khóa CTA trước khi xuất.');
      if(!s.generationUnit||!s.overlay||!s.constraints||!s.setting)throw Error('Shot thiếu mốc chữ đè hoặc nhóm tạo.');
      const key=s.generationUnit.id;
      units.set(key,[...(units.get(key)||[]),row]);
    }
    for(const group of units.values()) {
      group.sort((a,b)=>a.scene.fromSec-b.scene.fromSec);
      const unit=group[0].scene.generationUnit;
      const expected=rows[0].project.data.scenes.filter(s=>s.generationUnit?.id===unit.id);
      if(expected.length!==group.length||group[0].scene.fromSec!==unit.fromSec||group.at(-1).scene.toSec!==unit.toSec||unit.toSec-unit.fromSec>8||group.some((r,i)=>r.scene.setting!==group[0].scene.setting||JSON.stringify(r.scene.generationUnit)!==JSON.stringify(unit)||['references','constraints','packaging'].some(key=>JSON.stringify(r.scene[key])!==JSON.stringify(group[0].scene[key]))||(i>0&&r.scene.fromSec!==group[i-1].scene.toSec)))throw Error('Duyệt và chọn đủ shot liên tiếp cùng bối cảnh, tham chiếu, bao bì và giới hạn của nhóm tạo trước khi xuất.');
    }
    const base=join(this.local.root,'exports','prompt-packs'); await mkdir(base,{recursive:true});
    const destination=join(base,`${rows[0].productCode}-${stamp(date)}`);
    try {await stat(destination); throw Error('Đã có gói trong phút này. Giữ gói cũ; xuất lại vào phút tiếp theo.');} catch(error) {if(error.code!=='ENOENT')throw error;}
    const staging=join(base,`.pending-${randomUUID()}`); await mkdir(staging);
    assertDiskSpace(this.local.root, 100*1024**2, storagePolicy(this.store));
    const exports=this.store.get('manual_exports',{});
    for (const {project,scene,code} of rows) {
      const references=[];
      if(scene.sourceReference){
        const source=scene.sourceReference,job=this.store.get('integration-jobs',[]).find(j=>j.id===source.jobId&&j.engine==='rea-video'&&j.state==='done');
        if(!job)throw Error('Không tìm thấy tác vụ tham chiếu đã phân tích.');
        // Resolve from the saved receipt, never a renderer-provided absolute path.
        const actualRoot=join(dirname(job.path),'rea-video');
        for(const role of ['firstFrame','lastFrame'])if(source[role]){
          const path=await confinedFile(actualRoot,join(actualRoot,source[role]));if((await stat(path)).size>5*1024**2)throw Error('Khung mẫu vượt giới hạn.');
          const name=`${code}-${role}.jpg`;await copyFile(path,join(staging,name));references.push(`${name} | ${role} | Composition reference only; replace source branding with the approved product.`);
        }
      }
      for (const [index,pin] of scene.references.entries()) {
        const ref=project.data.references.find(row=>row.id===pin.id&&row.version===pin.version);
        const latest=project.data.references.filter(row=>row.id===pin.id).sort((a,b)=>b.version-a.version)[0];
        const asset=records.find(row=>row.kind==='asset'&&row.id===ref?.assetId);
        if (!ref || latest.version!==pin.version || !asset?.data.type.startsWith('image/')) throw Error(`${code}: tham chiếu cần ảnh đã kiểm và đúng phiên bản.`);
        const ext={'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp'}[asset.data.type];
        if (!ext) throw Error('Ảnh tham chiếu chưa hỗ trợ.');
        const bytes=new Uint8Array(await (await this.request(`/api/assets/${asset.id}`)).arrayBuffer());
        if (hash(bytes)!==asset.data.sha256) throw Error('Checksum ảnh tham chiếu không khớp.');
        const original=join(staging,`${code}-ref-${index+1}${ext}`); await writeFile(original,bytes,{flag:'wx'});
        const compressed=await this.compress(original);
        let name=basename(original);
        try {if(compressed.type==='image/webp'&&compressed.path!==original){name=`${code}-ref-${index+1}.webp`;const target=join(staging,name);if(target===original)await writeFile(target,await readFile(compressed.path));else {await copyFile(compressed.path,target);await unlink(original);}}}finally{await compressed.cleanup();}
        references.push(`${name} | role: ${ref.role} | ${ref.notes||ref.name}`);
      }
      const prompt=[`Scene: ${code}`, scene.storyboardVersion===2?`Editing shot: ${scene.duration} seconds. Generate the matching UNIT file, then trim this shot using timeline.json.`:'Create a vertical 9:16 video, exactly 8 seconds. Use English for all dialogue and on-screen text.',
        scene.mediaType==='image'?'First create a vertical 9:16 reference image; use it for the 8-second video if needed.':'',
        scene.prompt, scene.action&&`Action: ${scene.action}`, scene.camera&&`Camera: ${scene.camera}`, scene.voice&&`Audio: ${scene.voice}`,
        scene.storyboardVersion===2?`Editing overlay (global seconds): ${JSON.stringify(scene.overlay)}\nConstraints:\n${scene.constraints.join('\n')}`:scene.overlayText&&`On-screen text: ${scene.overlayText}`, 'Reference images:', ...references,
        !references.length?'No reference images supplied.':'Preserve the product appearance from the supplied reference images.',
        `Save the downloaded file as ${code}-take1.mp4 (or ${code}-take1.png for an image).`].filter(Boolean).join('\n\n');
      await writeFile(join(staging,`${code}.txt`),prompt+'\n',{flag:'wx'});
      exports[code]={provider:'manual',revision:scene.revision,path:destination,waiting:false,at:date.getTime()};
    }
    if(units.size) {
      const timeline=[];
      for(const [index,group] of [...units.values()].entries()) {
        const name=`${rows[0].productCode}-UNIT-${pad(index+1)}`,unit=group[0].scene.generationUnit;
        const shots=group.map(({scene,code})=>({code,sceneId:scene.id,sceneRevision:scene.revision,fromSec:scene.fromSec,toSec:scene.toSec,
          trimFromSec:Number((scene.fromSec-unit.fromSec).toFixed(3)),trimToSec:Number((scene.toSec-unit.fromSec).toFixed(3)),duration:scene.duration,
          overlay:scene.overlay,ctaOverlay:scene.ctaOverlay,packaging:scene.packaging,metadata:scene.metadata,sourceReference:scene.sourceReference,
          ffmpegArgs:['-n','-i',`${name}.mp4`,'-ss',String(Number((scene.fromSec-unit.fromSec).toFixed(3))),'-t',String(scene.duration),'-map','0:v:0','-an','-c:v','libx264','-pix_fmt','yuv420p',`${code}-take1.mp4`]}));
        timeline.push({file:`${name}.mp4`,unit,shots});
        await writeFile(join(staging,`${name}.txt`),[
          'Create one vertical 9:16 video, exactly 8 seconds. Silent visual sequence with hard cuts at the specified offsets.',
          `Use the reference images listed in ${group[0].code}.txt. Keep the same setting and subjects throughout this unit.`,
          ...group.filter(r=>r.scene.sourceReference).map(({scene,code})=>`Shot ${code} composition references: ${[scene.sourceReference.firstFrame&&code+'-firstFrame.jpg',scene.sourceReference.lastFrame&&code+'-lastFrame.jpg'].filter(Boolean).join(', ')}. Replace source branding with the approved product.`),
          ...group.map(({scene},i)=>`SHOT ${i+1}: ${shots[i].trimFromSec}–${shots[i].trimToSec}s\n${scene.prompt}`),
          `Hold the last end frame from ${unit.toSec-unit.fromSec}s to 8s; this tail is discarded in editing.`,
          'Constraints:',...group[0].scene.constraints,`Download as ${name}.mp4. Trim using timeline.json before placing scene clips in the inbox.`,
        ].join('\n\n')+'\n',{flag:'wx'});
      }
      await writeFile(join(staging,'timeline.json'),JSON.stringify({version:2,overlayStyle:{color:'white',outline:'black',heightPercent:[5,6],position:'top-center',lines:[1,2],transition:'hard-cut'},units:timeline},null,2)+'\n',{flag:'wx'});
    }
    await writeFile(join(staging,'README-VI.txt'),[
      'GÓI PROMPT MANUAL — HERMES CLIP', `Mã sản phẩm: ${rows[0].productCode}`, `Dự án: ${rows[0].project.data.name}`,
      '1. Tự mở Google Flow/Gemini (hoặc Grok), đăng nhập bằng tài khoản của bạn.',
      '2. Mỗi cảnh: mở file .txt, thêm các ảnh -ref- đi kèm theo ghi chú, dán prompt tiếng Anh.',
      '3. Chọn tỷ lệ 9:16 và thời lượng 8 giây. Tự kiểm chi phí của công cụ trước khi tạo.',
      '4. Tải ảnh/video về máy. Đặt tên chứa đúng mã cảnh (ví dụ '+rows[0].code+'-take2.mp4).',
      `5. Chép file đã tải xong vào Hộp nhận media: ${this.inbox()}`,
      '6. App nén file mới, kiểm và gắn phiên bản chờ duyệt; sau khi thành công, đưa gốc mới vào Thùng rác Windows. File cũ giữ nguyên.',
      '7. File chưa khớp mã nằm ở Chưa gắn cảnh. Chọn đúng cảnh trong app để gắn tay.',
      '8. Xem lại nội dung, tỷ lệ/thời lượng trước khi duyệt và ghép. Gói này yêu cầu 8 giây; thông số cảnh cũ không tự thay đổi.',
      'App không tự gửi prompt hay điều khiển trang web. Muse đang được tạm dừng mặc định.',
      ...(units.size?['KỊCH BẢN V2: tạo từng file UNIT (8 giây, nhiều shot). timeline.json có mốc cắt tương đối và ffmpegArgs cho từng mã cảnh.',
        'Không chép file UNIT nguyên vào Hộp nhận. Cắt bằng FFmpeg/OpenMontage đúng thời lượng từng shot, bỏ phần giữ khung cuối, rồi nhập các file mã cảnh.',
        'Chữ đè trong timeline.json dùng mốc toàn video, thêm khi dựng: trắng viền đen, cao 5–6% khung, giữa trên, vào/ra cứng. CTA thay nhãn ở các shot cuối; caption giữ trong biến thể.',
        'Mở đầu B dùng nhóm tạo riêng, chỉ thay shot đầu; các shot tiếp theo dùng chung.']:[]),
    ].join('\n')+'\n',{flag:'wx'});
    // A complete pack becomes visible in one rename; existing packs are never overwritten.
    await rename(staging,destination); this.store.set('manual_exports',exports); this.changed();
    return {path:destination,scenes:rows.map(row=>row.code)};
  });}
  waitForFiles({projectId}) {return this.exclusive(async()=>{
    const exports=this.store.get('manual_exports',{});
    for(const row of this.catalog(await this.records()).filter(row=>row.project.id===projectId)) if(exports[row.code])exports[row.code].waiting=true;
    this.store.set('manual_exports',exports); await mkdir(this.inbox(),{recursive:true}); this.changed(); return this.inbox();
  });}
  assign({sha256,projectId,sceneId}) {return this.exclusive(async()=>{
    const receipt=this.receipts().find(row=>row.sha256===sha256&&row.state!=='received')??this.receipts().find(row=>row.sha256===sha256);
    if(receipt?.intent&&receipt.state!=='received') {
      // Reconcile the previous intent before honoring a new explicit assignment.
      const records=await this.records();
      const previous=records.find(row=>row.kind==='production'&&row.id===receipt.intent.projectId);
      const received=previous?.data.scenes.find(scene=>scene.takes.some(take=>take.sha256===sha256));
      if(received) {
        const take=received.takes.find(take=>take.sha256===sha256);
        this.saveReceipt({...receipt,state:'received',projectId:previous.id,sceneId:received.id,sceneRevision:take.sceneRevision,commandId:'manual_'+sha256,receivedAt:take.createdAt});
      } else this.saveReceipt({...receipt,intent:null});
    }
    const attached=await this.attach(sha256,projectId,sceneId,receipt?.sourceSha256);
    await this.recycleSource(attached);return attached;
  });}
  async attach(sha256,projectId,sceneId,sourceSha256) {
    let receipt=this.receipts().find(row=>row.sha256===sha256&&(!sourceSha256||row.sourceSha256===sourceSha256));
    if (!receipt?.assetId) throw Error('File chưa được nhập vào Thư viện.');
    if (receipt.state==='received') {
      if(receipt.projectId!==projectId||receipt.sceneId!==sceneId)throw Error('File đã gắn vào cảnh khác; giữ receipt cũ.');
      return receipt;
    }
    for(let attempt=0;attempt<4;attempt++) {
      const row=this.catalog(await this.records()).find(row=>row.project.id===projectId&&row.scene.id===sceneId&&!row.archived);
      if(!row)throw Error('Chọn cảnh manual của sản phẩm đang hoạt động.');
      const commandId='manual_'+sha256;
      const existing=row.project.data.scenes.find(scene=>scene.takes.some(take=>take.sha256===sha256));
      if(existing && existing.id!==sceneId)throw Error('Checksum đã thuộc cảnh khác.');
      if(!existing){const route=this.route(row.project.data,row.scene,row.project.id);
        if(route.blocked)throw Error(route.reason);
        if(route.provider!=='manual')throw Error('Chọn cảnh manual của sản phẩm đang hoạt động.');}
      // Save exact intent first. Recovery never attaches a changed scene silently.
      if(receipt.intent&&(receipt.intent.projectId!==projectId||receipt.intent.sceneId!==sceneId||receipt.intent.sceneRevision!==row.scene.revision))throw Error('Cảnh đã đổi sau khi bắt đầu nhập. Kiểm lại phiên bản trước khi gắn.');
      receipt=this.saveReceipt({...receipt,intent:{projectId,sceneId,sceneRevision:row.scene.revision}});
      try {
        if(!existing)await this.request('/api/production',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:projectId,revision:row.project.revision,commandId,action:'manual_result',input:{sceneId,sceneRevision:row.scene.revision,assetId:receipt.assetId}})});
        return this.saveReceipt({...receipt,state:'received',projectId,sceneId,sceneRevision:existing?.takes.find(take=>take.sha256===sha256)?.sceneRevision??row.scene.revision,commandId,receivedAt:Date.now(),error:''});
      }catch(error){if(error.status!==409||attempt===3)throw error;}
    }
  }
  async recycleSource(receipt) {
    // Legacy receipts have no compression/sourceSha256 and are never trashed.
    if(!this.trashItem||!receipt.compression||!receipt.sourceSha256||receipt.state!=='received'||receipt.trashedAt)return;
    const path=receipt.sourcePath;
    if(resolve(path)!==join(resolve(this.inbox()),basename(path)))throw Error('File gốc không còn ở Hộp nhận hiện tại; giữ nguyên.');
    const info=await lstat(path).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if(!info)return;
    if(!info.isFile()||info.isSymbolicLink()||hash(await readFile(path))!==receipt.sourceSha256)throw Error('File gốc đã thay đổi; không đưa vào Thùng rác.');
    if((receipt.trashAttempts??0)>=3)throw Error('Đã thử Thùng rác 3 lần; gốc còn nguyên. Kiểm quyền Windows và tự chuyển gốc sau khi xem take đã nhập.');
    receipt=this.saveReceipt({...receipt,trashAttempts:(receipt.trashAttempts??0)+1});
    await this.trashItem(path);
    this.saveReceipt({...receipt,trashedAt:Date.now(),error:''});
  }
  async importFile(path, rows) {
    const before=await stat(path), ext=extname(path).toLowerCase();
    const type=types[ext];
    if (!type || !before.size || before.size>(type.startsWith('image/')?8:25)*1024**2) throw Error('Ảnh tối đa 8 MB, video tối đa 25 MB; chỉ nhận file không rỗng.');
    assertDiskSpace(this.local.root,before.size*2,storagePolicy(this.store));
    // Probe a private snapshot, so a browser still writing the source cannot change the imported bytes.
    const staging=join(this.local.root,'manual-staging'); await mkdir(staging,{recursive:true});
    const snapshot=join(staging,randomUUID()+ext);
    let compressed;
    try {
      await copyFile(path,snapshot);
      const after=await stat(path);
      if(before.size!==after.size||before.mtimeMs!==after.mtimeMs)throw Error('File đang thay đổi; chờ tải xong.');
      const sourceBytes=await readFile(snapshot), sourceSha256=hash(sourceBytes);
      const prior=this.receipts().find(row=>(row.sourceSha256??row.sha256)===sourceSha256);
      if(prior?.assetId) {
        let receipt=prior;
        if(prior.intent&&prior.state!=='received')receipt=await this.attach(prior.sha256,prior.intent.projectId,prior.intent.sceneId,prior.sourceSha256);
        // Reconcile only the original intake path. A later duplicate drop is
        // ignored, never silently removed using a receipt for another path.
        if(receipt.sourcePath===path)await this.recycleSource(receipt);
        return this.receipts().find(row=>(row.sourceSha256??row.sha256)===sourceSha256)??receipt;
      }
      compressed=await this.compress(snapshot);
      const {sha256,metadata,compression}=compressed, name=basename(path);
      const warning=Math.abs((metadata.width/metadata.height)/(9/16)-1)>.01?'Sai tỷ lệ 9:16; file vẫn được nhập, cần xem lại.':'';
      const probe={type:compressed.type,metadata,warning};
      const matched=rows.filter(row=>!row.archived&&new RegExp(`(^|[^a-z0-9])${row.code}([^a-z0-9]|$)`,'i').test(name));
      const target=matched.length===1&&this.route(matched[0].project.data,matched[0].scene,matched[0].project.id).provider==='manual'&&!this.route(matched[0].project.data,matched[0].scene,matched[0].project.id).blocked?matched[0]:null;
      let receipt=this.saveReceipt({sha256,sourceSha256,compression,sourceSize:before.size,size:compressed.size,name,sourcePath:path,state:'unmatched',...probe,
        error:matched.length===1?this.route(matched[0].project.data,matched[0].scene,matched[0].project.id).reason:'',createdAt:Date.now(),assetId:null});
      const form=new FormData(); form.append('commandId','manual_'+sourceSha256);
      form.append('preparedToken',this.local.registerPreparedMedia({...compressed,name:name.replace(/\.[^.]+$/,'')+extname(compressed.path)}));
      const asset=await (await this.request('/api/assets',{method:'POST',body:form})).json();
      if(asset.sha256!==sha256)throw Error('Checksum sau nhập không khớp.');
      receipt=this.saveReceipt({...receipt,assetId:asset.id});
      if(target) {
        try {const attached=await this.attach(sha256,target.project.id,target.scene.id,sourceSha256);await this.recycleSource(attached);return attached;}
        catch(error) {return this.saveReceipt({...this.receipts().find(row=>row.sourceSha256===sourceSha256),error:error.message});}
      }
      return receipt;
    } finally {await compressed?.cleanup();await unlink(snapshot).catch(()=>{});}
  }
  scan() {return this.exclusive(async()=>{
    const inbox=this.inbox(); await mkdir(inbox,{recursive:true});
    const rows=this.catalog(await this.records());
    for(const entry of await readdir(inbox,{withFileTypes:true})) {
      if(!entry.isFile()||!types[extname(entry.name).toLowerCase()])continue;
      const path=join(inbox,entry.name);
      try {
        const info=await lstat(path); if(!info.isFile()||info.isSymbolicLink())continue;
        const signature=`${info.size}:${info.mtimeMs}`;
        if(this.processed.get(path)===signature)continue;
        if(this.observed.get(path)!==signature){this.observed.set(path,signature);continue;}
        const receipt=await this.importFile(path,rows); if(receipt?.error){this.errors.set(entry.name,receipt.error);}else{this.processed.set(path,signature);this.errors.delete(entry.name);}
      }catch(error){this.errors.set(entry.name,error.message);}
    }
    return this.status();
  });}
  start() {
    if(this.timer)return;
    const tick=()=>{if(this.scanning)return;this.scanning=true;void this.scan().catch(error=>this.errors.set('Hộp nhận media',error.message)).finally(()=>{this.scanning=false;});};
    tick(); this.timer=setInterval(tick,2000); this.timer.unref();
  }
  async close() {clearInterval(this.timer);this.timer=null;await this.tail;}
}
