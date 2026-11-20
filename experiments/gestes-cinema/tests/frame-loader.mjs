import assert from 'node:assert/strict';
import test from 'node:test';
import { createFrameLoader } from '../web/frame-loader.js';

test('a far jump cancels old packs, waits for the exact frame, and can reverse', async t => {
  const requests = [];
  const presented = [];
  const errors = [];
  const closed = [];
  t.mock.method(globalThis, 'fetch', (url, { signal }) => new Promise((resolve, reject) => {
    const request = {
      url, signal,
      complete() {
        const first = Number(url) * 24;
        resolve({ok: true, blob: async () => new Blob([
          Uint8Array.from({length: 24}, (_, i) => first + i),
        ])});
      },
    };
    signal.addEventListener('abort', () => reject(signal.reason), {once: true});
    requests.push(request);
  }));
  globalThis.createImageBitmap = async blob => {
    const index = new Uint8Array(await blob.arrayBuffer())[0];
    return {index, close: () => closed.push(index)};
  };
  t.after(() => { delete globalThis.createImageBitmap; });

  const manifest = {
    framesPerPack: 24,
    packs: Array.from({length: 5}, (_, i) => ({
      url: String(i), offsets: Array.from({length: 25}, (_, offset) => offset),
    })),
  };
  let conserve = false;
  const loader = createFrameLoader(manifest, 120, {
    onFrame(index, image) {
      assert.equal(image.index, index);
      presented.push(index);
    },
    onError: message => errors.push(message),
    isPaused: () => false,
    conserveData: () => conserve,
  });
  const tick = () => new Promise(resolve => setImmediate(resolve));

  loader.seek(0);
  assert.deepEqual(requests.map(request => request.url), ['0', '1']);
  loader.seek(100);
  await tick();
  assert(requests[0].signal.aborted && requests[1].signal.aborted);
  assert.equal(requests.at(-1).url, '4');
  assert.deepEqual(presented, []);
  requests.at(-1).complete();
  await tick();
  assert.deepEqual([...new Set(presented)], [100]);

  conserve = true;
  const firstReverseRequest = requests.length;
  loader.seek(0);
  await tick();
  assert.deepEqual(requests.slice(firstReverseRequest).map(request => request.url), ['0']);
  requests.at(-1).complete();
  await tick();
  assert.deepEqual([...new Set(presented)], [100, 0]);
  assert.deepEqual(errors, []);
  loader.dispose();
  assert(closed.includes(100) && closed.includes(0));
});
