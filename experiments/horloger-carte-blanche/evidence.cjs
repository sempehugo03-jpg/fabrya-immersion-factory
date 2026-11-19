const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(process.argv[2]);
const folder = path.resolve(process.argv[3]);
const plan = process.argv[4] ? require(path.resolve(process.argv[4])) : {};
const origin = 'http://fabrya-fixture.test';
const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.glb': 'model/gltf-binary',
};

async function state(page) {
  return page.evaluate(() => {
    const visible = node => !!node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden';
    return {
      title: document.title,
      scrollY: Math.round(window.scrollY),
      maxScroll: document.documentElement.scrollHeight - window.innerHeight,
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      headings: Array.from(document.querySelectorAll('h1,h2,h3')).filter(visible)
        .map(element => element.textContent.trim()),
      interactions: Array.from(document.querySelectorAll('button,a,input,summary,[role="button"]'))
        .filter(visible).map(element => ({
          tag: element.tagName, label: (element.getAttribute('aria-label') || element.textContent || '').trim(),
          href: element.getAttribute('href'), type: element.getAttribute('type'), id: element.id,
        })).slice(0, 35),
      visuals: Array.from(document.querySelectorAll('canvas,svg,img,video')).filter(visible)
        .map(element => ({
          tag: element.tagName, width: Math.round(element.getBoundingClientRect().width),
          height: Math.round(element.getBoundingClientRect().height),
          id: element.id,
        })).slice(0, 20),
    };
  });
}

async function swipe(cdp, x, startY, endY) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x, y: startY, id: 0 }],
  });
  for (let step = 1; step <= 22; step++) {
    const y = Math.round(startY + (endY - startY) * step / 22);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x, y, id: 0 }],
    });
    await new Promise(resolve => setTimeout(resolve, 28));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function interaction(page, item) {
  const target = page.locator(item.selector).first();
  const before = await state(page);
  if (item.fill !== undefined) await target.fill(String(item.fill));
  else if (item.press) await target.press(item.press);
  else if (item.tap) await target.tap();
  else await target.click();
  await page.waitForTimeout(550);
  const after = await state(page);
  if (item.expectedText) {
    assert.equal(await page.getByText(item.expectedText, { exact: false }).first().isVisible(), true);
  }
  if (item.expectedSelector) assert.equal(await page.locator(item.expectedSelector).first().isVisible(), true);
  if (item.expectedScroll) assert.notEqual(before.scrollY, after.scrollY);
  return { name: item.name, before, after, checked: !!(item.expectedText || item.expectedSelector || item.expectedScroll) };
}

async function inspect(browser, mode, config) {
  const isMobile = mode === 'toucher';
  const viewport = isMobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };
  const recordVideo = config.record ? { dir: folder, size: viewport } : undefined;
  const browserContext = await browser.newContext({
    viewport, deviceScaleFactor: 1, isMobile, hasTouch: isMobile, recordVideo,
    reducedMotion: mode === 'reduit' ? 'reduce' : 'no-preference',
  });
  const errors = [], broken = [], blockedRequests = [], actions = [];
  await browserContext.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      blockedRequests.push(url.origin);
      await route.abort();
      return;
    }
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(root, rel);
    if (!file.startsWith(root + path.sep)) return route.fulfill({ status: 403 });
    try {
      const body = await fs.readFile(file);
      await route.fulfill({ status: 200, body, contentType: contentTypes[path.extname(file)] });
    } catch {
      if (rel !== 'favicon.ico') broken.push(rel);
      await route.fulfill({ status: 404 });
    }
  });
  const page = await browserContext.newPage();
  const video = page.video();
  page.setDefaultTimeout(6000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  const opening = await state(page);
  await page.screenshot({ path: path.join(folder, mode === 'molette' ? 'Ouverture.png' : mode + '-ouverture.png') });
  let advanced, paused, reverse;
  if (mode === 'molette') {
    await page.mouse.move(760, 430);
    for (let step = 0; step < 5; step++) {
      await page.mouse.wheel(0, 290);
      await page.waitForTimeout(420);
    }
    advanced = await state(page);
    await page.screenshot({ path: path.join(folder, 'molette-progression.png') });
    await page.waitForTimeout(800);
    paused = await state(page);
    for (let step = 0; step < 3; step++) {
      await page.mouse.wheel(0, -250);
      await page.waitForTimeout(410);
    }
    reverse = await state(page);
  }
  if (isMobile) {
    const cdp = await browserContext.newCDPSession(page);
    for (let step = 0; step < 3; step++) {
      await swipe(cdp, 260, 715, 245);
      await page.waitForTimeout(400);
    }
    advanced = await state(page);
    await page.screenshot({ path: path.join(folder, 'toucher-progression.png') });
    await page.waitForTimeout(800);
    paused = await state(page);
    await swipe(cdp, 260, 250, 700);
    await page.waitForTimeout(650);
    reverse = await state(page);
  }
  for (const item of config.interactions || []) {
    try {
      actions.push(await interaction(page, item));
    } catch (error) {
      actions.push({ name: item.name, error: String(error).slice(0, 400) });
    }
  }
  await page.waitForTimeout(700);
  await browserContext.close();
  if (video) await video.saveAs(path.join(folder, mode + '.webm'));
  return { opening, advanced, paused, reverse, errors, broken, blockedRequests, actions };
}

(async () => {
  await fs.mkdir(folder, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.FABRYA_CHROMIUM || '/usr/bin/chromium', headless: true,
    args: ['--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
  });
  const outputs = {};
  try {
    for (const mode of ['molette', 'toucher', 'reduit']) {
      outputs[mode] = await inspect(browser, mode, plan[mode] || {});
    }
  } finally {
    await browser.close();
  }
  await fs.writeFile(path.join(folder, 'browser-observations.json'), JSON.stringify(outputs, null, 2));
  console.log(Object.fromEntries(Object.entries(outputs).map(([mode, result]) => [mode, {
    opening: result.opening.title,
    scroll: [result.opening, result.advanced, result.paused, result.reverse].map(sample => sample?.scrollY),
    errors: result.errors, broken: result.broken, actions: result.actions.map(action => [action.name, action.error || action.checked]),
  }])));
})().catch(error => { console.error(error); process.exitCode = 1; });
