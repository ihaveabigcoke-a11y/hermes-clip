// T08 offline UI acceptance: intercept every request, use an isolated browser
// under outputs/, and never load a user profile, real DB or external service.
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve, join, extname, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const build = resolve(root, process.env.HERMES_LOCAL_BUILD_DIR || 'outputs/night-t08/build');
assert.ok(build.startsWith(join(root, 'outputs') + sep));
const temp = join(root, 'outputs/night-t08/browser'), out = join(root, 'ops/night/out');
await mkdir(temp, {recursive:true}); await mkdir(out, {recursive:true});
process.env.TEMP = temp; process.env.TMP = temp; process.env.PLAYWRIGHT_BROWSERS_PATH = join(temp, 'browsers');
const videoPath = join(temp, 'fixture.mp4');
execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=gray:s=720x1280:r=1','-t','10','-c:v','libx264','-pix_fmt','yuv420p',videoPath], {windowsHide:true});
const {chromium} = await import('../desktop/node_modules/playwright/index.mjs');
const {emptyProduct} = await import(pathToFileURL(join(build, 'server/lib/lab/domain.mjs')));
const {newProduction, applyProduction} = await import(pathToFileURL(join(build, 'server/lib/lab/production.mjs')));
const at = Date.now(), productId = 'ui_fixture_product', projectId = 'ui_fixture_project';
const sceneName = 'Instagram Create a clear product demonstration with natural light';
const product = {id:productId, kind:'product', revision:1, updatedAt:at,
  data:{...emptyProduct, name:'T08 fixture product', niche:'Đồ dùng', problem:'Fixture kiểm bố cục và dữ liệu thiếu.',
    imageUrl:'/api/assets/fixture_image', cost:36.5, costCurrency:'CNY', shipping:4.25, shippingCurrency:'USD', price:29, currency:'USD'}};
let production = newProduction('T08 fixture project', productId, 1);
production = applyProduction(production, 'scene', {id:'fixture_image_scene', name:sceneName, prompt:'Show the product in natural light. '.repeat(55), mediaType:'image', ratio:'9:16', duration:10}, 'fixture_scene', at, 1);
production = applyProduction(production, 'storyboard', {sceneId:'fixture_image_scene'}, 'fixture_storyboard', at, 1);
production = applyProduction(production, 'attach', {sceneId:'fixture_image_scene', attemptId:null,
  take:{assetId:'fixture_image', name:'fixture.png', type:'image/png', size:100, sha256:'a'.repeat(64), metadata:{width:720, height:1280, duration:null, verifiedBy:'container'}}}, 'fixture_attach', at, 1);
production = applyProduction(production, 'scene', {id:'fixture_video_scene', name:sceneName, prompt:'Show the product in natural light.', mediaType:'video', ratio:'9:16', duration:10}, 'fixture_video', at, 1);
production = applyProduction(production, 'storyboard', {sceneId:'fixture_video_scene'}, 'fixture_video_storyboard', at, 1);
production = applyProduction(production, 'attach', {sceneId:'fixture_video_scene', attemptId:null,
  take:{assetId:'fixture_video', name:'fixture.mp4', type:'video/mp4', size:100, sha256:'b'.repeat(64), metadata:{width:720, height:1280, duration:10, verifiedBy:'container'}}}, 'fixture_video_attach', at, 1);
production = applyProduction(production, 'scene', {id:'fixture_queued_scene', name:sceneName, prompt:'Show a close-up of the product.', mediaType:'video', ratio:'9:16', duration:10}, 'fixture_queued', at, 1);
const project = {id:projectId, kind:'production', data:production, revision:1, updatedAt:at};
const fixtureRecords = [product, project, {id:'fixture_account', kind:'social_account', revision:1, updatedAt:at, data:{productId, name:'Fixture account'}}];
let records = fixtureRecords;
const job = {id:'fixture_job', state:'queued', label:'Chờ tạo', request:{projectId, productId, sceneId:'fixture_queued_scene', sceneRevision:1,
  productRevision:1, name:sceneName, prompt:'Show the product in natural light.', mediaType:'video', duration:10, ratio:'9:16', references:[]}, history:[], createdAt:at, updatedAt:at, profileId:null};
const status = {profiles:[], jobs:[job], active:0, generationReady:false, batch:{id:'fixture_batch', perProfileLimit:3, submittedByProfile:{}}};
const writes = [], blocked = [], errors = [], checks = [];
const browser = await chromium.launch({headless:true, executablePath:process.env.HERMES_TEST_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  env:{...process.env, APPDATA:temp, LOCALAPPDATA:temp}, args:['--disable-background-networking','--disable-component-update','--disable-crash-reporter','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND']});
try {
  const context = await browser.newContext({viewport:{width:1920, height:1080}, serviceWorkers:'block'});
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    const json = (data, status=200) => route.fulfill({status, contentType:'application/json', body:JSON.stringify(data)});
    if (url.origin !== 'http://127.0.0.1:4178') {blocked.push(url.href); return route.abort();}
    if (url.pathname === '/api/lab' && request.method() === 'GET') return json({records});
    if (url.pathname === '/api/production' && request.method() === 'POST') {
      const body = request.postDataJSON(); writes.push(body);
      const previous = records.find(row => row.id === body.id);
      assert.equal(body.revision, previous.revision);
      const record = {...previous, data:applyProduction(previous.data, body.action, body.input, body.commandId, at, 1), revision:previous.revision+1};
      records = records.map(row => row.id === record.id ? record : row); return json({record});
    }
    if (url.pathname === '/api/assets/fixture_image') return route.fulfill({contentType:'image/png', body:await readFile(join(root,'desktop/local/seed-media/product-reference.png'))});
    if (url.pathname === '/api/assets/fixture_video') return url.searchParams.has('thumbnail')
      ? route.fulfill({contentType:'image/png',body:await readFile(join(root,'desktop/local/seed-media/product-reference.png'))})
      : route.fulfill({contentType:'video/mp4',body:await readFile(videoPath)});
    if (url.pathname.startsWith('/api/')) return json({error:'Fixture endpoint unavailable'}, 404);
    const file = resolve(build, 'ui', url.pathname === '/' ? 'index.html' : '.' + url.pathname);
    assert.ok(file.startsWith(join(build,'ui') + sep));
    try {return route.fulfill({body:await readFile(file), contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'})[extname(file)] || 'application/octet-stream'});}
    catch {return route.fulfill({status:404, body:'Fixture asset missing'});}
  });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(10000);
  await page.addInitScript(({status}) => {
    localStorage.setItem('product-lab-mode','real');
    window.productLabDesktop = {status:async()=>status, instagramStatus:async()=>({profiles:[],jobs:[],active:null,metrics:{rows:[]}})};
  }, {status});
  const open = async view => {await page.goto('http://127.0.0.1:4178/?view='+view+'&production='+projectId); await page.evaluate(()=>document.fonts.ready);};
  const noOverflow = async label => {assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth), label);};
  const screenshot = name => page.screenshot({path:join(out, 'T08-'+name+'.png')});
  const inViewport = locator => locator.evaluate(el => {const r=el.getBoundingClientRect(); return r.top>=0 && r.left>=0 && r.bottom<=innerHeight && r.right<=innerWidth;});

  await open('images');
  const prompt = page.locator('#desk-prompt'), save = page.getByRole('button',{name:'Lưu cảnh nháp',exact:true});
  await prompt.waitFor(); await page.locator('.job-copy strong').first().waitFor();
  assert.ok(await save.isDisabled()); assert.match(await page.locator('#desk-save-hint').textContent(), /Nhập prompt/);
  for (const text of ['   ', '\n\t', 'Show the product in natural light.']) {
    await prompt.fill(text); assert.equal(await save.isEnabled(), !!text.trim());
  }
  await prompt.fill('');
  await page.locator('.desk-form').evaluate(form=>form.requestSubmit());
  assert.equal(writes.length, 0, 'Blank prompt must not dispatch even with programmatic submit');
  assert.equal(await page.getByRole('button',{name:'Người mẫu',exact:true}).count(),1);
  const preview = page.locator('.desk-preview');
  for (const width of [1920,1536,1366,800,390]) {
    await page.setViewportSize({width,height:width===390?844:width===1536?864:1080});
    if (width<=1249) await page.locator('.desk-mobile-nav').getByRole('button',{name:'Xem trước',exact:true}).click();
    await page.evaluate(()=>window.scrollTo(0,0));
    for (const name of ['Duyệt','Từ chối','Tải file']) {
      const button = preview.getByRole('button',{name,exact:true}); assert.ok(await button.isVisible());
      assert.ok(await inViewport(button), name+' outside viewport at '+width);
    }
    assert.equal(await page.locator('.desk-preview-scroll').evaluate(el=>el.scrollTop), 0);
    await noOverflow('Preview overflow '+width); await screenshot('preview-'+width);
    checks.push({screen:'preview',width,reviewActionsWithoutScroll:true});
    if (width>=1250 && width<=1600) assert.ok(await page.locator('.job-copy strong').first().evaluate(el=>el.clientWidth>=100), 'Scene title too narrow at '+width);
  }
  await page.setViewportSize({width:1920,height:1080});
  await preview.getByRole('button',{name:'Từ chối',exact:true}).click();
  const dialog = page.getByRole('dialog');
  assert.equal(await dialog.getByLabel('Kết luận',{exact:true}).inputValue(),'rejected');
  await dialog.getByRole('button',{name:'Hủy',exact:true}).click(); assert.equal(writes.length,0);
  await preview.getByRole('button',{name:'Duyệt',exact:true}).click();
  assert.equal(await dialog.getByLabel('Kết luận',{exact:true}).inputValue(),'approved');
  await dialog.getByRole('button',{name:'Hủy',exact:true}).click();
  await preview.getByRole('button',{name:'Từ chối',exact:true}).click();
  await dialog.getByLabel('Ghi chú / lý do từ chối',{exact:true}).fill('Fixture: cần sửa bố cục trước khi duyệt.');
  await dialog.getByRole('button',{name:'Lưu thay đổi',exact:true}).click(); await dialog.waitFor({state:'hidden'});
  assert.equal(writes.length,1); assert.equal(writes[0].action,'review'); assert.equal(writes[0].input.review,'rejected');
  assert.equal(records.find(row=>row.id===projectId).data.scenes[0].takes[0].review,'rejected');
  checks.push({screen:'review',cancelWrites:0,rejectedSavedToFixture:true});

  await open('production'); await page.locator('.job-copy strong').first().waitFor();
  const title = page.locator('.job-copy strong').first(); assert.equal(await title.getAttribute('title'),sceneName);
  assert.equal(await title.evaluate(el=>getComputedStyle(el).webkitLineClamp),'2');
  assert.equal(await page.locator('.desk-queue-tools select').first().evaluate(el=>el.selectedOptions[0].textContent),'Tất cả');
  for (const name of ['Duyệt','Từ chối']) assert.ok(await inViewport(preview.getByRole('button',{name,exact:true})), 'Video review action hidden');
  await page.locator('.desk-player video').waitFor();
  await page.waitForFunction(()=>document.querySelector('.desk-player video')?.readyState>=2);
  await screenshot('compose-1920');
  checks.push({screen:'video-preview',width:1920,reviewActionsWithoutScroll:true});

  await open('queue'); await page.locator('.queue-row-title strong').first().waitFor();
  assert.equal(await page.locator('.queue-row-title strong').first().getAttribute('title'),sceneName);
  assert.equal(await page.locator('.queue-row-title strong').first().evaluate(el=>getComputedStyle(el).webkitLineClamp),'2');
  await noOverflow('Queue overflow'); await screenshot('queue-1920');

  await open('products'); await page.locator('.product-card').waitFor();
  assert.equal(await page.locator('.workspace-mode').count(),0);
  assert.equal(await page.getByRole('button',{name:'Khám phá bản mẫu',exact:true}).count(),0);
  assert.equal(await page.locator('.page-eyebrow').count(),0);
  assert.equal(await page.locator('.product-info').count(),1);
  assert.match(await page.locator('.product-card-summary').textContent(), /Vốn.*36.*ship.*4.*1 tài khoản.*Nội dung/);
  await page.locator('.business-navigation').evaluate(el=>el.open=true);
  for (const width of [1920,1366,800,390]) {
    await page.setViewportSize({width,height:width===390?844:1080});
    await noOverflow('Products overflow '+width);
    if (width>=1366) {
      for (const name of ['Tài khoản Muse','Thử nghiệm nội dung','Trang giới thiệu']) {
        const label = page.locator('.sidebar nav a span').filter({hasText:new RegExp('^'+name+'$')});
        assert.ok(await label.evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el); return r.height<=parseFloat(s.lineHeight)+1 && el.scrollWidth<=el.clientWidth+1;}), name+' wraps at '+width);
      }
      assert.ok(await page.locator('.business-navigation summary span').evaluate(el=>el.getBoundingClientRect().height<=parseFloat(getComputedStyle(el).lineHeight)+1));
      assert.ok(await inViewport(page.locator('.product-card-footer')));
    }
    await screenshot('products-'+width); checks.push({screen:'products',width,noOverflow:true});
  }
  assert.ok(await page.locator('.product-card > .product-art').evaluate(el=>el.getBoundingClientRect().height<=160 && Math.abs(el.clientWidth-el.parentElement.clientWidth)<=2));

  records = [];
  await page.setViewportSize({width:1920,height:1080}); await open('products');
  const explore = page.getByRole('button',{name:'Khám phá bản mẫu',exact:true}); await explore.waitFor();
  assert.match(await explore.getAttribute('class'), /neutral/);
  assert.equal(await page.locator('.product-info').count(),1); assert.equal(await page.locator('.workspace-mode').count(),0);
  await screenshot('empty-products-1920');
  await explore.click(); await page.getByRole('button',{name:'Dùng dữ liệu của bạn',exact:true}).waitFor();
  await page.getByRole('button',{name:'Dùng dữ liệu của bạn',exact:true}).click(); await explore.waitFor();
  records = fixtureRecords;
  await page.reload(); await page.locator('.product-card').waitFor(); assert.equal(await explore.count(),0);
  checks.push({screen:'banner',empty:true,populated:false,demoExit:true,neutral:true});
  assert.deepEqual(errors,[]); assert.deepEqual(blocked,[]);
  await writeFile(join(out,'T08-ui-check.json'), JSON.stringify({fixtureOnly:true,realServices:false,checks,writes:writes.map(row=>({action:row.action,review:row.input.review})),errors,blocked},null,2)+'\n');
  console.log(JSON.stringify({checks:checks.length,writes:writes.length,errors,blocked}));
} finally {await browser.close();}
