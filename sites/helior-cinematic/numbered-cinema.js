import { filmPosition } from './motion-timeline.js?v=3';

const SIZE = 900;
const LAST = 720;
const WINDOW = 4;

export function createNumberedCinema(stage, timeline = filmPosition) {
  const viewport = stage.querySelector('.box-cinema-frame');
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context || !('createImageBitmap' in globalThis)) return null;
  canvas.style.opacity = '0';
  viewport.append(canvas);
  stage.dataset.player = 'numbered';
  const frames = new Map();
  const jobs = new Map();
  const failed = new Map();
  let retryAt = Infinity;
  let target = NaN;
  let displayed = NaN;
  let direction = 1;
  let step = 0;
  let enabled = true;
  let bytes = 0;
  let firstAssetMs = null;
  let peakFrames = 0;
  let stopped = false;

  function start(index) {
    const controller = new AbortController();
    const started = performance.now();
    jobs.set(index, { controller, started });
    fetch(new URL(`./media/film/mobile/frames-60/${String(index).padStart(3, '0')}.webp`, import.meta.url), { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error(String(response.status));
        return response.blob();
      }).then(blob => {
        bytes += blob.size;
        return createImageBitmap(blob);
      }).then(image => {
        if (controller.signal.aborted) { image.close(); return; }
        firstAssetMs ??= performance.now() - started;
        failed.delete(index);
        frames.set(index, image);
        peakFrames = Math.max(peakFrames, frames.size);
      }).catch(() => {
        if (!controller.signal.aborted) {
          const attempts = (failed.get(index)?.attempts || 0) + 1;
          failed.set(index, { attempts, at: attempts < 2 ? performance.now() + 300 : Infinity });
        }
      }).finally(() => {
        if (jobs.get(index)?.controller === controller) jobs.delete(index);
        if (!controller.signal.aborted && enabled && !stopped) { paint(); feed(); }
      });
  }

  function feed() {
    const first = Math.floor(target);
    const near = [];
    const a = direction > 0 ? [first, first + 1] : [first + 1, first];
    const ahead = Math.max(0, Math.min(LAST, Math.round(target + direction * Math.min(step * 1.4, 30))));
    const wanted = step > 1.5 ? [ahead, ...a] : a;
    for (const index of [...wanted, first + 2 * direction, first - direction, first + 3 * direction, first + WINDOW * direction]) {
      if (index >= 0 && index <= LAST && !near.includes(index)) near.push(index);
    }
    let keepingProgress = false;
    for (const [index, { controller, started }] of jobs) {
      if (near.includes(index)) continue;
      // Let one useful request finish in flight. Cancelling every request on
      // a flick can starve the canvas until the user has stopped scrolling.
      if (!keepingProgress && Number.isFinite(displayed) && direction * (index - displayed) > 0 &&
          Math.abs(index - target) < Math.abs(displayed - target) && performance.now() - started < 100) {
        keepingProgress = true;
        continue;
      }
      controller.abort();
      jobs.delete(index);
    }
    for (const [index, frame] of frames) {
      if (!near.includes(index) && Math.abs(index - target) > WINDOW) {
        frame.close();
        frames.delete(index);
      }
    }
    retryAt = Infinity;
    const now = performance.now();
    for (const index of near) {
      if (jobs.size >= 3) break;
      if (frames.has(index) || jobs.has(index)) continue;
      const at = failed.get(index)?.at ?? 0;
      if (at <= now) start(index);
      else retryAt = Math.min(retryAt, at);
    }
  }

  function paint() {
    const first = Math.floor(target);
    const fraction = target - first;
    const left = frames.get(first);
    const right = frames.get(first + 1);
    let pose = NaN;
    if (left && (right || !fraction)) {
      pose = target;
      if (pose === displayed) return;
      context.drawImage(left, 0, 0);
      if (fraction) {
        context.globalAlpha = fraction;
        context.drawImage(right, 0, 0);
        context.globalAlpha = 1;
      }
    } else {
      let nearest;
      let distance = Number.isFinite(displayed) ? Math.abs(displayed - target) : Infinity;
      for (const index of frames.keys()) {
        if (Math.abs(index - target) < distance) { nearest = index; distance = Math.abs(index - target); }
      }
      if (nearest === undefined) return;
      context.drawImage(frames.get(nearest), 0, 0);
      pose = nearest;
    }
    displayed = pose;
    canvas.style.opacity = '1';
    viewport.classList.add('video-ready');
    stage.dataset.filmPosition = String(pose);
    stage.dataset.frame = String(Math.round(pose));
  }

  return {
    update(t, dial = 'nuit') {
      const active = dial === 'nuit';
      if (active !== enabled || !stage.style.opacity) {
        enabled = active;
        stage.style.opacity = enabled ? '1' : '0';
        if (enabled && Number.isFinite(target)) feed();
      }
      if (!enabled) return false;
      const next = timeline(t) * 2.5;
      if (next === target) {
        if (step || performance.now() >= retryAt) { step = 0; feed(); }
        return true;
      }
      step = Number.isFinite(target) ? Math.abs(next - target) : 0;
      direction = Math.sign(next - target) || direction;
      target = next;
      paint();
      feed();
      return true;
    },
    stats() { return { bytes, firstAssetMs, peakFrames, surfaceBytes: 4 * SIZE * SIZE, decodedBytes: peakFrames * SIZE * SIZE * 4 }; },
    dispose() {
      stopped = true;
      for (const { controller } of jobs.values()) controller.abort();
      for (const image of frames.values()) image.close();
      frames.clear();
    },
  };
}
