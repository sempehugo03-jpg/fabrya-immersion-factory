import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const { chromium } = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright'))
  : require('playwright');
export const launch = () => chromium.launch({
  executablePath: process.env.CHROMIUM_BIN || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
export const fixtureUrl = 'http://atelier-serein.test/';
const webDir = fileURLToPath(new URL('../web/', import.meta.url));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webp': 'image/webp',
};

export async function localFixture(context, url) {
  if (url !== fixtureUrl) return;
  await context.route(fixtureUrl + '**', async route => {
    const resource = new URL(route.request().url()).pathname.slice(1) || 'index.html';
    if (!/^(index\.html|style\.css|app\.js|frames\/\d{3}\.webp)$/.test(resource)) {
      await route.fulfill({ status: 404, body: 'Ressource inconnue' });
      return;
    }
    const body = await readFile(path.join(webDir, resource));
    await route.fulfill({ body, contentType: types[path.extname(resource)] });
  });
}
