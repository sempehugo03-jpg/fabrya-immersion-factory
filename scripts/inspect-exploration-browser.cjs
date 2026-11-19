const { chromium } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright' : 'playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const source = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function inspect(browser, name, config) {
  const context = await browser.newContext({
    ...config, recordVideo: { dir: output, size: config.viewport },
  });
  await context.route(/https?:\/\//, route => route.abort());
  const page = await context.newPage();
  const issues = [];
  page.on('pageerror', error => issues.push(error.message));
  page.on('requestfailed', request => issues.push(request.method() + ' ' + request.url()));
  await page.goto(pathToFileURL(source).href, { waitUntil: "domcontentloaded", timeout: 20000 });
  const cdp = await context.newCDPSession(page);
  const frames = [];
  const now = () => performance.now();
  cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
    frames.push({ data, time: now() });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  const started = now();
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 86 });
  async function state() {
    return page.evaluate(() => ({
      title: document.title,
      scrollY,
      viewport: [innerWidth, innerHeight],
      document: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      headings: [...document.querySelectorAll('h1,h2')].map(el => el.textContent.trim()),
      visibleText: [...document.querySelectorAll('h1,h2,p,button,[role="status"],output')]
        .filter(el => { const rect = el.getBoundingClientRect(); return rect.bottom > 0 && rect.top < innerHeight && rect.width })
        .map(el => el.textContent.trim()).slice(0, 15),
      controls: [...document.querySelectorAll('button,input,select,canvas,svg,video,a[href]')].map(el => ({
        tag: el.tagName.toLowerCase(), label: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 60),
        value: el.value, active: el.getAttribute('aria-pressed'),
      })).slice(0, 25),
    }));
  }
  const opening = await state();
  const screenshot = path.join(output, name + '-ouverture.png');
  await page.screenshot({ path: screenshot });
  await pause(650);
  const steps = {};
  if (name === 'mobile') {
    const x = Math.floor(config.viewport.width * .73);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: 650 }] });
    for (let y = 620; y >= 280; y -= 20) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
      await pause(35);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await pause(400);
    steps.apres_glissement_tactile = await state();
  } else {
    await page.mouse.move(config.viewport.width * .70, config.viewport.height * .53);
    for (let i = 0; i < 7; i++) {
      await page.mouse.wheel(0, 110);
      await pause(130);
    }
    steps.apres_molette_bas = await state();
    await pause(550);
    for (let i = 0; i < 7; i++) {
      await page.mouse.wheel(0, -110);
      await pause(130);
    }
    steps.apres_molette_haut = await state();
  }
  const buttons = page.locator('button:visible');
  const clickCount = Math.min(await buttons.count(), 6);
  for (let i = 0; i < clickCount; i++) {
    const button = buttons.nth(i);
    let label;
    try {
      label = (await button.textContent({ timeout: 1500 })).trim();
      await button.click({ timeout: 1800 });
      await pause(530);
      steps['bouton ' + i + ' ' + label] = await state();
    } catch (error) {
      issues.push('Interaction ' + (label || i) + ': ' + error.message.split('\n')[0]);
    }
  }
  const selects = page.locator('select:visible');
  for (let i = 0, count = Math.min(await selects.count(), 5); i < count; i++) {
    try {
      const select = selects.nth(i);
      const currentValue = await select.inputValue();
      const options = await select.locator('option:not([disabled])').evaluateAll(items => items.map(option => option.value));
      const alternate = options.find(value => value !== currentValue);
      if (alternate !== undefined) {
        await select.selectOption(alternate);
        await pause(480);
        steps['choix ' + i + ' ' + alternate] = await state();
      }
    } catch (error) {
      issues.push('Select ' + i + ': ' + error.message.split('\n')[0]);
    }
  }
  const range = page.locator('input[type=range]:visible').first();
  if (await range.count()) {
    await range.focus();
    await page.keyboard.press('End');
    await pause(500);
    steps.clavier_curseur_fin = await state();
  }
  await pause(750);
  const duration = (now() - started) / 1000;
  await cdp.send('Page.stopScreencast');
  const frameDir = path.join(output, name + '-frames');
  await fs.mkdir(frameDir, { recursive: true });
  const manifest = [];
  for (let i = 0; i < frames.length; i++) {
    const fp = i.toString().padStart(5, '0') + '.jpg';
    await fs.writeFile(path.join(frameDir, fp), Buffer.from(frames[i].data, 'base64'));
    manifest.push('file ' + fp);
    manifest.push('duration ' + Math.max(.017, ((frames[i + 1]?.time || started + (duration * 1000)) - frames[i].time) / 1000).toFixed(3));
    if (i === frames.length - 1) manifest.push('file ' + fp);
  }
  await fs.writeFile(path.join(frameDir, 'concat.txt'), manifest.join('\n') + '\n');
  await page.screenshot({ path: path.join(output, name + '-apres.png') });
  const video = page.video();
  await context.close();
  await fs.rename(await video.path(), path.join(output, name + '.webm'));
  return { issues, opening, steps, frames: frames.length, duration };
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.FABRYA_BROWSER_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const desktop = await inspect(browser, 'ordinateur', { viewport: { width: 1440, height: 900 } });
    const mobile = await inspect(browser, 'mobile', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    await fs.writeFile(path.join(output, 'observations.json'), JSON.stringify({ desktop, mobile }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
