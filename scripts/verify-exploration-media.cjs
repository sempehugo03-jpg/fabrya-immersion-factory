const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');

async function run() {
  const source = path.resolve(process.argv[2]);
  const output = path.resolve(process.argv[3]);
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.FABRYA_BROWSER_PATH,
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
    await page.route(/https?:\/\//, route => route.abort());
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(source).href, { waitUntil: 'domcontentloaded' });
    const protocol = JSON.parse(await page.locator('#fabrya-media-protocol').textContent());
    const defaults = Object.fromEntries(protocol.controls.map(control => [control.key, control.choices[0].value]));
    async function screenshot(values, label) {
      await page.evaluate(values => window.postMessage({ type: 'fabrya:configuration', values }, '*'), values);
      await page.waitForTimeout(180);
      const payload = await page.screenshot({ path: path.join(output, label + '.png'), animations: 'disabled' });
      return createHash('sha256').update(payload).digest('hex');
    }
    const baseline = await screenshot(defaults, 'media-ouverture');
    const repeated = await screenshot(defaults, 'media-reference');
    const actions = [];
    for (const [index, control] of protocol.controls.entries()) {
      for (const [choice, option] of control.choices.slice(1).entries()) {
        const digest = await screenshot({ ...defaults, [control.key]: option.value }, 'media-' + index + '-' + choice);
        actions.push({ control: control.key, value: option.value, digest, differs: digest !== baseline });
      }
    }
    await fs.writeFile(path.join(output, 'media-test.json'), JSON.stringify({
      baseline, stable: baseline === repeated, actions, errors,
    }, null, 2));
  } finally {
    await browser.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
