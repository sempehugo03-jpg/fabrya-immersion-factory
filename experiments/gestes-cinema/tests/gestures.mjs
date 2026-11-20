import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const playwright = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright'))
  : require('playwright');
const [outputArg = 'preuves', url = 'https://resonance.local/', webRoot] = process.argv.slice(2);
const output = path.resolve(outputArg);
const root = webRoot ? path.resolve(webRoot) : fileURLToPath(new URL('../web/', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'track.json'), 'utf8'));
const types = { '.html':'text/html', '.json':'application/json', '.js':'text/javascript',
  '.css':'text/css', '.webp':'image/webp', '.bin':'application/octet-stream' };
await mkdir(output, { recursive:true });

async function setup(browser, profile, viewport) {
  const mobile = profile === 'mobile';
  const context = await browser.newContext({
    viewport, deviceScaleFactor:1, isMobile:mobile, hasTouch:mobile,
    reducedMotion:profile === 'reduced' ? 'reduce' : 'no-preference',
  });
  if (url === 'https://resonance.local/') {
    await context.route(url+'**', async route => {
      const resource = new URL(route.request().url()).pathname.slice(1) || 'index.html';
      if (!/^(index\.html|style\.css|player\.js|frame-loader\.js|track\.json|media\/(desktop|mobile)(-\d{3})?\.(webp|bin))$/.test(resource)) {
        await route.fulfill({status:404});
        return;
      }
      await route.fulfill({body:await readFile(path.join(root,resource)),contentType:types[path.extname(resource)]});
    });
  }
  await context.addInitScript(() => {
    const log = window.filmTest = { targets:[], presentations:[], inputs:[], samples:[], phase:'DÉPART' };
    let input;
    function updateBanner() {
      const ui = document.querySelector('#test-banner');
      const stage = document.querySelector('#screen');
      if (!ui || !stage) return;
      const shown = stage.dataset.presented;
      const target = stage.dataset.target;
      const gesture = input ? ' · ' + input.label : '';
      ui.textContent = log.phase + ' · vue ' + shown + (target!==shown ? ' → ' + target : '') + gesture;
    }
    window.setFilmTestPhase = phase => { log.phase = phase; input = null; updateBanner(); };
    function register(event, label) {
      if (!event.isTrusted) return;
      input = { when: event.timeStamp, label };
      log.inputs.push({ phase:log.phase, type:event.type, ...input });
      updateBanner();
    }
    addEventListener('wheel', event => register(event, event.deltaY > 0 ? 'Molette ↓' : 'Molette ↑'), {passive:true,capture:true});
    let previousY;
    addEventListener('touchstart', event => {
      previousY = event.touches[0]?.clientY;
      register(event,'Contact');
    }, {passive:true,capture:true});
    addEventListener('touchmove', event => {
      const y = event.touches[0]?.clientY;
      if (y !== previousY && y !== undefined) register(event,y < previousY ? 'Doigt ↑' : 'Doigt ↓');
      previousY = y;
    }, {passive:true,capture:true});
    addEventListener('touchend', event => register(event,'Relâché'), {passive:true,capture:true});
    document.addEventListener('DOMContentLoaded', () => {
      const stage = document.querySelector('#screen');
      const banner = document.createElement('aside');
      banner.id = 'test-banner';
      banner.setAttribute('aria-hidden','true');
      banner.style.cssText = 'position:fixed;bottom:13px;left:12px;right:12px;z-index:12;pointer-events:none;color:#f7e7cc;font:600 13px/1.5 system-ui;text-align:center;padding:8px;background:#201912ed;border:1px solid #a88762';
      document.body.append(banner);
      stage.addEventListener('film:target', ({detail}) => {
        log.targets.push({ ...detail, phase:log.phase, input });
        updateBanner();
      });
      stage.addEventListener('film:presented', ({detail}) => {
        log.presentations.push({ ...detail, phase:log.phase });
        updateBanner();
      });
      let lastTarget;
      let lastPresentation;
      function sample(moment) {
        const target = log.targets.at(-1);
        const presented = Number(stage.dataset.presented);
        if (target?.phase === log.phase && moment - target.requested <= 300
            && Number.isFinite(presented) && target.input) {
          log.samples.push({
            phase: log.phase, target: target.index, presented, moment,
            repeatedWhileBehind: lastPresentation === presented && target.index !== presented
              && (target.index !== lastTarget || log.samples.at(-1)?.repeatedWhileBehind === true),
          });
          lastTarget = target.index;
          lastPresentation = presented;
        } else {
          lastTarget = lastPresentation = undefined;
        }
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
      updateBanner();
    });
  });
  const page = await context.newPage();
  const started = performance.now();
  await page.goto(url);
  await page.locator('canvas:visible').waitFor();
  const readyMs = Math.round(performance.now() - started);
  const bounds = await page.locator('canvas').evaluate(canvas => ({
    left: canvas.getBoundingClientRect().left,
    right: canvas.getBoundingClientRect().right,
    viewport: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(bounds.left >= -1 && bounds.right <= bounds.viewport + 1,
    `${profile}: canvas exceeds the visible horizontal bounds`);
  assert.ok(bounds.pageWidth <= bounds.viewport + 1, `${profile}: page has horizontal overflow`);
  return {context,page,cdp:await context.newCDPSession(page),readyMs};
}

async function phase(page,label) {
  await page.evaluate(value => window.setFilmTestPhase(value),label);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));

async function stable(page) {
  await page.waitForFunction(() => {
    const e = document.querySelector('#screen');
    return e.dataset.target === e.dataset.presented;
  }, null, {timeout:6000,polling:30});
  return Number(await page.locator('#screen').getAttribute('data-presented'));
}
async function waitRelative(page, old, relation) {
  await page.waitForFunction(({old,relation}) => {
    const index = Number(document.querySelector('#screen').dataset.presented);
    return relation==='greater' ? index>old : index<old;
  }, {old,relation}, {timeout:6000,polling:30});
  await sleep(250);
  return stable(page);
}
async function pixelHash(page) {
  const pixels = await page.locator('canvas').evaluate(canvas => canvas.toDataURL());
  return createHash('sha256').update(pixels).digest('hex');
}

async function swipes(cdp, amount, repeat=1, delay=21) {
  for (let i=0;i<repeat;i++) {
    const base = amount > 0 ? 522 : 255;
    const point = y => ({x:194,y,id:0});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(base)]});
    for (let step=1;step<=8;step++) {
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(base-amount*step/8)]});
      await sleep(delay);
    }
    // Pause with the finger down to control Chromium's inertia consistently.
    await sleep(120);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
}

async function startCapture(cdp,dir) {
  await mkdir(dir,{recursive:true});
  const frames=[];
  cdp.on('Page.screencastFrame',event=>{
    frames.push({ bytes:Buffer.from(event.data,'base64'), time:event.metadata.timestamp });
    void cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(()=>{});
  });
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:86,everyNthFrame:1});
  return async () => {
    await cdp.send('Page.stopScreencast');
    assert(frames.length>12);
    const list=['ffconcat version 1.0'];
    for (let i=0;i<frames.length;i++) {
      const file='frame-'+String(i).padStart(4,'0')+'.jpg';
      await writeFile(path.join(dir,file),frames[i].bytes);
      const next=frames[i+1]?.time;
      const duration=i+1<frames.length ? Math.max(.01,next-frames[i].time) : 1;
      list.push("file '"+file+"'",'duration '+duration.toFixed(5));
      if(i+1===frames.length)list.push("file '"+file+"'");
    }
    await writeFile(path.join(dir,'captures.ffconcat'),list.join('\n')+'\n');
    return frames.length;
  };
}

function percentile(values,p) {
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted.length ? +sorted[Math.ceil(p*sorted.length)-1].toFixed(1) : null;
}

function summarize(log) {
  const key=e=>e.index+':'+e.requested;
  const targets=log.targets.filter(e=>e.phase!=='DÉPART' && e.input && e.requested-e.input.when<=300);
  const done=new Map(log.presentations.map(e=>[key(e),e]));
  const successes=targets.filter(e=>done.has(key(e)));
  const latencies=successes.map(e=>done.get(key(e)).moment-e.input.when);
  const lookups=successes.map(e=>done.get(key(e)).moment-e.requested);
  const gaps=targets.reduce((total,e,i)=>total+(i && e.phase===targets[i-1].phase ? Math.max(0,Math.abs(e.index-targets[i-1].index)-1):0),0);
  const gesturePhases = new Set(targets.map(event => event.phase));
  const byPhase = Object.fromEntries([...gesturePhases].map(phase => {
    const samples = log.samples.filter(sample => sample.phase === phase);
    const deltas = samples.slice(1).map((sample, index) => Math.abs(sample.presented - samples[index].presented));
    const finalTarget = targets.findLast(event => event.phase === phase);
    const finalDraw = done.get(key(finalTarget));
    const finalGesture = log.inputs.findLast(event => event.phase === phase);
    return [phase, {
      sampledRefreshes: samples.length,
      repeatedWhileBehind: samples.filter(sample => sample.repeatedWhileBehind).length,
      targetErrorP95Frames: percentile(samples.map(sample => Math.abs(sample.target - sample.presented)), .95),
      largestPresentedJumpFrames: percentile(deltas, 1),
      lastGestureToFinalDrawMs: finalDraw && finalGesture
        ? Math.max(0, +(finalDraw.moment - finalGesture.when).toFixed(1)) : null,
    }];
  }));
  return {
    byPhase,
    trustedGestures:log.inputs.length,
    requestedWithRecentInput:targets.length,
    drawnForThoseRequests:successes.length,
    supersededBeforeDraw:targets.length-successes.length,
    indicesSkippedBetweenTargets:gaps,
    gestureToDrawMs:{median:percentile(latencies,.5),p95:percentile(latencies,.95),peak:percentile(latencies,1)},
    indexToDrawMs:{median:percentile(lookups,.5),p95:percentile(lookups,.95),peak:percentile(lookups,1)},
  };
}

async function walkthrough(browser, name, viewport) {
  const {page,cdp,readyMs}=await setup(browser,name,viewport);
  const mobile=name==='mobile';
  const wheel=async (delta,count=1,timeout=25)=>{
    await page.mouse.move(viewport.width/2,viewport.height/2);
    for(let i=0;i<count;i++){await page.mouse.wheel(0,delta);await sleep(timeout);}
  };
  const move=(sign,length,type=0) => mobile
    ? swipes(cdp,sign*length,type||1)
    : wheel(sign*length,type||1);
  const hash=await pixelHash(page);
  const finish=await startCapture(cdp,path.join(output,'raw-'+name));
  const states=[0];
  await sleep(800);
  await phase(page,mobile?'AVANCER AU TOUCHER':'AVANCER À LA MOLETTE');
  await move(1,mobile?230:38,mobile?2:15);
  states.push(await waitRelative(page,0,'greater'));
  await phase(page,'ARRÊT SUR LE PLAN');
  const pause=await pixelHash(page);
  await sleep(1450);
  assert.equal(await pixelHash(page),pause);
  assert.equal(await stable(page),states.at(-1));

  await phase(page,mobile?'REVENIR AU TOUCHER':'REVENIR À LA MOLETTE');
  await move(-1,mobile?175:43,mobile?1:5);
  states.push(await waitRelative(page,states.at(-1),'less'));
  await phase(page,'DEUXIÈME ARRÊT');
  await sleep(1300);
  assert.equal(await stable(page),states.at(-1));

  await phase(page,'INVERSIONS RAPIDES');
  if (mobile) {
    await swipes(cdp,185,1,10);
    await swipes(cdp,-150,1,10);
  } else {
    await wheel(115,4,14);
    await wheel(-130,3,14);
    await wheel(94,4,14);
  }
  await sleep(450);
  const reversal=await stable(page);
  await phase(page,'AVANCER VERS LA FICHE');
  const button = page.locator('.hotspot');
  if (manifest.hotspots) {
    // Scroll gestures have already been exercised. Use the accessible control to target any cue.
    const selected = manifest.hotspots[0];
    await seek(page, Math.floor((selected.start + selected.end) / 2));
  } else if (mobile) await swipes(cdp,250,4,17);
  else await wheel(150,5,19);
  await button.waitFor();
  const anchor=await stable(page);
  states.push(anchor);
  await phase(page,'OUVRIR LA FICHE');
  await (mobile ? button.tap() : button.click());
  await page.getByRole('dialog').waitFor();
  if (!mobile) await wheel(70, 3);
  await sleep(1200);
  assert.equal(await stable(page),anchor);
  await closeDetail(page, mobile);
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal(await stable(page),anchor);
  await page.waitForFunction(() => document.activeElement === document.querySelector('.hotspot'));
  if (manifest.hotspots) await verifyActions(page, mobile);

  await phase(page,'RETOUR À LA PREMIÈRE IMAGE');
  if(mobile) await swipes(cdp,-250,9,12);
  else await wheel(-270,12,16);
  await page.waitForFunction(() => document.querySelector('#screen').dataset.presented==='0',null,{timeout:7000,polling:30});
  await sleep(900);
  assert.equal(await stable(page),0);
  const identical=await pixelHash(page)===hash;
  assert(identical);
  states.push(0);
  const captured=await finish();
  const log=await page.evaluate(()=>window.filmTest);
  assert(log.inputs.some(e=>e.type===(mobile?'touchmove':'wheel')));
  return {viewport,readyMs,states,rapidReversalSettled:reversal,identicalAtStartAndReturn:identical,capturedFrames:captured,metrics:summarize(log),log};
}

async function closeDetail(page, mobile) {
  await page.evaluate(() => {
    window.filmResumed = new Promise(resolve => document.querySelector('#screen')
      .addEventListener('film:resumed', resolve, { once:true }));
  });
  const close = page.getByRole('button', {name:'Fermer la fiche'});
  await (mobile ? close.tap() : close.click());
  await page.evaluate(() => window.filmResumed.then(() => true));
}

async function seek(page, frame) {
  await page.locator('#progress').evaluate((input, index) => {
    input.value = index;
    input.dispatchEvent(new Event('input', { bubbles:true }));
  }, frame);
  await page.waitForFunction(index => {
    const screen = document.querySelector('#screen');
    return screen.dataset.target === String(index) && screen.dataset.presented === String(index);
  }, frame, { timeout:5000 }).catch(async original => {
    const state = await page.evaluate(() => ({
      target: document.querySelector('#screen').dataset.target,
      presented: document.querySelector('#screen').dataset.presented,
      dialog: document.querySelector('dialog').open,
      scroll: scrollY,
      last: window.filmTest.targets.slice(-10),
    }));
    throw new Error(`Seek to ${frame} failed: ${JSON.stringify(state)}`, {cause:original});
  });
}

async function verifyActions(page, mobile) {
  const dialog = page.getByRole('dialog');
  const button = page.locator('.hotspot');
  const click = el => mobile ? el.tap() : el.click();
  async function verifyDetail(action) {
    assert.equal(await dialog.getByRole('heading').textContent(), action.heading);
    if (action.href) assert.equal(await dialog.getByRole('link').getAttribute('href'), action.href);
    else assert.equal(await dialog.getByRole('link').count(), 0);
  }
  for (const point of manifest.hotspots) {
    const frame = Math.floor((point.start + point.end) / 2);
    await seek(page, frame);
    assert.equal(await button.getAttribute('aria-label'), point.action.label);
    await click(button);
    await verifyDetail(point.action);
    await closeDetail(page, mobile);
    await page.waitForFunction(() => document.activeElement === document.querySelector('.hotspot'));
    assert.equal(await stable(page), frame);
  }
  const actions = page.getByRole('navigation', {name:'Services'});
  for (const action of manifest.actions ?? manifest.hotspots.map(point => point.action)) {
    if (action.href) {
      const link = actions.getByRole('link', {name:action.label, exact:true});
      assert.equal(await link.getAttribute('href'), action.href);
    } else {
      const shortcut = actions.getByRole('button', {name:action.label, exact:true});
      const before = await stable(page);
      await click(shortcut);
      await verifyDetail(action);
      await closeDetail(page, mobile);
      await page.waitForFunction(label => document.activeElement?.textContent === label, action.label);
      assert.equal(await stable(page), before);
      assert(await shortcut.evaluate(el => el === document.activeElement));
    }
  }
}

async function verifyReduced(browser) {
  const {page}=await setup(browser,'reduced',{width:1024,height:760});
  await page.mouse.move(490,400);
  await page.mouse.wheel(0,550);
  await sleep(250);
  assert.equal(await stable(page),0);
  await page.getByRole('slider',{name:'Position'}).press('End');
  await waitRelative(page,0,'greater');
  assert.equal(await stable(page),manifest.frames - 1);
  await page.getByRole('slider',{name:'Position'}).press('Home');
  await waitRelative(page,manifest.frames - 1,'less');
  assert.equal(await stable(page),0);
  return {wheel:0,keyboard:[0,manifest.frames - 1,0]};
}

const launch=()=>playwright.chromium.launch({
  ...(process.env.CHROMIUM_BIN ? {executablePath:process.env.CHROMIUM_BIN} : {}),
  headless:true,
  args:['--no-sandbox','--no-zygote','--single-process','--disable-gpu','--disable-dev-shm-usage'],
});
const result={};
for(const [name,viewport] of [['desktop',{width:1152,height:768}],['mobile',{width:390,height:844}],['reduced',null]]){
  const browser=await launch();
  try {
    console.log('Testing',name,browser.version());
    result[name]=viewport ? await walkthrough(browser,name,viewport) : await verifyReduced(browser);
    await writeFile(path.join(output,'mesures-brutes.json'),JSON.stringify(result,null,2)+'\n');
    const {log,...summary}=result[name];
    console.log(name,summary);
  }finally{await browser.close();}
}
