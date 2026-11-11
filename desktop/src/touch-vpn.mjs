import {createHash, createPublicKey, verify} from 'node:crypto';
import {mkdir, mkdtemp, readFile, writeFile, rename, unlink} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

export const TOUCH_VPN_ID = 'bihmplhobchoageeokmgbdihknkjbknd';
export const TOUCH_VPN_STORE = `https://chromewebstore.google.com/detail/touch-vpn-secure-and-unli/${TOUCH_VPN_ID}`;

function fields(bytes) {
  const result = new Map();
  let offset = 0;
  function integer() {
    let value = 0;
    let shift = 0;
    while (offset < bytes.length && shift <= 28) {
      const byte = bytes[offset++];
      value += (byte & 127) * 2 ** shift;
      if (!(byte & 128)) return value;
      shift += 7;
    }
    throw Error('CRX có dữ liệu protobuf không hợp lệ.');
  }
  while (offset < bytes.length) {
    const tag = integer();
    if ((tag & 7) !== 2) throw Error('CRX có trường không được hỗ trợ.');
    const length = integer();
    if (length < 0 || offset + length > bytes.length) throw Error('CRX bị thiếu dữ liệu.');
    const values = result.get(tag >>> 3) ?? [];
    values.push(bytes.subarray(offset, offset + length));
    result.set(tag >>> 3, values);
    offset += length;
  }
  return result;
}

export function unpackVerifiedCrx(bytes) {
  if (bytes.length < 12 || bytes.toString('ascii', 0, 4) !== 'Cr24' || bytes.readUInt32LE(4) !== 3) {
    throw Error('Touch VPN cần gói CRX3 từ Chrome Web Store.');
  }
  const headerLength = bytes.readUInt32LE(8);
  if (headerLength > bytes.length - 12) throw Error('CRX bị thiếu header.');
  const header = fields(bytes.subarray(12, 12 + headerLength));
  const signedData = header.get(10000)?.[0];
  if (!signedData) throw Error('CRX thiếu chữ ký.');
  const expectedId = Buffer.from([...TOUCH_VPN_ID].map(letter => (letter.charCodeAt(0) - 97).toString(16)).join(''), 'hex');
  if (!fields(signedData).get(1)?.[0].equals(expectedId)) throw Error('Gói tải về không phải Touch VPN.');
  const length = Buffer.alloc(4);
  length.writeUInt32LE(signedData.length);
  const zip = bytes.subarray(12 + headerLength);
  const message = Buffer.concat([Buffer.from('CRX3 SignedData\0'), length, signedData, zip]);
  for (const proof of [...(header.get(2) ?? []), ...(header.get(3) ?? [])]) {
    const value = fields(proof);
    const key = value.get(1)?.[0];
    const signature = value.get(2)?.[0];
    if (!key || !signature || !createHash('sha256').update(key).digest().subarray(0,16).equals(expectedId)) continue;
    if (verify('sha256', message, createPublicKey({key, format:'der', type:'spki'}), signature)) return {zip, key:key.toString('base64')};
  }
  throw Error('Chữ ký nhà phát hành Touch VPN không hợp lệ.');
}

export class TouchVpn {
  constructor(root) { this.root = resolve(root); this.installing = null; }

  async connect(context, manifest) {
    let page;
    try {
      let worker = context.serviceWorkers().find(worker => worker.url().startsWith(`chrome-extension://${TOUCH_VPN_ID}/`));
      if (!worker) worker = await context.waitForEvent('serviceworker', {predicate:worker => worker.url().startsWith(`chrome-extension://${TOUCH_VPN_ID}/`),timeout:20000});
      page = await context.newPage();
      await page.setViewportSize({width:360,height:600});
      await page.goto(`chrome-extension://${TOUCH_VPN_ID}/${manifest.action.default_popup}`, {waitUntil:'domcontentloaded',timeout:15000});
      const connect = page.getByText('Connect', {exact:true});
      const enabled = page.locator('.timer').filter({hasText:/encryption is enabled/i});
      await connect.or(enabled).first().waitFor({state:'visible',timeout:15000});
      if (await connect.isVisible()) await connect.locator('..').click({timeout:10000});
      await enabled.waitFor({state:'visible',timeout:30000});
      const routing = await worker.evaluate(() => new Promise(resolve => chrome.proxy.settings.get({}, settings => {
        const value = settings.value;
        resolve({controlled:settings.levelOfControl === 'controlled_by_this_extension',
          routed:value?.mode === 'fixed_servers' || (value?.mode === 'pac_script' && /(?:HTTPS|PROXY|SOCKS)\s+[^;\s]+:\d+/.test(value.pacScript?.data ?? ''))});
      })));
      if (!routing.controlled || !routing.routed) throw Error('Touch VPN chưa áp dụng proxy.');
      return {state:'connected',version:manifest.version,checkedAt:Date.now(),message:'Touch VPN đã bật và áp dụng proxy trong profile.'};
    } catch {
      const error = Error('Touch VPN chưa kết nối được. Mở VPN để kiểm tra hoặc thử lại.');
      error.code = 'MUSE_VPN_REQUIRED';
      throw error;
    } finally {
      await page?.close().catch(() => {});
    }
  }

  async ensure() {
    if (this.installing) return this.installing;
    this.installing = this.install().finally(() => { this.installing = null; });
    return this.installing;
  }

  async install() {
    const directory = join(this.root, TOUCH_VPN_ID);
    try {
      const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
      if (manifest.key && createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest().subarray(0,16).toString('hex') === [...TOUCH_VPN_ID].map(letter=>(letter.charCodeAt(0)-97).toString(16)).join('')) return {directory, manifest};
    } catch {}
    await mkdir(this.root, {recursive:true});
    const url = new URL('https://clients2.google.com/service/update2/crx');
    url.search = new URLSearchParams({response:'redirect',prodversion:'145.0.0.0',acceptformat:'crx3',x:`id=${TOUCH_VPN_ID}&installsource=ondemand&uc`}).toString();
    const response = await fetch(url, {signal:AbortSignal.timeout(60000)});
    if (!response.ok) throw Error(`Chrome Web Store trả mã ${response.status} khi tải Touch VPN.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 20 * 1024 * 1024) throw Error('Gói Touch VPN vượt dung lượng dự kiến.');
    const {zip, key} = unpackVerifiedCrx(bytes);
    const staging = await mkdtemp(join(this.root, 'touch-install-'));
    const zipPath = join(this.root, `${TOUCH_VPN_ID}.zip`);
    await writeFile(zipPath, zip);
    await promisify(execFile)('powershell.exe', ['-NoProfile','-NonInteractive','-Command',
      '$ErrorActionPreference = "Stop"; Expand-Archive -LiteralPath $env:HERMES_EXTENSION_ZIP -DestinationPath $env:HERMES_EXTENSION_DEST'],
      {windowsHide:true,timeout:60000,env:{...process.env,HERMES_EXTENSION_ZIP:zipPath,HERMES_EXTENSION_DEST:staging}});
    const manifest = JSON.parse(await readFile(join(staging, 'manifest.json'), 'utf8'));
    manifest.key = key;
    await writeFile(join(staging,'manifest.json'), JSON.stringify(manifest,null,2));
    await writeFile(join(staging,'hermes-install.json'), JSON.stringify({source:TOUCH_VPN_STORE,sha256:createHash('sha256').update(bytes).digest('hex'),installedAt:Date.now(),version:manifest.version}));
    await rename(directory, directory + '.previous-' + Date.now()).catch(error => {if (error.code !== 'ENOENT') throw error;});
    await rename(staging,directory);
    await unlink(zipPath);
    return {directory,manifest};
  }
}
