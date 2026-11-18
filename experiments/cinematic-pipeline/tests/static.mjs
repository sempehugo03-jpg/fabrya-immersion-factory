import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
const root = new URL('../web/', import.meta.url);
const data = JSON.parse(await readFile(new URL('track.json', root)));
assert.equal(data.frames, 120);
assert.equal(data.hotspot.length, 120);
assert.equal(data.fps, 24);
for (const p of data.hotspot) {
  assert(p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1);
  assert(Number.isFinite(p.foregroundX));
}
assert(data.hotspot.at(-1).foregroundX - data.hotspot[0].foregroundX < -.6);
for (const [profile, options] of Object.entries(data.profiles)) {
  assert(options.left >= 0 && options.left + options.span <= 1);
  for (let index = 0; index < data.frames; index++) {
    const name = `media/${profile}/${String(index).padStart(3, '0')}.webp`;
    assert((await stat(new URL(name, root))).size > 1000);
  }
  assert((await stat(new URL(`media/${profile}/seek.mp4`, root))).size > 1000);
}
console.log('Manifeste, trajectoire, 240 images WebP et deux fichiers de seek vérifiés.');
