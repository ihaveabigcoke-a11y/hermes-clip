import {runMediaTool,probeMedia} from '../src/compress.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {MuseAdapter} from '../src/muse.mjs';
import {MUSE_VIDEO_COMMAND} from '../src/muse-video-prompt.mjs';
import {jobInput,jobFingerprint} from '../src/contracts.mjs';
import {Store} from '../src/store.mjs';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('reference roles reach Muse in attachment order and legacy jobs deduplicate', async () => {
  const fills=[];
  const adapter=new MuseAdapter({...config,prompt:'textarea',upload:'input[type="file"]'});
  adapter.session=async()=>true;
  const page={locator:()=>({inputValue:async()=>'',fill:async value=>fills.push(value),setInputFiles:async()=>{},waitFor:async()=>{}}),getByRole:()=>({waitFor:async()=>{}}),goto:async()=>{}};
  const reference={id:'r1',version:1,sha256:'a'.repeat(64),type:'image/png',bytes:new Uint8Array([1])};
  const legacy=jobInput.parse({projectId:'project',productId:'product',productRevision:1,sceneId:'scene',sceneRevision:1,name:'Scene',mediaType:'video',ratio:'9:16',duration:10,prompt:'Keep camera fixed',references:[reference]});
  const updated=jobInput.parse({...legacy,references:[{...reference,role:'product'}]});
  const store=new Store(':memory:');
  try {
    const original=store.enqueue(legacy,jobFingerprint(legacy));
    const duplicate=store.enqueue(updated,jobFingerprint(updated),jobFingerprint(legacy));
    assert.equal(duplicate.job.id,original.job.id);
    assert.equal(duplicate.deduplicated,true);
  } finally {store.close();}
  const frames=jobInput.parse({...legacy,references:[{...reference,role:'first_frame'},{...reference,id:'r2',role:'last_frame'}]});
  await adapter.prepare(page,{...frames,references:frames.references.map((reference,index)=>({...reference,path:index+'.png'}))});
  assert.match(fills.at(-1),/Attachment 1 is the FIRST FRAME/);
  assert.match(fills.at(-1),/Attachment 2 is the LAST FRAME/);
  assert.equal(jobInput.safeParse({...frames,mediaType:'image'}).success,false);
  assert.equal(jobInput.safeParse({...frames,references:frames.references.slice(0,1)}).success,false);
});

const config = {
  startUrl: 'https://muse.ai/',
  loggedIn: 'textarea[aria-label="Message"]',
  resultCards: '[data-message-id][data-message-role="assistant"][data-message-has-presentation="true"]',
  resultIdAttribute: 'data-message-id',
  submitName: 'Send',
  readyWithinCard: 'video, img',
  downloadButtonName: 'Download',
  timeoutSeconds: 900,
};

test('Muse waits for attachment readiness with an empty prompt before filling text', async () => {
  const events=[];
  const adapter=new MuseAdapter({...config,prompt:'textarea',upload:'input[type="file"]'});
  adapter.session=async()=>true;
  const page={locator:selector=>({
    inputValue:async()=>'',
    fill:async value=>events.push(['fill',value]),
    setInputFiles:async paths=>events.push(['files',paths]),
    waitFor:async()=>events.push(['ready',selector]),
  }),getByRole:()=>({waitFor:async()=>{}}),goto:async()=>{}};
  await adapter.prepare(page,{prompt:'Create one image',references:[{path:'reference.png'}]});
  assert.deepEqual(events,[['ready','textarea'],['fill',''],['files',['reference.png']],['ready','button[aria-label="Send"]:enabled'],['fill','Create one image']]);
});

test('failed attachment preparation reports its stage without filling the prompt or sending', async () => {
  const fills=[];
  const adapter=new MuseAdapter({...config,prompt:'textarea',upload:'input[type="file"]'});
  adapter.session=async()=>true;
  const page={locator:selector=>({
    inputValue:async()=>'',
    fill:async value=>fills.push(value),
    setInputFiles:async()=>{},
    waitFor:async()=>{if(selector.includes('Send'))throw Error('Upload timeout');},
  }),getByRole:()=>({waitFor:async()=>{},click:async()=>assert.fail('Must not submit')}),goto:async()=>{}};
  await assert.rejects(adapter.prepare(page,{prompt:'Create video',references:[{path:'reference.jpg'}]}),error=>error.code==='MUSE_ATTACHMENT_NOT_READY');
  assert.deepEqual(fills,['']);
});

test('identical first and last image bytes upload under distinct filenames without changing the reference paths', async context => {
  const directory = await mkdtemp(join(tmpdir(), 'hermes-frame-upload-'));
  context.after(() => rm(directory, {recursive:true, force:true}));
  const path = join(directory, 'shared.png');
  const bytes = Buffer.from([137,80,78,71]);
  await writeFile(path, bytes);
  const references = ['first_frame','last_frame'].map(role => ({path, type:'image/png', role}));
  const before = structuredClone(references);
  let files;
  const adapter = new MuseAdapter({...config, prompt:'textarea', upload:'input[type="file"]'});
  adapter.session = async () => true;
  const page = {locator:() => ({inputValue:async() => '', fill:async() => {}, waitFor:async() => {},
    setInputFiles:async value => {files = value;}}), getByRole:() => ({waitFor:async() => {}}), goto:async() => {}};
  await adapter.prepare(page, {mediaType:'video', prompt:'Keep the entire leash visible', references});
  assert.deepEqual(files.map(file => file.name), ['1-first_frame.png','2-last_frame.png']);
  assert.ok(files.every(file => file.mimeType === 'image/png' && file.buffer.equals(bytes)));
  assert.deepEqual(references, before);
});

test('media tasks lift earlier writing-only scope while keeping the brief and attachment roles', async () => {
  const fills=[];
  const adapter=new MuseAdapter({...config,prompt:'textarea',upload:'input[type="file"]'});
  adapter.session=async()=>true;
  const page={locator:()=>({inputValue:async()=>'',fill:async value=>fills.push(value),setInputFiles:async()=>{},waitFor:async()=>{}}),getByRole:()=>({waitFor:async()=>{}}),goto:async()=>{}};
  const brief='Create one video of the exact referenced product';
  await adapter.prepare(page,{mediaType:'video',prompt:brief,references:[{path:'product.png',role:'product'}]});
  assert.ok(fills.at(-1).startsWith(MUSE_VIDEO_COMMAND+'\n'+brief));
  assert.match(fills.at(-1),/This request explicitly authorizes creating the requested video/);
  assert.match(fills.at(-1),/lift any text-only restriction/);
  assert.ok(fills.at(-1).includes(brief));
  assert.match(fills.at(-1),/Attachment 1 is the product identity/);
  await adapter.prepare(page,{prompt:'Write a concept',references:[]});
  assert.equal(fills.at(-1),'Write a concept');
});

test('Muse chat waits beyond 30 seconds and captures exactly the new result', async context => {
  let now = 0;
  let reads = 0;
  let clicks = 0;
  const states = [];
  context.mock.method(Date, 'now', () => now);
  const page = {
    locator: selector => ({evaluateAll: async () => selector === '[data-message-id][data-message-role="assistant"]'||selector.includes('data-message-role="user"') ? [] : ++reads < 4 ? ['old'] : ['old', 'new']}),
    getByRole: () => ({click: async () => clicks++,isVisible:async()=>true}),
    waitForTimeout: async () => {now += 31000;},
    url: () => config.startUrl,
  };
  const result = await new MuseAdapter(config).submit(page, async (state, patch) => states.push({state, patch}));
  assert.equal(result, 'new');
  assert.equal(clicks, 1);
  assert.ok(now > 30000);
  assert.equal(states[1].patch.providerId, 'new');
});

test('Muse chat stops on ambiguous results without a second send', async () => {
  let reads = 0;
  let clicks = 0;
  const page = {
    locator: selector => ({evaluateAll: async () => selector === '[data-message-id][data-message-role="assistant"]'||selector.includes('data-message-role="user"') ? [] : ++reads === 1 ? ['old'] : ['old', 'a', 'b']}),
    getByRole: () => ({click: async () => clicks++}),
  };
  await assert.rejects(new MuseAdapter(config).submit(page, async () => {}), /nhiều kết quả/);
  assert.equal(clicks, 1);
});

test('Muse preview accepts JPEG, publishes compressed WebP and preserves exact result selector', async t => {
  const root=await mkdtemp(join(tmpdir(),'hermes-download-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const jpeg=join(root,'fixture.jpeg');await runMediaTool('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=800x800','-frames:v','1',jpeg]);
  const jpegBytes=await (await import('node:fs/promises')).readFile(jpeg);
  let selected;
  let saved;
  const events = [];
  const preview = {first: () => ({click: async () => events.push('preview')})};
  const ready = {first: () => ({waitFor: async () => {}, isVisible: async () => true})};
  const exact = {
    scrollIntoViewIfNeeded: async () => {},
    locator: selector => selector === config.readyWithinCard ? ready : preview,
    getByRole: () => ({}),
  };
  const page = {
    url: () => config.startUrl,
    goto: async () => assert.fail('A ready result must keep its existing page'),
    keyboard: {press: async key => events.push(key)},
    locator: selector => {
      if (selector === config.loggedIn) return {waitFor: async () => {}, isVisible: async () => true};
      selected = selector;
      return exact;
    },
    getByRole: () => ({waitFor: async () => {}, click: async () => events.push('download')}),
    waitForEvent: async () => ({
      suggestedFilename: () => 'Muse-image.jpeg',
      saveAs: async path => {saved = path;await writeFile(path,jpegBytes);},
      failure: async () => null,
    }),
  };
  const path = await new MuseAdapter(config).fetch(page, {
    providerUrl: config.startUrl,
    providerId: 'exact-result',
    request: {mediaType: 'image'},
  }, async () => {}, join(root,'output.png'));
  assert.equal(path, join(root,'output.webp'));assert.equal((await probeMedia(path)).width,800);
  assert.ok(saved.startsWith(join(root,'output.jpeg')+'.hermes-part-'));
  assert.ok(selected.endsWith('[data-message-id="exact-result"]'));
  assert.deepEqual(events, ['preview', 'download', 'Escape']);
});

test('Muse keeps the open signed-in page when checking its session', async () => {
  let navigations = 0;
  const page = {
    url: () => config.startUrl,
    goto: async (_url, options) => {assert.equal(options.waitUntil, 'domcontentloaded'); navigations++;},
    waitForLoadState: async state => assert.equal(state, 'domcontentloaded'),
    locator: () => ({waitFor: async () => {}, isVisible: async () => true}),
  };
  assert.equal(await new MuseAdapter(config).session(page), true);
  assert.equal(navigations, 0);
  page.url = () => 'about:blank';
  assert.equal(await new MuseAdapter(config).session(page), true);
  assert.equal(navigations, 1);
});

test('Muse preserves an existing user draft before attaching references', async () => {
  const adapter = new MuseAdapter({...config, prompt: 'textarea'});
  adapter.session = async () => true;
  const page = {
    getByRole: () => ({waitFor: async () => {}}),
    locator: () => ({inputValue: async () => 'User draft'}),
  };
  await assert.rejects(adapter.prepare(page, {prompt: 'Job prompt', references: []}), {code: 'MUSE_DRAFT_PRESENT'});
});

test('configured form adapters still navigate to their creation route', async () => {
  const startUrl = 'https://provider.invalid/create';
  let navigated;
  const page = {
    url: () => 'https://provider.invalid/history',
    goto: async url => {navigated = url;},
    locator: () => ({isVisible: async () => true}),
  };
  assert.equal(await new MuseAdapter({...config, startUrl, resultIdAttribute: 'data-job-id'}).session(page), true);
  assert.equal(navigated, startUrl);
});

test('Muse stops when its new message reports unconfirmed delivery', async () => {
  let clicks = 0;
  let userReads = 0;
  const page = {
    locator: selector => ({
      evaluateAll: async () => {
        if (selector === '[data-message-id][data-message-role="assistant"]') return [];
        if (selector.includes('data-message-role="user"')) {
          userReads++;
          return userReads === 1 ? ['old-user'] : ['new-user'];
        }
        return ['old-result'];
      },
    }),
    getByRole: () => ({click: async () => clicks++}),
    waitForTimeout: async () => assert.fail('A delivery error must stop the wait'),
  };
  await assert.rejects(new MuseAdapter(config).submit(page, async () => {}), {code: 'MUSE_DELIVERY_UNCONFIRMED'});
  assert.equal(clicks, 1);
});

test('An earlier delivery error does not fail a new Muse submission', async () => {
  let resultReads = 0;
  const page = {
    locator: selector => ({
      evaluateAll: async () => {
        if (selector === '[data-message-id][data-message-role="assistant"]') return [];
        if (selector.includes('data-message-role="user"')) return ['old-user'];
        resultReads++;
        return resultReads < 3 ? ['old-result'] : ['old-result', 'new-result'];
      },
    }),
    getByRole: () => ({click: async () => {},isVisible:async()=>true}),
    waitForTimeout: async () => {},
    url: () => config.startUrl,
  };
  assert.equal(await new MuseAdapter(config).submit(page, async () => {}), 'new-result');
});

test('new generation uses a separate Muse conversation after preserving drafts',async()=>{
  const events=[];
  const adapter=new MuseAdapter({...config,prompt:'textarea'});
  adapter.session=async()=>true;
  const page={
    getByRole:()=>({waitFor:async()=>{}}),
    goto:async(url,options)=>{assert.equal(options.waitUntil,'domcontentloaded');events.push(url);},
    locator:()=>({inputValue:async()=>'',waitFor:async()=>{},fill:async value=>events.push(value)}),
  };
  await adapter.prepare(page,{prompt:'Create image',references:[]});
  assert.deepEqual(events,['https://muse.ai/thread/new','Create image']);
});

test('completed text-only Muse reply stops with its response and never sends twice',async context=>{
  let now=0;
  let sent=false;
  let clicks=0;
  context.mock.method(Date,'now',()=>now);
  const page={
    locator:selector=>({evaluateAll:async()=>selector === '[data-message-id][data-message-role="assistant"]'&&sent?[{id:'reply',text:'I could not create this file.'}]:[]}),
    getByRole:(_role,{name})=>({click:async()=>{assert.equal(name,'Send');sent=true;clicks++;},isVisible:async()=>false}),
    waitForTimeout:async()=>{now+=1000;},
    url:()=> 'https://muse.ai/thread/test',
  };
  await assert.rejects(new MuseAdapter(config).submit(page,async()=>{}),error=>{
    assert.equal(error.code,'MUSE_NO_MEDIA');
    assert.equal(error.providerResponse,'I could not create this file.');
    assert.equal(error.providerUrl,'https://muse.ai/thread/test');
    return true;
  });
  assert.equal(clicks,1);
  assert.ok(now>=15000&&now<30000);
});

function responseInspection() {
  const adapter = new MuseAdapter(config);
  adapter.session = async () => true;
  const job = {providerUrl: 'https://muse.ai/thread/existing', providerResponse: 'No video was made.', request: {prompt: 'Make this video'}};
  const state = {users: [{text: job.request.prompt}], ids: [], response: job.providerResponse, generating: false};
  const page = {
    goto: async () => {},
    waitForTimeout: async () => {},
    getByRole: () => ({isVisible: async () => state.generating, click: async () => assert.fail('Inspection cannot submit')}),
    locator: selector => ({first: () => ({waitFor: async () => {}}), evaluateAll: async () => selector.includes('role="user"') ? state.users
      : selector === '[data-message-id][data-message-role="assistant"]' ? [state.response] : state.ids}),
  };
  return {adapter, job, state, page};
}

test('rechecking a settled text reply confirms the same request without sending', async () => {
  const {adapter, job, page} = responseInspection();
  assert.deepEqual(await adapter.inspectResponse(page, job), {
    providerId: null, providerUrl: job.providerUrl, response: job.providerResponse,
  });
});

test('rechecking finds a late media result before allowing another attempt', async () => {
  const {adapter, job, state, page} = responseInspection();
  state.ids = ['existing-file'];
  state.response = 'Here is the video';
  assert.equal((await adapter.inspectResponse(page, job)).providerId, 'existing-file');
});

test('rechecking tolerates Markdown whitespace and truncated receipts, while rejecting changed complete replies', async () => {
  const {adapter, job, state, page} = responseInspection();
  state.response = 'No video\n\nwas made.';
  assert.equal((await adapter.inspectResponse(page, job)).providerId, null);
  state.response += ' Another answer.';
  await assert.rejects(adapter.inspectResponse(page, job), /Chưa xác nhận/);
  job.providerResponse = 'x'.repeat(2000);
  state.response = job.providerResponse + ' end';
  assert.equal((await adapter.inspectResponse(page, job)).providerId, null);
});

test('rechecking preserves uncertain, changed, multiple and still-generating conversations', async () => {
  for (const mutation of [
    state => {state.generating = true;},
    state => {state.users.push({text: 'Another request'});},
    state => {state.users[0].unconfirmed = true;},
    state => {state.users[0].text = 'A different prompt';},
    state => {state.response = 'Another response';},
    state => {state.ids = ['one', 'two'];},
  ]) {
    const {adapter, job, state, page} = responseInspection();
    mutation(state);
    await assert.rejects(adapter.inspectResponse(page, job));
  }
  const {adapter, job, state, page} = responseInspection();
  page.waitForTimeout = async () => {state.ids = ['arriving-file'];};
  await assert.rejects(adapter.inspectResponse(page, job), /đang thay đổi/);
});

test('rechecking validates the stored thread before navigation', async () => {
  const {adapter, job, page} = responseInspection();
  page.goto = async () => assert.fail('Invalid thread must not navigate');
  for (const providerUrl of ['https://other.test/thread/id', 'https://muse.ai/thread/new', 'https://user:pass@muse.ai/thread/id']) {
    await assert.rejects(adapter.inspectResponse(page, {...job, providerUrl}));
  }
});

test('Muse suggestions with presentation metadata are not media; real DOM refusal preserves receipt without downloading', async t => {
  const {chromium}=await import('playwright');
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const page=await browser.newPage();
  const response="Video generation isn't available for this account in your country or region.";
  let sends=0;await page.exposeFunction('recordSend',()=>sends++);
  await page.setContent(`<textarea aria-label="Message"></textarea><button id="send">Send</button>`);
  await page.evaluate(response=>{
    document.querySelector('#send').onclick=()=>{
      window.recordSend();
      const user=document.createElement('div');user.dataset.messageId='request';user.dataset.messageRole='user';user.textContent='Make this video';document.body.append(user);
      const reply=document.createElement('div');reply.dataset.messageId='suggestions';reply.dataset.messageRole='assistant';reply.dataset.messageHasPresentation='true';reply.textContent=response;document.body.append(reply);
      const suggestion=document.createElement('button');suggestion.textContent='Yes, make the still image';reply.append(suggestion);
    };
  },response);
  const adapter=new MuseAdapter(config),states=[];
  await assert.rejects(adapter.submit(page,async(state,patch)=>states.push({state,patch})),e=>{
    assert.equal(e.code,'MUSE_NO_MEDIA');assert.ok(e.providerResponse.startsWith(response));return true;
  });
  assert.equal(sends,1);assert.deepEqual(states.map(s=>s.state),['submitting']);
  assert.equal(await adapter.mediaCards(page).count(),0);
  await page.evaluate(()=>{const media=document.createElement('div');media.dataset.messageId='real-media';media.dataset.messageRole='assistant';media.dataset.messageHasPresentation='true';media.innerHTML='<video></video>';document.body.append(media);});
  assert.deepEqual(await adapter.mediaCards(page).evaluateAll(es=>es.map(e=>e.dataset.messageId)),['real-media']);
  await page.locator('[data-message-id="real-media"]').evaluate(e=>e.remove());
  // Reconciliation must use the same media filter and preserve the full saved reply.
  const saved=await page.locator('[data-message-id="suggestions"]').innerText();
  adapter.session=async()=>true;
  const inspectPage={locator:page.locator.bind(page),getByRole:page.getByRole.bind(page),goto:async()=>{},waitForTimeout:async()=>{}};
  const inspected=await adapter.inspectResponse(inspectPage,{providerUrl:'https://muse.ai/thread/saved',providerResponse:saved,request:{prompt:'Make this video'}});
  assert.equal(inspected.providerId,null);assert.equal(inspected.response,saved);
  // Existing receipts may already point to a suggestion card: do not wait 15 minutes.
  const fetchPage={...inspectPage,url:()=>config.startUrl,waitForTimeout:page.waitForTimeout.bind(page)};
  await assert.rejects(adapter.fetch(fetchPage,{providerId:'suggestions',providerUrl:config.startUrl,request:{mediaType:'video'}},async()=>{},'unused.mp4'),e=>{
    assert.equal(e.code,'MUSE_NO_MEDIA');assert.equal(e.providerResponse,saved);return true;
  });
  assert.equal(sends,1);
});

test('Muse resumed-result waiting checks account guard before downloading',async()=>{
  let downloads=0;
  const adapter=new MuseAdapter(config);adapter.guard=async()=>{throw Object.assign(Error('Account warning'),{code:'MUSE_ACCOUNT_WARNING'});};
  const exact={scrollIntoViewIfNeeded:async()=>{},locator:()=>({first:()=>({isVisible:async()=>false})})};
  const page={url:()=>config.startUrl,locator:selector=>selector===config.loggedIn?{waitFor:async()=>{},isVisible:async()=>true}:exact,waitForEvent:async()=>downloads++};
  await assert.rejects(adapter.fetch(page,{providerId:'saved',providerUrl:config.startUrl},async()=>{},'unused.mp4'),{code:'MUSE_ACCOUNT_WARNING'});
  assert.equal(downloads,0);
});

test('Muse waits past a stable text acknowledgement for a late video without resending',async t=>{
 let now=0,sent=false,clicks=0;t.mock.method(Date,'now',()=>now);
 const page={locator:selector=>({evaluateAll:async()=>selector==='[data-message-id][data-message-role="assistant"]'?(sent?[{id:'reply',text:'I am preparing your video.'}]:[]):selector.includes('role="user"')?[]:sent&&now>=22000?['late-video']:[]}),getByRole:(_r,{name})=>({click:async()=>{assert.equal(name,'Send');sent=true;clicks++;},isVisible:async()=>false}),waitForTimeout:async()=>{now+=1000;},url:()=>config.startUrl};
 const states=[];assert.equal(await new MuseAdapter(config).submit(page,async s=>states.push(s)),'late-video');assert.equal(clicks,1);assert.ok(now>=22000);assert.deepEqual(states,['submitting','submitted']);
});
test('A neutral text-only reply times out with its receipt and does not retry forever',async t=>{
 let now=0,sent=false,clicks=0;t.mock.method(Date,'now',()=>now);const timeoutSeconds=25;
 const page={locator:selector=>({evaluateAll:async()=>selector==='[data-message-id][data-message-role="assistant"]'&&sent?[{id:'reply',text:'Preparing your video.'}]:[]}),getByRole:()=>({click:async()=>{sent=true;clicks++;},isVisible:async()=>false}),waitForTimeout:async()=>{now+=1000;},url:()=>config.startUrl};
 await assert.rejects(new MuseAdapter({...config,timeoutSeconds}).submit(page,async()=>{}),e=>e.code==='MUSE_NO_MEDIA'&&e.providerResponse==='Preparing your video.');assert.equal(clicks,1);assert.equal(now,25000);
});

test('Video receipt detection excludes document preview images and preserves image mode',async t=>{
 const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const page=await browser.newPage();await page.setContent(`<textarea aria-label="Message"></textarea><div data-message-id="doc" data-message-role="assistant" data-message-has-presentation="true"><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"><span>Prompt pack</span><span>MD</span></div><div data-message-id="clip" data-message-role="assistant" data-message-has-presentation="true"><video></video></div>`);
 const adapter=new MuseAdapter(config);
 assert.deepEqual(await adapter.mediaCards(page,'video').evaluateAll(es=>es.map(e=>e.dataset.messageId)),['clip']);
 assert.deepEqual(await adapter.mediaCards(page,'image').evaluateAll(es=>es.map(e=>e.dataset.messageId)),['doc']);
 adapter.mediaType='video';assert.equal(await adapter.mediaCards(page).count(),1);
 let now=0;t.mock.method(Date,'now',()=>now);
 let downloads=0;const states=[];const wrapped={url:()=>config.startUrl,locator:page.locator.bind(page),getByRole:page.getByRole.bind(page),waitForTimeout:async()=>{now+=1000;},waitForEvent:async()=>{downloads++;throw Error('No download for document');}};
 await assert.rejects(adapter.fetch(wrapped,{providerId:'doc',providerUrl:config.startUrl,request:{mediaType:'video'}},async state=>states.push(state),'unused.mp4'),error=>error.code==='MUSE_NO_MEDIA'&&error.providerResponse.includes('MD'));
 assert.deepEqual(states,['waiting']);assert.equal(downloads,0);
});

test('A new document thumbnail never becomes a video receipt; settled documents stop without another send',async t=>{
 const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const page=await browser.newPage();await page.setContent('<textarea aria-label="Message"></textarea><button id="send">Send</button>');
 let now=0,sends=0;t.mock.method(Date,'now',()=>now);await page.exposeFunction('sent',()=>sends++);
 await page.evaluate(()=>{document.querySelector('#send').onclick=()=>{window.sent();document.body.insertAdjacentHTML('beforeend','<div data-message-id="user" data-message-role="user">Create video</div><div data-message-id="doc" data-message-role="assistant" data-message-has-presentation="true"><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"><span>Prompt pack</span><span>MD</span></div>');};});
 const wrapped={locator:page.locator.bind(page),getByRole:page.getByRole.bind(page),url:()=>config.startUrl,waitForTimeout:async()=>{now+=1000;}};
 const adapter=new MuseAdapter(config);adapter.mediaType='video';const states=[];
 await assert.rejects(adapter.submit(wrapped,async state=>states.push(state)),e=>e.code==='MUSE_NO_MEDIA'&&e.providerResponse.includes('Prompt pack'));
 assert.equal(sends,1);assert.deepEqual(states,['submitting']);assert.ok(now>=15000&&now<20000);
 adapter.session=async()=>true;wrapped.goto=async()=>{};
 const response=await page.locator('[data-message-id="doc"]').innerText();
 const result=await adapter.inspectResponse(wrapped,{providerUrl:'https://muse.ai/thread/saved',providerResponse:response,request:{mediaType:'video',prompt:'Create video'}});
 assert.equal(result.providerId,null);assert.equal(sends,1);
 // A later real video takes precedence over the document and does not resend.
 await page.evaluate(()=>document.body.insertAdjacentHTML('beforeend','<div data-message-id="clip" data-message-role="assistant" data-message-has-presentation="true"><video></video></div>'));
 const late=await adapter.inspectResponse(wrapped,{providerUrl:'https://muse.ai/thread/saved',providerResponse:response,request:{mediaType:'video',prompt:'Create video'}});
 assert.equal(late.providerId,'clip');assert.equal(sends,1);
});
