import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fixtureUrl, launch, localFixture } from './browser.mjs';

const [target = 'local', outputDirectory = 'evidence'] = process.argv.slice(2);
const url = target === 'local' ? fixtureUrl : target;
const output = path.resolve(outputDirectory);
await mkdir(output, { recursive: true });
const browser = await launch();
const results = { browser: browser.version(), measuredOn: 'Chromium local, écran et tactile émulés', delivery: target === 'local' ? 'Ressources locales via fixture Playwright' : url, checks: [], performance: {} };
const register = async (name, check) => {
  await check();
  results.checks.push(name);
};
const canvasFrame = page => page.locator('canvas').getAttribute('data-frame');

async function move(page, proportion) {
  const target = Math.round(proportion * 95);
  await page.evaluate(p => {
    const height = document.querySelector('.journey').offsetHeight - document.querySelector('.stage').offsetHeight;
    window.scrollTo({ top: p * height, behavior: 'instant' });
  }, proportion);
  await page.waitForFunction(frame => document.querySelector('canvas').dataset.frame === String(frame), target);
  return target;
}

async function booking(page, label) {
  const dialog = page.getByRole('dialog');
  await page.locator('header [data-book]').click();
  await dialog.locator('select').selectOption('visage');
  await dialog.getByRole('button', { name: 'Continuer' }).click();
  assert.equal(await dialog.locator('input').isVisible(), true);
  await dialog.locator('input').fill('2099-12-30');
  await dialog.getByRole('button', { name: 'Voir le récapitulatif' }).click();
  const recap = await dialog.locator('output').textContent();
  assert.match(recap, /Rituel du visage/);
  assert.match(recap, /30 décembre 2099/);
  assert.equal(await dialog.getByText('Simulation terminée. Aucune demande envoyée.').isVisible(), true);
  if (label === 'mobile') await page.screenshot({ path: path.join(output, 'mobile-recapitulatif.png') });
  await dialog.getByRole('button', { name: 'Modifier' }).click();
  assert.equal(await dialog.locator('input').inputValue(), '2099-12-30');
  await dialog.getByRole('button', { name: 'Retour' }).click();
  assert.equal(await dialog.locator('select').inputValue(), 'visage');
  await page.keyboard.press('Escape');
  assert.equal(await dialog.isVisible(), false);
  assert.equal(await page.evaluate(() => document.activeElement.matches('header [data-book]')), true);
}

async function measure(page) {
  await page.evaluate(() => {
    window.__metrics = { ticks: [], paints: [] };
    const canvas = document.querySelector('canvas');
    const observer = new MutationObserver(() => {
      window.__metrics.paints.push(Number(canvas.dataset.frame));
    });
    observer.observe(canvas, { attributes: true, attributeFilter: ['data-frame'] });
    const travel = document.querySelector('.journey').offsetHeight - document.querySelector('.stage').offsetHeight;
    let start;
    let previous;
    function update(now) {
      start ??= now;
      if (previous !== undefined) window.__metrics.ticks.push(now - previous);
      previous = now;
      scrollTo(0, Math.min(1, (now - start) / 5600) * travel);
      if (now - start < 5600) requestAnimationFrame(update);
      else setTimeout(() => { observer.disconnect(); window.__metrics.done = true; }, 250);
    }
    requestAnimationFrame(update);
  });
  await page.waitForFunction(() => window.__metrics?.done);
  return page.evaluate(() => {
    const { ticks, paints } = window.__metrics;
    const sorted = [...ticks].sort((a, b) => a - b);
    const media = performance.getEntriesByType('resource').filter(entry => entry.name.endsWith('.webp'));
    const lcpEntry = window.__lcp;
    return {
      scrollDurationMs: Math.round(ticks.reduce((total, tick) => total + tick, 0)),
      animationFrameMedianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(1)),
      animationFrameP95Ms: Number(sorted[Math.floor(sorted.length * .95)].toFixed(1)),
      distinctPaintedFrames: new Set(paints).size,
      totalSourceFrames: 96,
      webpRequests: media.length,
      webpTransferBytes: media.reduce((total, entry) => total + entry.transferSize, 0),
      webpEncodedBytes: media.reduce((total, entry) => total + entry.encodedBodySize, 0),
      lcpMs: lcpEntry ? Math.round(lcpEntry) : null,
    };
  });
}

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  for (const [label, browserContext] of [['desktop', desktop], ['mobile', mobile]]) {
    await localFixture(browserContext, url);
    await browserContext.addInitScript(() => {
      new PerformanceObserver(list => {
        window.__lcp = list.getEntries().at(-1)?.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    });
    const page = await browserContext.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(response.url());
    });
    await page.goto(url);
    await page.locator('.poster').evaluate(img => img.decode());
    await page.screenshot({ path: path.join(output, label + '-ouverture.png') });
    await register(label + ' · aucune largeur débordante', async () => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    });
    await register(label + ' · pause, retour et reprise exacte', async () => {
      await move(page, .64);
      const pixels = await page.locator('canvas').evaluate(canvas => canvas.toDataURL());
      await page.waitForTimeout(350);
      assert.equal(await canvasFrame(page), '61');
      await move(page, .22);
      assert.equal(await canvasFrame(page), '21');
      assert.notEqual(await page.locator('canvas').evaluate(canvas => canvas.toDataURL()), pixels);
      await move(page, .64);
      assert.equal(await canvasFrame(page), '61');
      assert.equal(await page.locator('canvas').evaluate(canvas => canvas.toDataURL()), pixels);
    });
    if (label === 'mobile') {
      for (const [mark, progress] of [['seuil', .35], ['cabine', .59], ['detail', 1]]) {
        await move(page, progress);
        await page.screenshot({ path: path.join(output, 'mobile-' + mark + '.png') });
      }
    }
    await move(page, 0);
    results.performance[label] = await measure(page);
    await register(label + ' · formulaire local, modification et retour de focus', () => booking(page, label));
    await register(label + ' · sections et sélection directe', async () => {
      await page.locator('.service').nth(1).locator('summary').click();
      await page.locator('[data-book="huile"]').click();
      assert.equal(await page.getByRole('dialog').locator('input').isVisible(), true);
      await page.getByRole('dialog').getByRole('button', { name: 'Retour' }).click();
      assert.equal(await page.getByRole('dialog').locator('select').inputValue(), 'huile');
      await page.keyboard.press('Escape');
      await page.locator('.faq summary').nth(1).click();
      assert.equal(await page.locator('.faq details').nth(1).getAttribute('open'), '');
      assert.deepEqual(errors, []);
    });
  }

  await register('Mobile · geste tactile Chromium', async () => {
    const page = await mobile.newPage();
    await page.goto(url);
    const session = await mobile.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 660 }] });
    for (let i = 1; i <= 8; i++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: 660 - i * 49 }] });
      await page.waitForTimeout(20);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(() => scrollY > 100 && Number(document.querySelector('canvas').dataset.frame) > 0);
  });

  await register('Mode mouvement réduit · image fixe et accès aux soins', async () => {
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
    await localFixture(context, url);
    const page = await context.newPage();
    await page.goto(url);
    assert.equal(await page.locator('.journey').evaluate(el => el.offsetHeight === el.querySelector('.stage').offsetHeight), true);
    await page.locator('.stage-link').click();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('canvas').getAttribute('data-ready'), null);
    assert.ok(await page.evaluate(() => scrollY > 0));
    await context.close();
  });
} finally {
  await writeFile(path.join(output, 'playwright.json'), JSON.stringify(results, null, 2) + '\n');
  await browser.close();
}
console.log(JSON.stringify(results, null, 2));
