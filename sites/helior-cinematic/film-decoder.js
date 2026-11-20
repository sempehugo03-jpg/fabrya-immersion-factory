const chunkCache = new Map();
const jobs = new Map();
let source;
let metadata;
let reportAssets = false;

function getChunk(index) {
  if (chunkCache.has(index)) return chunkCache.get(index);
  const url = new URL(`${String(index).padStart(2, '0')}.bin`, source);
  const started = performance.now();
  const request = fetch(url).then(response => {
    if (!response.ok) throw new Error('Film segment unavailable');
    return response.arrayBuffer();
  }).then(bytes => {
    if (reportAssets) postMessage({ type: 'asset', bytes: bytes.byteLength, elapsed: performance.now() - started });
    return bytes;
  }).catch(error => {
    chunkCache.delete(index);
    throw error;
  });
  chunkCache.set(index, request);
  if (chunkCache.size > 6) chunkCache.delete(chunkCache.keys().next().value);
  return request;
}

async function decodeGroup(first, job) {
  const { chunkFrames, groupFrames, fps } = metadata;
  const chunk = Math.floor(first / chunkFrames);
  const local = first % chunkFrames;
  const offsets = metadata.chunks[chunk];
  const bytes = await getChunk(chunk);
  if (job.cancelled) return;
  const frames = [];
  let decoded = 0;
  let decodeError;
  function deliver(complete) {
    const batch = frames.splice(0);
    postMessage({ type: 'frames', first, jobId: job.id, frames: batch, complete }, batch);
  }
  const decoder = new VideoDecoder({
    output: frame => {
      if (job.cancelled) { frame.close(); return; }
      frames.push(frame);
      decoded++;
      if (frames.length === 6) deliver(false);
    },
    error: error => { decodeError = error; },
  });
  job.decoder = decoder;
  try {
    decoder.configure({ codec: metadata.codec, optimizeForLatency: true });
    const limit = Math.min(local + groupFrames, offsets.length - 1);
    for (let i = local; i < limit; i++) {
      const frame = first + i - local;
      decoder.decode(new EncodedVideoChunk({
        type: i === local ? 'key' : 'delta',
        timestamp: Math.round(frame * 1e6 / fps),
        data: new Uint8Array(bytes, offsets[i], offsets[i + 1] - offsets[i]),
      }));
    }
    await decoder.flush();
    if (decodeError || decoded !== limit - local) throw decodeError || new Error('Incomplete group');
    if (!job.cancelled) deliver(true);
  } catch (error) {
    for (const frame of frames) frame.close();
    throw error;
  } finally {
    job.decoder = null;
    if (decoder.state !== 'closed') decoder.close();
  }
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      source = new URL(data.source);
      reportAssets = data.report;
      const response = await fetch(new URL('index.json', source));
      if (!response.ok) throw new Error('Film index unavailable');
      metadata = await response.json();
      const support = await VideoDecoder.isConfigSupported({ codec: metadata.codec, optimizeForLatency: true });
      if (!support.supported) throw new Error('Film decoder unavailable');
      postMessage({ type: 'ready', fps: metadata.fps, groupFrames: metadata.groupFrames });
    } else if (data.type === 'warm') {
      const { groupFrames, chunkFrames, chunks } = metadata;
      const indexes = new Set(data.groups.map(group => Math.floor(group * groupFrames / chunkFrames)));
      for (const index of indexes) if (index >= 0 && index < chunks.length) getChunk(index).catch(() => {});
    } else if (data.type === 'cancel') {
      for (const id of data.jobIds) {
        const job = jobs.get(id);
        if (!job) continue;
        job.cancelled = true;
        if (job.decoder && job.decoder.state !== 'closed') job.decoder.close();
      }
    } else if (data.type === 'decode') {
      const job = { id: data.jobId, cancelled: false, decoder: null };
      jobs.set(job.id, job);
      try {
        await decodeGroup(data.first, job);
      } catch {
        if (!job.cancelled) postMessage({ type: 'group-error', first: data.first, jobId: job.id });
      } finally {
        jobs.delete(job.id);
      }
    }
  } catch {
    postMessage({ type: 'error' });
  }
};
