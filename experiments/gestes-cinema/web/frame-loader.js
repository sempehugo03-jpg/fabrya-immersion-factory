const cacheLimit = 10;
const parallelDecodes = 3;
const packLimit = 5;
const parallelFetches = 2;
/** A reversible image sequence with bounded network and decoded-frame caches. */
export function createFrameLoader(profile, frameCount, { onFrame, onError, isPaused, conserveData }) {
  const cache = new Map();
  const origin = {
    perPack: profile.framesPerPack ?? frameCount,
    packs: profile.packs ?? [{ url: profile.pack, offsets: profile.offsets }],
    loaded: new Map(), fetching: new Map(), active: new Set(),
    failedPacks: new Set(), failedFrames: new Set(),
  };
  let target = 0;
  let direction = 1;
  let travel = 1;
  let disposed = false;

  function trimCache() {
    const current = [...cache.keys()].sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
    for (const index of current.slice(cacheLimit)) {
      cache.get(index).close();
      cache.delete(index);
    }
  }

  async function decode(index) {
    if (cache.has(index) || origin.active.has(index)) return;
    const pack = Math.floor(index / origin.perPack);
    const data = origin.loaded.get(pack);
    if (!data) return;
    const offsets = origin.packs[pack].offsets;
    const local = index % origin.perPack;
    origin.active.add(index);
    try {
      const image = await createImageBitmap(data.slice(offsets[local], offsets[local + 1], 'image/webp'));
      if (disposed || Math.abs(index - target) > origin.perPack) {
        image.close();
        return;
      }
      cache.set(index, image);
      trimCache();
      if (index === target && !isPaused()) onFrame(index, image);
    } catch {
      origin.failedFrames.add(index);
      if (!disposed && index === target) onError('Cette image ne peut pas être affichée.');
    } finally {
      origin.active.delete(index);
      if (!disposed) pump();
    }
  }

  async function loadPack(index) {
    const controller = new AbortController();
    origin.fetching.set(index, controller);
    try {
      const pack = origin.packs[index];
      const response = await fetch(pack.url, { signal: controller.signal });
      if (!response.ok) throw new Error('Média indisponible');
      const blob = await response.blob();
      if (blob.size !== pack.offsets.at(-1)) throw new Error('Paquet incomplet');
      if (disposed || controller.signal.aborted) return;
      origin.loaded.set(index, blob);
      const focus = Math.floor(target / origin.perPack);
      const ordered = [...origin.loaded.keys()].sort((a, b) => Math.abs(a - focus) - Math.abs(b - focus));
      for (const distant of ordered.slice(packLimit)) origin.loaded.delete(distant);
    } catch {
      if (!disposed && !controller.signal.aborted) {
        origin.failedPacks.add(index);
        if (index === Math.floor(target / origin.perPack)) {
          onError('Cette partie du film n’a pas pu être chargée. Défilez pour réessayer.');
        }
      }
    } finally {
      origin.fetching.delete(index);
      if (!disposed) pump();
    }
  }

  function pump() {
    if (disposed || isPaused()) return;
    const current = Math.floor(target / origin.perPack);
    const conserve = conserveData();
    const candidates = [target];
    if (!conserve) {
      candidates.push(target + direction * travel, target + direction, target - direction,
        target + direction * Math.min(travel * 2, origin.perPack));
    }
    const frames = [...new Set(candidates)].filter(index => index >= 0 && index < frameCount);
    const packs = new Set(frames.map(index => Math.floor(index / origin.perPack)));
    if (!conserve) {
      const next = current + direction;
      if (next >= 0 && next < origin.packs.length) packs.add(next);
    }
    // Keep the current request and free an occupied slot for a distant jump or reversal.
    for (const [index, controller] of origin.fetching) {
      if (!packs.has(index)) controller.abort();
    }
    for (const index of packs) {
      if (origin.fetching.size >= parallelFetches) break;
      if (!origin.loaded.has(index) && !origin.fetching.has(index) && !origin.failedPacks.has(index)) {
        void loadPack(index);
      }
    }
    const ready = cache.get(target);
    if (ready) onFrame(target, ready);
    for (const index of frames) {
      // Reserve a decode slot for the next request, especially when the direction changes.
      if (origin.active.size >= (index === target ? parallelDecodes : parallelDecodes - 1)) break;
      if (!origin.failedFrames.has(index)) void decode(index);
    }
  }

  return {
    seek(index) {
      if (index !== target) {
        direction = Math.sign(index - target);
        travel = Math.min(Math.abs(index - target), 8);
        origin.failedPacks.delete(Math.floor(index / origin.perPack));
        origin.failedFrames.delete(index);
      }
      target = index;
      pump();
    },
    dispose() {
      disposed = true;
      for (const controller of origin.fetching.values()) controller.abort();
      for (const bitmap of cache.values()) bitmap.close();
      cache.clear();
      origin.loaded.clear();
    },
  };
}
