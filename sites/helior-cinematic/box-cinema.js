import { filmPosition } from './motion-timeline.js?v=3';

const KEYFRAMES = [0, 72, 144, 216, 288];
const SCROLL_STOPS = [0, 2, 3, 4.7, 5.85];
const SOURCE_FPS = 24;
const FILM_FPS = 60;
const FILM_SCALE = FILM_FPS / SOURCE_FPS;
const DENSE_FPS = 180;
const DENSE_SCALE = DENSE_FPS / FILM_FPS;
const FRAME_COUNT = KEYFRAMES.at(-1) * FILM_SCALE * DENSE_SCALE + 1;
const OPENING_SETTLE_MS = 32;
const OPENING_FOLLOW_MS = 20;
const FULL_FOLLOW_STEP = .23;
const MAX_FOLLOW_STEP = .31;

export function boxFrameAt(t, reduced = false) {
  return Math.round(filmPosition(t, reduced));
}

// Follow the gesture at display cadence, then settle on its exact final frame.
export function stepFilmPlayhead(position, target, elapsed, reduced = false) {
  if (position === null || reduced || elapsed > 120 || Math.abs(target - position) <= .45) return target;
  return position + (target - position) * -Math.expm1(-Math.max(0, elapsed) / 28);
}

// A short, continuous response spreads small touch increments between paints.
// Snap only after the input actually settles, never as it crosses an error threshold.
export function stepOpeningPlayhead(position, target, elapsed, sinceInput, inputStep) {
  const strength = Math.min(1, Math.max(0, (MAX_FOLLOW_STEP - inputStep) / (MAX_FOLLOW_STEP - FULL_FOLLOW_STEP)));
  const reference = stepFilmPlayhead(position, target, elapsed);
  if (!strength || position === null || elapsed > 120) return reference;
  const fine = target === 0 || sinceInput >= OPENING_SETTLE_MS ? target
    : position + (target - position) * -Math.expm1(-Math.max(0, elapsed) / OPENING_FOLLOW_MS);
  return reference + (fine - reference) * strength;
}

// Use decoded frames as the visual clock. The browser never seeks a video
// element on devices that support the dedicated decoder.
export function createBoxCinema(stage, mobile, reducedMotion, options = {}) {
  if (!('VideoDecoder' in globalThis) || !('Worker' in globalThis)) {
    return createStillCinema(stage, mobile, reducedMotion);
  }
  const viewport = stage.querySelector('.box-cinema-frame');
  const directory = mobile ? 'mobile' : 'desktop';
  const size = mobile ? 900 : 1440;
  const useDenseStream = options.reference || options.dense;
  const sourceScale = useDenseStream ? 1 : DENSE_SCALE;
  const grid = options.grid ?? sourceScale;
  const timeline = options.timeline ?? filmPosition;
  let peakFrames = 0;
  let bytes = 0;
  let firstAssetMs = null;
  const layers = [0, 1].map(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    canvas.style.opacity = '0';
    canvas.style.willChange = 'opacity';
    return { canvas, context: canvas.getContext('2d', { alpha: false }), frame: -1 };
  });
  if (layers.some(layer => !layer.context)) return createStillCinema(stage, mobile, reducedMotion);
  const fallback = createFrameFallback(stage, viewport, directory, mobile);
  let groupSize;
  const frames = new Map();
  const pending = new Map();
  let jobSequence = 0;
  const received = new Set();
  let worker;
  let secondary;
  let requested = 0;
  let displayed = -1;
  let ready = false;
  let enabled = false;
  let t = 0;
  let dial = 'nuit';
  let probeTimer;
  let retryTimer;
  const retries = new Map();
  let lagSince = 0;
  let playhead = null;
  let lastUpdate = 0;
  let lastInput = 0;
  let lastTarget = 0;
  let inputStep = 0;
  let warmKey;
  let direction = 1;

  function switchToStills() {
    clearTimeout(probeTimer);
    clearTimeout(retryTimer);
    worker?.terminate();
    fallback.stop();
    for (const layer of layers) layer.canvas.remove();
    delete stage.dataset.filmPosition;
    delete stage.dataset.interpolation;
    viewport.classList.remove('video-ready');
    for (const frame of frames.values()) frame.close();
    frames.clear();
    secondary = createStillCinema(stage, mobile, reducedMotion);
    secondary.update(t, dial);
  }

  function load(layer, index) {
    if (layer.frame === index) return;
    layer.context.drawImage(frames.get(index), 0, 0, size, size);
    layer.frame = index;
  }

  function show(first, next, alpha) {
    const position = first + (next - first) * alpha;
    if (position === displayed && fallback.frame === Infinity) return;
    const upper = layers.find(layer => layer.frame === next);
    const lower = layers.find(layer => layer.frame === first) || layers.find(layer => layer !== upper);
    const top = layers.find(layer => layer !== lower);
    load(lower, first);
    if (alpha) load(top, next);
    lower.canvas.style.zIndex = '0';
    lower.canvas.style.opacity = '1';
    top.canvas.style.zIndex = '1';
    top.canvas.style.opacity = String(alpha);
    if (displayed < 0) {
      viewport.append(...layers.map(layer => layer.canvas));
      viewport.classList.add('video-ready');
      stage.dataset.player = 'decoded-frames';
    }
    fallback.stop();
    displayed = position;
    stage.dataset.frame = String(Math.round(position));
    stage.dataset.filmPosition = String(position / DENSE_SCALE);
    stage.dataset.interpolation = alpha ? 'composition' : 'frame';
    stage.dispatchEvent(new CustomEvent('helior:cinema-frame', { detail: Math.round(position) }));
  }

  function paint(position, interpolate) {
    if (position === displayed && fallback.frame === Infinity) return;
    const first = Math.floor(position / grid) * grid;
    const has = index => frames.has(index) || layers.some(layer => layer.frame === index);
    if (has(first)) {
      if (position === first) { show(first, first, 0); return; }
      if (interpolate && has(first + grid)) { show(first, first + grid, (position - first) / grid); return; }
    }
    let closest = -1;
    let distance = Infinity;
    for (const index of [...frames.keys(), ...layers.map(layer => layer.frame)]) {
      const delta = Math.abs(index - position);
      if (index >= 0 && index % grid === 0 && delta < distance) {
        closest = index;
        distance = delta;
      }
    }
    if (closest >= 0 && Math.abs(fallback.frame * FILM_SCALE * DENSE_SCALE - position) >= distance) {
      show(closest, closest, 0);
    }
  }

  function nearbyGroups() {
    const group = Math.floor(requested / groupSize);
    const bias = options.reference ? (requested % groupSize < groupSize / 2 ? -1 : 1) : direction;
    return [group, group + bias, group - bias];
  }

  function feed() {
    if (!ready || !enabled) return;
    const groups = nearbyGroups();
    const near = groups.slice(0, reducedMotion.matches ? 1 : options.reference ? 2 : 3);
    if (!reducedMotion.matches && groups[0] !== warmKey) {
      warmKey = groups[0];
      worker.postMessage({ type: 'warm', groups });
    }
    for (const [number, frame] of frames) {
      if (!near.includes(Math.floor(number / groupSize))) {
        frame.close();
        frames.delete(number);
      }
    }
    for (const group of received) if (!near.includes(group)) received.delete(group);
    const cancelled = [];
    for (const [first, jobId] of pending) {
      if (near.includes(Math.floor(first / groupSize))) continue;
      pending.delete(first);
      cancelled.push(jobId);
    }
    if (cancelled.length) worker.postMessage({ type: 'cancel', jobIds: cancelled });
    for (const candidate of near) {
      const first = candidate * groupSize;
      if (pending.size >= 2) break;
      if (first < 0 || first >= FRAME_COUNT || received.has(candidate) || pending.has(first) || retries.get(first) > 1) continue;
      const jobId = ++jobSequence;
      pending.set(first, jobId);
      worker.postMessage({ type: 'decode', first: first / sourceScale, jobId });
    }
  }

  try {
    worker = new Worker(new URL('./film-decoder.js?v=scroll-direct', import.meta.url), { type: 'module' });
    worker.onerror = switchToStills;
    worker.onmessage = ({ data }) => {
      if (data.type === 'asset') {
        bytes += data.bytes;
        firstAssetMs ??= data.elapsed;
        return;
      }
      if (data.type === 'error') { switchToStills(); return; }
      if (data.type === 'ready') {
        if (data.fps !== DENSE_FPS / sourceScale) { switchToStills(); return; }
        groupSize = data.groupFrames * sourceScale;
        ready = true;
      } else {
        const first = data.first * sourceScale;
        if (pending.get(first) !== data.jobId) {
          for (const frame of data.frames || []) frame.close();
          return;
        }
        if (data.type === 'group-error') {
          pending.delete(first);
          retries.set(first, (retries.get(first) || 0) + 1);
          clearTimeout(retryTimer);
          retryTimer = setTimeout(feed, 250);
          return;
        }
        const group = Math.floor(first / groupSize);
        const near = nearbyGroups().slice(0, reducedMotion.matches ? 1 : options.reference ? 2 : 3);
        if (near.includes(group)) {
          if (data.frames.length) clearTimeout(probeTimer);
          for (const frame of data.frames) {
            const key = Math.round(frame.timestamp * DENSE_FPS / 1e6);
            frames.get(key)?.close();
            frames.set(key, frame);
            peakFrames = Math.max(peakFrames, frames.size);
          }
          if (data.complete) {
            const limit = Math.min(first + groupSize, FRAME_COUNT);
            let next = first;
            while (next < limit && frames.has(next)) next += sourceScale;
            if (next >= limit) received.add(group);
          }
        } else {
          for (const frame of data.frames) frame.close();
        }
        if (!data.complete) return;
        pending.delete(first);
        retries.delete(first);
      }
      feed();
    };
    worker.postMessage({
      type: 'init',
      report: !!options.measure,
      source: new URL(`./media/film/${directory}/${useDenseStream ? 'stream-180' : 'stream-seek'}/`, import.meta.url).href,
    });
    probeTimer = setTimeout(switchToStills, 8000);
  } catch {
    switchToStills();
  }

  return {
    update(nextT, nextDial = 'nuit') {
      t = nextT;
      dial = nextDial;
      if (secondary) return secondary.update(t, dial);
      const nextEnabled = dial === 'nuit';
      if (enabled !== nextEnabled) {
        enabled = nextEnabled;
        stage.style.opacity = enabled ? '1' : '0';
        if (!enabled) fallback.stop();
        else feed();
      }
      if (!enabled) return false;
      const now = performance.now();
      const reduced = reducedMotion.matches;
      const filmTarget = timeline(t, reduced) * FILM_SCALE;
      if (filmTarget !== lastTarget) {
        inputStep = Math.abs(filmTarget - lastTarget);
        lastInput = now;
        lastTarget = filmTarget;
      }
      const elapsed = now - lastUpdate;
      playhead = !reduced && options.reference
        ? stepOpeningPlayhead(playhead, filmTarget, elapsed, now - lastInput, inputStep)
        : filmTarget;
      lastUpdate = now;
      const position = playhead * DENSE_SCALE;
      const target = Math.round(position);
      if (target !== requested) {
        direction = Math.sign(target - requested);
        requested = target;
        feed();
      }
      paint(position, !reduced && (!options.reference || inputStep < .8 || now - lastInput >= OPENING_SETTLE_MS));
      if (Math.abs(requested - displayed) <= 4 * DENSE_SCALE) lagSince = now;
      if ((options.reference || (!options.measure && displayed < 0)) &&
          (displayed < 0 || now - lagSince > 160 || (!options.reference && Math.abs(requested - displayed) > groupSize))) {
        fallback.update(Math.round(playhead / FILM_SCALE));
      }
      return true;
    },
    stats() { return { bytes, firstAssetMs, peakFrames, surfaceBytes: 8 * size * size, decodedBytes: peakFrames * size * size * 1.5 }; },
    dispose() {
      clearTimeout(probeTimer);
      clearTimeout(retryTimer);
      worker?.terminate();
      fallback.stop();
      for (const frame of frames.values()) frame.close();
      frames.clear();
    },
  };
}

function createStillCinema(stage, mobile, reducedMotion) {
  const viewport = stage.querySelector('.box-cinema-frame');
  const stills = createFrameFallback(stage, viewport, mobile ? 'mobile' : 'desktop', mobile);
  let enabled;
  stage.dataset.player = 'stills';
  return {
    update(t, dial = 'nuit') {
      if ((dial === 'nuit') !== enabled || !stage.style.opacity) {
        enabled = dial === 'nuit';
        stage.style.opacity = enabled ? '1' : '0';
        if (!enabled) stills.stop();
      }
      if (enabled) stills.update(boxFrameAt(t, reducedMotion.matches));
      return enabled;
    },
  };
}

function createFrameFallback(stage, viewport, directory, mobile) {
  const windowSize = mobile ? 5 : 7;
  const cache = new Map();
  const pending = new Set();
  const failed = new Set();
  let requested = 0;
  let previous = 0;
  let direction = 1;
  let visibleFrame = -1;
  let enabled = false;
  let visibleImage;

  function paint() {
    if (!enabled) return;
    let closest = visibleFrame;
    let distance = visibleFrame < 0 ? Infinity : Math.abs(requested - visibleFrame);
    for (const frame of cache.keys()) {
      if (Math.abs(requested - frame) < distance) {
        closest = frame;
        distance = Math.abs(requested - frame);
      }
    }
    if (closest === visibleFrame) return;
    visibleImage?.remove();
    visibleImage = cache.get(closest);
    viewport.append(visibleImage);
    visibleFrame = closest;
    stage.dataset.frame = String(closest);
    stage.dispatchEvent(new CustomEvent('helior:cinema-frame', { detail: closest }));
  }

  function warm() {
    if (!enabled) return;
    const half = (windowSize - 1) / 2;
    const windowFrames = [requested];
    for (let offset = 1; offset <= half; offset++) {
      windowFrames.push(requested + offset * direction, requested - offset * direction);
    }
    for (const frame of cache.keys()) {
      if (!windowFrames.includes(frame)) cache.delete(frame);
    }
    for (const frame of windowFrames) {
      if (pending.size >= 3) break;
      if (frame < 0 || frame > KEYFRAMES.at(-1) || cache.has(frame) || pending.has(frame) || failed.has(frame)) continue;
      const image = new Image();
      image.alt = '';
      image.style.zIndex = '2';
      image.fetchPriority = frame === requested ? 'high' : 'low';
      image.src = new URL(`./media/film/${directory}/${String(frame).padStart(3, '0')}.webp`, import.meta.url).href;
      pending.add(frame);
      image.decode().then(() => {
        if (Math.abs(frame - requested) <= half) cache.set(frame, image);
        paint();
      }).catch(() => failed.add(frame)).finally(() => {
        pending.delete(frame);
        warm();
      });
    }
  }

  return {
    get frame() { return visibleFrame < 0 ? Infinity : visibleFrame; },
    update(frame) {
      if (enabled && requested === frame) return;
      enabled = true;
      requested = frame;
      if (requested !== previous) direction = Math.sign(requested - previous);
      previous = requested;
      paint();
      warm();
    },
    stop() {
      enabled = false;
      visibleImage?.remove();
      visibleImage = undefined;
      visibleFrame = -1;
      cache.clear();
    },
  };
}
