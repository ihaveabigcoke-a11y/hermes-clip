import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolveProvider, textProviderReceipts} from './provider-routing.mjs';
import {randomUUID} from 'node:crypto';
import {access, mkdir, mkdtemp, rm} from 'node:fs/promises';
import {constants} from 'node:fs';
import {delimiter, join, resolve, isAbsolute} from 'node:path';

export const CODEX_TIMEOUT_MS = 180000;
export const CODEX_OUTPUT_LIMIT = 2 * 1024 * 1024;
const finalLimit = 384000;
const missing = 'Không tìm thấy Codex CLI native. Cài Codex CLI, đăng nhập bằng gói ChatGPT/Codex của bạn, rồi mở lại app; trên Windows có thể chỉ định đường dẫn codex.exe trong Cài đặt. App không chạy shim .cmd/.ps1.';

export async function resolveCodexExecutable(configured = '', env = process.env, platform = process.platform) {
  const candidates = [];
  if (configured) {
    if (!isAbsolute(configured) || /[\0\r\n]/.test(configured) || (platform === 'win32' && !/\.exe$/i.test(configured)))
      throw Error('Đường dẫn Codex phải tuyệt đối, trỏ tới chương trình native (codex.exe trên Windows).');
    candidates.push(configured);
  } else for (const directory of (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean)) {
    if (!isAbsolute(directory)) continue;
    candidates.push(join(directory, platform === 'win32' ? 'codex.exe' : 'codex'));
    if (platform === 'win32') {
      const target = process.arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
      const pkg = 'codex-win32-' + (process.arch === 'arm64' ? 'arm64' : 'x64');
      for (const base of [join(directory,'node_modules/@openai/codex'),join(directory,'node_modules/@openai',pkg),join(directory,'node_modules/@openai/codex/node_modules/@openai',pkg)])
        candidates.push(join(base,'vendor',target,'codex/codex.exe'));
    }
  }
  for (const candidate of candidates) {
    try { await access(candidate, constants.X_OK); return candidate; } catch { /* Try the next native executable. */ }
  }
  throw Error(missing);
}

// Shared with scripts/run-codex.mjs. No shell, prompt in stdin, bounded NDJSON.
export async function runCodexText({prompt, executable, cwd, timeoutMs = CODEX_TIMEOUT_MS,
  maxOutputBytes = CODEX_OUTPUT_LIMIT, spawnProcess = spawn, env = process.env, profile = '', images = [], outputSchema = ''} = {}) {
  if (typeof prompt !== 'string' || !prompt.trim() || Buffer.byteLength(prompt) > finalLimit) throw Error('Prompt vượt giới hạn hoặc rỗng.');
  executable ??= await resolveCodexExecutable('', env);
  const childEnv = {...env};
  if(!Array.isArray(images)||images.length>20||images.some(p=>typeof p!=='string'||!isAbsolute(p)||/[\0\r\n]/.test(p)))throw Error('Tối đa 20 ảnh shot, đường dẫn tuyệt đối.');
  if(outputSchema&&(!isAbsolute(outputSchema)||/[\0\r\n]/.test(outputSchema)))throw Error('Schema phải có đường dẫn tuyệt đối.');
  if(images.length||outputSchema){delete childEnv.OPENAI_API_KEY;delete childEnv.CODEX_API_KEY;}
  if (typeof profile !== 'string' || profile.length > 120 || /[\0\r\n]/.test(profile)) throw Error('Codex profile không hợp lệ.');
  // Custom providers inherit the user's config, login and environment unchanged.
  return new Promise((yes, no) => {
    let child, timer, settled = false, bytes = 0, pending = '', final = '', failure = '';
    const finish = (error) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) { child?.kill(); no(error); } else yes(final);
    };
    const line = text => {
      if (!text.trim()) return;
      let event;
      try { event = JSON.parse(text); } catch { throw Error('Codex CLI trả stream JSON không hợp lệ.'); }
      if (event.type === 'error' || event.type === 'turn.failed') failure = 'Codex CLI chưa hoàn tất. Kiểm tra đăng nhập hoặc hạn mức gói trong Codex CLI.';
      if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
        if (typeof event.item.text !== 'string' || Buffer.byteLength(event.item.text) > finalLimit) throw Error('JSON cuối của Codex vượt 384 KB hoặc không hợp lệ.');
        final = event.item.text;
      }
    };
    const account = chunk => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > maxOutputBytes) { finish(Error('Đầu ra Codex CLI vượt giới hạn 2 MB.')); return false; }
      return !settled;
    };
    try {
      child = spawnProcess(executable, ['exec','--json','--ephemeral','--skip-git-repo-check',images.length?'-s':'--sandbox','read-only',
        ...images.flatMap(path=>['--image',path]),...(outputSchema?['--output-schema',outputSchema]:[]),
        ...(profile.trim() ? ['--profile',profile.trim()] : []),'-'],
      {cwd, env: childEnv, shell: false, windowsHide: true, stdio: ['pipe','pipe','pipe']});
      timer = setTimeout(() => finish(Error('Codex CLI hết thời gian chờ. Chưa nhập kết quả; không tự chạy lại.')), timeoutMs);
      child.on('error', error => finish(Error(error.code === 'ENOENT' ? missing : 'Không khởi chạy được Codex CLI: ' + error.message)));
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => {
        if (!account(chunk)) return;
        try {
          pending += chunk;
          let end;
          while ((end = pending.indexOf('\n')) !== -1) { line(pending.slice(0,end)); pending = pending.slice(end+1); }
        } catch (error) { finish(error); }
      });
      child.stderr.on('data', account);
      child.stdin.on('error', error => finish(Error('Không gửi được prompt cho Codex CLI: ' + error.message)));
      child.on('close', code => {
        if (settled) return;
        try {
          if (pending.trim()) line(pending);
          if (code !== 0 || failure) throw Error(failure || 'Codex CLI thoát với mã ' + code + '. Kiểm tra đăng nhập và cấu hình CLI.');
          if (!final) throw Error('Codex CLI chưa trả thông điệp JSON cuối cùng.');
          finish();
        } catch (error) { finish(error); }
      });
      child.stdin.end(prompt);
    } catch (error) { finish(error); }
  });
}

export async function codexImageCapability(executable,{run=promisify(execFile),env=process.env}={}) {
  const childEnv={...env};delete childEnv.OPENAI_API_KEY;delete childEnv.CODEX_API_KEY;
  try {
    const {stdout}=await run(executable,['exec','--help'],{shell:false,windowsHide:true,timeout:15000,maxBuffer:65536,env:childEnv});
    const missing=['--image','--output-schema'].filter(flag=>!stdout.includes(flag));
    return {ready:!missing.length,error:missing.length?'Codex CLI thiếu cờ '+missing.join(', ')+'. Dùng Nhập tay hoặc cập nhật CLI.':null};
  }catch{return {ready:false,error:'Chưa đọc được codex exec --help. Dùng Nhập tay và kiểm tra Codex CLI.'};}
}

export class CodexTextService {
  constructor({store, root, exchange, run = runCodexText, resolveExecutable = resolveCodexExecutable}) {
    Object.assign(this, {store, root, exchange, run, resolveExecutable}); this.busy = false;
  }
  status() { return {enabled: this.store.get('codex_text_enabled', false) === true, executable: this.store.get('codex_text_executable', ''), profile: this.store.get('codex_text_profile', ''), busy: this.busy}; }
  configure(value) {
    if (!value || typeof value.enabled !== 'boolean' || typeof value.executable !== 'string' || value.executable.length > 2000 || /[\0\r\n]/.test(value.executable)) throw Error('Cấu hình Codex không hợp lệ.');
    if (this.busy) throw Error('Chờ lượt Codex đang chạy kết thúc.');
    if (value.profile !== undefined && (typeof value.profile !== 'string' || value.profile.length > 120 || /[\0\r\n]/.test(value.profile))) throw Error('Codex profile không hợp lệ.');
    const path = value.executable.trim();
    if (path && (!isAbsolute(path) || (process.platform === 'win32' && !/\.exe$/i.test(path)))) throw Error('Điền đường dẫn tuyệt đối tới codex.exe.');
    this.store.set('codex_text_executable', path); this.store.set('codex_text_enabled', value.enabled);
    if (value.profile !== undefined) this.store.set('codex_text_profile', value.profile.trim());
    return this.status();
  }
  async execute(input) {
    if (!this.status().enabled) throw Error('Codex CLI đang tắt. Bật trong Cài đặt để dùng.');
    if (this.busy) throw Error('Một lượt Codex CLI đang chạy. Chờ kết quả trước khi gửi tiếp.');
    if (Buffer.byteLength(JSON.stringify(input)) > finalLimit) throw Error('Dữ liệu prompt vượt 384 KB.');
    const {kind, context} = this.exchange.textTaskRequest.parse(input);
    const scope = context.taskScope ?? context.batchId;
    if (scope !== undefined && (typeof scope !== 'string' || !scope || scope.length > 240)) throw Error('Scope tác vụ không hợp lệ.');
    const chats = scope && this.store.db?.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='muse_chats'").get()
      ? this.store.db.prepare('SELECT project_id,body FROM muse_chats WHERE project_id IN (?,?)').all(scope, kind === 'research' ? 'task_research_' + scope : scope).map(row => ({...JSON.parse(row.body),projectId:row.project_id})) : [];
    const previous = textProviderReceipts({kind, scope, runs:kind === 'research' ? this.store.get('research_runs',[]) : [], chats});
    const routing=resolveProvider({kind,selection:'codex',previous});
    if(routing.blocked)throw Error(routing.reason);
    this.busy = true;
    const receipt={id:randomUUID(),provider:'codex',kind,scope:scope??null,state:'running',createdAt:Date.now()};
    const record=patch=>this.store.set('codex_text_receipts',[{...receipt,...patch},...this.store.get('codex_text_receipts',[]).filter(row=>row.id!==receipt.id)].slice(0,500));
    record({});
    let directory;
    try {
      const executable = await this.resolveExecutable(this.status().executable);
      const base = resolve(this.root, 'codex-text'); await mkdir(base, {recursive:true});
      directory = await mkdtemp(join(base, 'run-'));
      const text = await this.run({prompt:this.exchange.textTaskPrompt(kind, context), executable, cwd:directory, profile:this.status().profile});
      // Both entry paths use the same validation; invalid output never reaches persistence.
      this.exchange.parseTextExchange(kind, text, 'Codex CLI');
      record({state:'done',finishedAt:Date.now()});
      return {text, source:'import:Codex CLI',provider:'codex',receiptId:receipt.id};
    } catch(error){record({state:'failed',finishedAt:Date.now()});throw error;} finally { this.busy = false; if (directory) await rm(directory, {recursive:true, force:true, maxRetries:5, retryDelay:100}); }
  }
}
