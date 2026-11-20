// Hélior film player: smooth, direction-agnostic scrubbing of the approved film.
//
// Why this replaces the H.264 group decoder (box-cinema.js) and the per-frame fetcher
// (numbered-cinema.js): both had to fetch or decode on demand while the visitor was already
// scrolling, so a fast or reversed gesture outran them and the image froze, then jumped.
//
// Here every frame is an independent WebP (60 fps, all-intra), shipped in packs of 24 so the
// whole film streams in a few dozen requests. Packs load around the visitor first, then the
// rest in the background. Frames are decoded off the main thread (createImageBitmap) at the
// size actually displayed, ahead of the playhead in the direction of travel. The playhead
// follows the scroll through a critically damped spring and cross-fades between neighbouring
// 60 fps frames, so a wheel notch becomes a glide and a stop lands exactly on its frame.

import { filmPosition } from './motion-timeline.js?v=3';

const SCALE = 2.5; // the timeline speaks in 24 fps film frames, the packs hold 60 fps frames

export function createFilmPlayer(stage, { mobile = false, reducedMotion, timeline = filmPosition } = {}) {
  if (!('createImageBitmap' in globalThis)) return null;
  const viewport = stage.querySelector('.box-cinema-frame');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: false });
  if (!viewport || !context) return null;
  canvas.style.opacity = '0';
  viewport.append(canvas);
  stage.dataset.player = 'film-packs';

  const base = new URL(`./media/film/${mobile ? 'mobile' : 'desktop'}/packs/`, import.meta.url);
  const MAX_BITMAPS = mobile ? 36 : 56;
  const MAX_DECODES = mobile ? 4 : 6;
  const MAX_FETCHES = 3;
  const connection = navigator.connection || {};
  const background = !(connection.saveData || /(^|-)2g|3g/.test(connection.effectiveType || ''));

  let meta = null;
  let last = 0;
  const packs = [];          // ArrayBuffer once loaded
  const fetching = new Set();
  const failed = new Map();  // pack -> retry time
  const bitmaps = new Map(); // frame -> ImageBitmap at the current size
  const decoding = new Set();
  let size = 0;
  let sizeEpoch = 0;

  let x = null; // displayed playhead, 60 fps frames
  let v = 0;    // playhead velocity, frames per second
  let target = 0;
  let lastTime = 0;
  let enabled = true;
  let painted = '';
  let firstPaint = false;
  let disposed = false;
  const stats = { bytes: 0, exact: 0, nearest: 0, maxLag: 0, peakBitmaps: 0, firstFrameMs: null };
  const started = performance.now();

  fetch(new URL('index.json', base)).then(r => {
    if (!r.ok) throw new Error('film index');
    return r.json();
  }).then(json => {
    meta = json;
    last = json.frames - 1;
    fit();
    schedule();
  }).catch(() => { stage.dataset.player = 'film-unavailable'; });

  function fit() {
    if (!meta) return;
    const rect = viewport.getBoundingClientRect();
    const want = Math.max(256, Math.min(meta.size, Math.round(rect.width * Math.min(devicePixelRatio || 1, 2) / 16) * 16));
    if (want === size) return;
    size = want;
    sizeEpoch++;
    canvas.width = canvas.height = size;
    for (const bitmap of bitmaps.values()) bitmap.close();
    bitmaps.clear();
    painted = '';
  }
  addEventListener('resize', () => { fit(); schedule(); });

  // ---------- loading ----------
  function loadPack(index) {
    fetching.add(index);
    fetch(new URL(`pack-${String(index).padStart(2, '0')}.webp`, base)).then(r => {
      if (!r.ok) throw new Error(String(r.status));
      return r.arrayBuffer();
    }).then(buffer => {
      packs[index] = buffer;
      stats.bytes += buffer.byteLength;
      failed.delete(index);
    }).catch(() => {
      failed.set(index, performance.now() + 1500);
    }).finally(() => {
      fetching.delete(index);
      if (!disposed) schedule();
    });
  }

  function packOrder(focus, ahead) {
    const per = meta.perPack;
    const count = meta.packs.length;
    const here = Math.floor(focus / per);
    const toward = Math.floor(Math.max(0, Math.min(last, focus + ahead)) / per);
    const order = [here, toward];
    const step = ahead >= 0 ? 1 : -1;
    for (let d = 1; d < count; d++) order.push(here + step * d, here - step * d);
    return order.filter((p, i) => p >= 0 && p < count && order.indexOf(p) === i);
  }

  function decode(frame) {
    const per = meta.perPack;
    const pack = Math.floor(frame / per);
    const buffer = packs[pack];
    if (!buffer) return;
    const offsets = meta.packs[pack];
    const local = frame - pack * per;
    const blob = new Blob([new Uint8Array(buffer, offsets[local], offsets[local + 1] - offsets[local])], { type: 'image/webp' });
    const epoch = sizeEpoch;
    decoding.add(frame);
    createImageBitmap(blob, { resizeWidth: size, resizeHeight: size, resizeQuality: 'medium' }).then(bitmap => {
      if (disposed || epoch !== sizeEpoch) { bitmap.close(); return; }
      bitmaps.get(frame)?.close();
      bitmaps.set(frame, bitmap);
      stats.peakBitmaps = Math.max(stats.peakBitmaps, bitmaps.size);
    }).catch(() => {}).finally(() => {
      decoding.delete(frame);
      if (!disposed) schedule();
    });
  }

  function schedule() {
    if (!meta || disposed || x === null) return;
    // look ahead along the gesture: up to 0.4 s of travel, never less than a few frames
    const ahead = Math.max(-90, Math.min(90, v * 0.4));
    const now = performance.now();

    for (const pack of packOrder(x, ahead)) {
      if (fetching.size >= MAX_FETCHES) break;
      if (packs[pack] || fetching.has(pack) || (failed.get(pack) || 0) > now) continue;
      const near = Math.abs(pack * meta.perPack - x) < meta.perPack * 3;
      if (!near && !background) continue;
      loadPack(pack);
    }

    // Frames to have ready: the ones the eye will actually land on. At rest or slow speed that is
    // every neighbour; at speed, one frame per display refresh along the predicted trajectory.
    const stride = Math.max(1, Math.round(Math.abs(v) / 60));
    const keep = new Set();
    const base = Math.round(x);
    for (let k = -2; k <= 2; k++) keep.add(base + k);
    for (let k = 1; k <= 24; k++) {
      const p = Math.round((x + Math.sign(ahead || 1) * k * stride) / stride) * stride;
      keep.add(p);
      if (Math.abs(p - x) > Math.abs(ahead) + 6 * stride) break;
    }
    for (let k = 1; k <= 3; k++) keep.add(base - Math.sign(ahead || 1) * k * stride);
    const ordered = [...keep].filter(i => i >= 0 && i <= last)
      .sort((a, b) => Math.abs(a - x) - Math.abs(b - x)).slice(0, MAX_BITMAPS - 6);
    const wanted = new Set(ordered);

    if (bitmaps.size > MAX_BITMAPS - 4) {
      const victims = [...bitmaps.keys()].filter(i => !wanted.has(i))
        .sort((a, b) => Math.abs(b - x) - Math.abs(a - x));
      for (const i of victims) {
        if (bitmaps.size <= MAX_BITMAPS - 4) break;
        bitmaps.get(i).close();
        bitmaps.delete(i);
      }
    }
    for (const frame of ordered) {
      if (decoding.size >= MAX_DECODES) break;
      if (bitmaps.has(frame) || decoding.has(frame)) continue;
      if (!packs[Math.floor(frame / meta.perPack)]) continue;
      decode(frame);
    }
  }

  // ---------- drawing ----------
  function paint() {
    if (!size || x === null) return;
    // the two decoded frames that bracket the playhead (adjacent when ready, sparser at speed)
    let below = -1, above = -1;
    for (const i of bitmaps.keys()) {
      if (i <= x && i > below && x - i <= 12) below = i;
      if (i >= x && (above < 0 || i < above) && i - x <= 12) above = i;
    }
    let key, pose;
    if (below >= 0 && above >= 0 && above !== below) {
      const alpha = Math.round(((x - below) / (above - below)) * 64) / 64;
      key = `${below}>${above}:${alpha}`;
      pose = below + (above - below) * alpha;
      if (key !== painted) {
        context.globalAlpha = 1;
        context.drawImage(bitmaps.get(below), 0, 0, size, size);
        if (alpha) { context.globalAlpha = alpha; context.drawImage(bitmaps.get(above), 0, 0, size, size); context.globalAlpha = 1; }
      }
      if (above - below === 1) stats.exact++; else stats.nearest++;
    } else {
      let nearest = below >= 0 ? below : above;
      if (nearest < 0) {
        let distance = Infinity;
        for (const i of bitmaps.keys()) { const d = Math.abs(i - x); if (d < distance) { distance = d; nearest = i; } }
      }
      if (nearest < 0) return;
      key = `${nearest}`;
      pose = nearest;
      if (key !== painted) { context.globalAlpha = 1; context.drawImage(bitmaps.get(nearest), 0, 0, size, size); }
      if (Math.abs(nearest - x) < 0.02) stats.exact++; else stats.nearest++;
    }
    painted = key;
    stats.maxLag = Math.max(stats.maxLag, Math.abs(pose - x));
    stage.dataset.frame = pose.toFixed(2);
    stage.dataset.filmPosition = String(pose / SCALE);
    stage.dataset.lag = (pose - x).toFixed(2);
    if (!firstPaint) {
      firstPaint = true;
      stats.firstFrameMs = Math.round(performance.now() - started);
      canvas.style.opacity = '1';
      viewport.classList.add('video-ready');
    }
  }

  return {
    update(t, dial = 'nuit') {
      const active = dial === 'nuit';
      if (active !== enabled || !stage.style.opacity) {
        enabled = active;
        stage.style.opacity = enabled ? '1' : '0';
      }
      if (!enabled) return false;
      const reduced = reducedMotion?.matches;
      target = Math.max(0, Math.min(last || 720, timeline(t, reduced) * SCALE));
      const now = performance.now();
      const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0;
      lastTime = now;
      if (x === null || reduced) {
        x = target; v = 0;
      } else {
        // critically damped spring (ω = 18 rad/s): smooth, no overshoot, settles in ~0.25 s
        const w = 18;
        let rest = dt;
        while (rest > 1e-6) {
          const h = Math.min(rest, 1 / 240);
          v += (w * w * (target - x) - 2 * w * v) * h;
          x += v * h;
          rest -= h;
        }
        if (Math.abs(target - x) < 0.02 && Math.abs(v) < 0.5) { x = target; v = 0; }
      }
      schedule();
      paint();
      return true;
    },
    stats() { return { ...stats, bitmaps: bitmaps.size, packsLoaded: packs.filter(Boolean).length, size, playhead: x, target }; },
    dispose() {
      disposed = true;
      for (const bitmap of bitmaps.values()) bitmap.close();
      bitmaps.clear();
    },
  };
}
