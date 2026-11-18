import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fixtureUrl, launch, localFixture } from './browser.mjs';

const [target = 'local', outputDirectory = '/tmp/serein-capture'] = process.argv.slice(2);
const url = target === 'local' ? fixtureUrl : target;
const output = path.resolve(outputDirectory);
await mkdir(output, { recursive: true });
const browser = await launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await localFixture(context, url);
const page = await context.newPage();
const session = await context.newCDPSession(page);
const frames = [];
let cues;

function pause(ms) { return page.waitForTimeout(ms); }

async function scrollTo(destination, duration) {
  await page.evaluate(({ destination, duration }) => new Promise(resolve => {
    const from = window.scrollY;
    let start;
    function move(time) {
      start ??= time;
      const progress = Math.min(1, (time - start) / duration);
      const blend = progress * progress * (3 - 2 * progress);
      window.scrollTo(0, from + (destination - from) * blend);
      if (progress < 1) requestAnimationFrame(move);
      else resolve();
    }
    requestAnimationFrame(move);
  }), { destination, duration });
}

try {
  await page.goto(url);
  await page.locator('.poster').evaluate(img => img.decode());
  await page.waitForFunction(() => document.querySelector('canvas').dataset.frame === '0');
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    window.captureCues = {};
    const observer = new MutationObserver(() => {
      for (const index of [33, 56, 95]) {
        if (Number(canvas.dataset.frame) >= index && !window.captureCues[index]) {
          window.captureCues[index] = (performance.timeOrigin + performance.now()) / 1000;
        }
      }
      if (window.captureCues[95]) observer.disconnect();
    });
    observer.observe(canvas, { attributes: true, attributeFilter: ['data-frame'] });
  });
  session.on('Page.screencastFrame', event => {
    const time = event.metadata.timestamp;
    if (time !== undefined) frames.push({ image: event.data, time });
    void session.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
  });
  await session.send('Page.startScreencast', { format: 'jpeg', quality: 87, maxWidth: 390, maxHeight: 844, everyNthFrame: 1 });

  const travel = await page.evaluate(() => document.querySelector('.journey').offsetHeight - innerHeight);
  await pause(1100);
  await scrollTo(travel, 6500);
  await pause(850);
  await scrollTo(travel * .4, 2600);
  await pause(650);
  await scrollTo(travel, 2300);
  await pause(650);
  await scrollTo(travel + 770, 2200);
  await pause(1100);
  await page.locator('header [data-book]').tap();
  const dialog = page.getByRole('dialog');
  await pause(650);
  await dialog.locator('select').selectOption('huile');
  await pause(650);
  await dialog.getByRole('button', { name: 'Continuer' }).tap();
  await pause(1050);
  await dialog.getByRole('button', { name: 'Voir le récapitulatif' }).tap();
  await pause(1400);
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).tap();
  await pause(950);
  const extras = await page.evaluate(() => ({
    treatments: document.querySelector('#prestations').offsetTop - 65,
    questions: document.querySelector('#questions').offsetTop - 65,
  }));
  await scrollTo(extras.treatments, 1450);
  await page.locator('.service').nth(1).locator('summary').tap();
  await pause(1200);
  await scrollTo(extras.questions, 2200);
  await page.locator('.faq summary').nth(1).tap();
  await pause(1500);
  await session.send('Page.stopScreencast');
  cues = await page.evaluate(() => window.captureCues);
} finally {
  await browser.close();
}

if (frames.length < 60) throw new Error(`Seulement ${frames.length} images Chromium enregistrées`);
const list = ['ffconcat version 1.0'];
for (let i = 0; i < frames.length; i++) {
  const name = `capture-${String(i).padStart(4,'0')}.jpg`;
  await writeFile(path.join(output, name), Buffer.from(frames[i].image, 'base64'));
  list.push(`file '${name}'`);
  const duration = i + 1 < frames.length ? Math.max(.001, frames[i + 1].time - frames[i].time) : 1;
  list.push(`duration ${duration.toFixed(6)}`);
  if (i + 1 === frames.length) list.push(`file '${name}'`);
}
await writeFile(path.join(output, 'capture.ffconcat'), list.join('\n') + '\n');
const relativeCues = Object.fromEntries(Object.entries(cues).map(([frame, time]) => [
  frame, Number((time - frames[0].time).toFixed(3))
]));
await writeFile(path.join(output, 'cues.json'), JSON.stringify(relativeCues, null, 2) + '\n');
console.log(`${frames.length} images Chromium horodatées`, relativeCues);
