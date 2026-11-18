const track = document.querySelector('.track');
const pin = document.querySelector('.pin');
const screen = document.querySelector('.screen');
const slider = document.querySelector('#progress');
const position = document.querySelector('#position');
const canvas = screen.querySelector('canvas');
const context = canvas.getContext('2d', { alpha: false });
const video = screen.querySelector('video');
const hotspot = screen.querySelector('.hotspot');
const dialog = document.querySelector('dialog');
const error = screen.querySelector('.error');
const mobile = matchMedia('(max-width: 650px)');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const cache = new Map();
const active = new Map();
const cacheLimit = 12;
const fetchLimit = 4;
const firstHotspot = 74;
let sequence;
let source;
let target = 0;
let presented = 0;
let mode = 'images';
let scrollPending = false;
let videoIndex = null;
let requestedAt = 0;

const frameName = index => `media/${source}/${String(index).padStart(3, '0')}.webp`;
const distance = () => Math.max(1, track.offsetHeight - pin.offsetHeight);

function setError(message = '') {
  error.hidden = !message;
  error.textContent = message;
}

function present(index) {
  presented = index;
  const { x, y } = sequence.hotspot[index];
  const profile = sequence.profiles[source];
  const visibleX = (x - profile.left) / profile.span;
  const visible = mode === 'images' && index >= firstHotspot && visibleX > .08 && visibleX < .92;
  if (!visible && document.activeElement === hotspot) slider.focus({ preventScroll: true });
  hotspot.hidden = !visible;
  hotspot.style.setProperty('--x', `${visibleX * 100}%`);
  hotspot.style.setProperty('--y', `${y * 100}%`);
  screen.dataset.presented = String(index);
  screen.dataset.cacheBytes = String(cache.size * profile.width * profile.height * 4 + profile.width * profile.height * 4);
  if (index === target) screen.dataset.latencyMs = (performance.now() - requestedAt).toFixed(1);
}

function draw(index) {
  const image = cache.get(index);
  if (!image) return;
  context.drawImage(image, 0, 0);
  canvas.dataset.ready = 'true';
  present(index);
}

function trimCache() {
  if (cache.size <= cacheLimit) return;
  const farFirst = [...cache.keys()].sort((a, b) => Math.abs(b - target) - Math.abs(a - target));
  for (const index of farFirst.slice(0, cache.size - cacheLimit)) {
    cache.get(index).close();
    cache.delete(index);
  }
}

function fetchFrame(index, priority) {
  if (index < 0 || index >= sequence.frames || cache.has(index) || active.has(index)) return;
  const previous = active.size;
  if (previous >= fetchLimit || (priority === 'low' && previous >= fetchLimit - 1)) return;
  const originalSource = source;
  const controller = new AbortController();
  active.set(index, controller);
  fetch(frameName(index), { priority, signal: controller.signal }).then(response => {
    if (!response.ok) throw new Error('Image indisponible');
    return response.blob();
  }).then(blob => createImageBitmap(blob)).then(image => {
    if (source !== originalSource || controller.signal.aborted) {
      image.close();
      return;
    }
    cache.set(index, image);
    trimCache();
    if (mode === 'images' && index === target) {
      setError();
      draw(index);
    }
  }).catch(() => {
    if (!controller.signal.aborted && source === originalSource && mode === 'images' && index === target) {
      setError('Image indisponible. Essayez le lecteur vidéo ou une autre position.');
    }
  }).finally(() => {
    if (active.get(index) === controller) active.delete(index);
    if (!controller.signal.aborted && source === originalSource && mode === 'images' && index !== target && !error.textContent) pumpImages();
  });
}

function pumpImages() {
  if (cache.has(target)) {
    if (presented !== target || canvas.dataset.ready !== 'true') draw(target);
  } else {
    fetchFrame(target, 'high');
  }
  if (reduced.matches || navigator.connection?.saveData) return;
  for (const offset of [1,-1,2,-2,3,-3]) fetchFrame(target + offset, 'low');
}

function pumpVideo() {
  if (video.readyState < 1 || video.seeking || videoIndex !== null) return;
  if (presented === target && video.dataset.ready === 'true') return;
  const time = Math.min((target + .2) / sequence.fps, video.duration - .006);
  if (Math.abs(video.currentTime - time) < .003 && video.readyState >= 2) {
    video.dataset.ready = 'true';
    present(target);
    return;
  }
  videoIndex = target;
  video.currentTime = time;
}

function update(index) {
  if (!sequence) return;
  const next = Math.max(0, Math.min(sequence.frames - 1, Math.round(index)));
  if (next !== target) requestedAt = performance.now();
  target = next;
  slider.value = String(target);
  position.value = `${Math.round(target / (sequence.frames - 1) * 100)} %`;
  screen.dataset.target = String(target);
  setError();
  if (mode === 'images') pumpImages();
  else pumpVideo();
}

function setSource() {
  source = mobile.matches ? 'mobile' : 'desktop';
  for (const controller of active.values()) controller.abort();
  active.clear();
  for (const image of cache.values()) image.close();
  cache.clear();
  const { width, height } = sequence.profiles[source];
  canvas.width = width;
  canvas.height = height;
  canvas.dataset.ready = 'false';
  video.dataset.ready = 'false';
  videoIndex = null;
  if (mode === 'video') setupVideo();
  else video.removeAttribute('src');
  update(target);
}

function setupVideo() {
  const url = new URL(`media/${source}/seek.mp4`, location.href).href;
  if (video.src === url) return;
  video.src = url;
}

function chooseMode() {
  mode = document.querySelector('input[name="mode"]:checked').value;
  canvas.hidden = mode !== 'images';
  video.hidden = mode !== 'video';
  hotspot.hidden = true;
  setError();
  if (mode === 'video') setupVideo();
  else canvas.dataset.ready = 'false';
  update(target);
}

video.addEventListener('loadedmetadata', () => {
  if (mode === 'video') pumpVideo();
});
video.addEventListener('loadeddata', () => {
  if (mode === 'video') pumpVideo();
});
video.addEventListener('seeked', () => {
  if (videoIndex === null) return;
  const index = videoIndex;
  videoIndex = null;
  if (mode !== 'video') return;
  video.dataset.ready = 'true';
  present(index);
  pumpVideo();
});
video.addEventListener('error', () => {
  if (mode === 'video') setError('Cette vidéo ne peut pas être lue ici. Essayez le lecteur par images.');
});

addEventListener('scroll', () => {
  if (scrollPending || reduced.matches || !sequence) return;
  scrollPending = true;
  requestAnimationFrame(() => {
    scrollPending = false;
    update(-track.getBoundingClientRect().top / distance() * (sequence.frames - 1));
  });
}, { passive: true });
slider.addEventListener('input', () => {
  const index = slider.valueAsNumber;
  if (!reduced.matches) {
    scrollTo({ top: scrollY + track.getBoundingClientRect().top + index / (sequence.frames - 1) * distance(), behavior: 'instant' });
  }
  update(index);
});
mobile.addEventListener('change', () => { if (sequence) setSource(); });
reduced.addEventListener('change', readPreference);
function readPreference() {
  document.querySelector('#instruction').textContent = reduced.matches
    ? 'Le mouvement au scroll est désactivé. Le curseur sélectionne une image.'
    : 'Défilez dans les deux sens ou déplacez le curseur.';
}
document.querySelectorAll('input[name="mode"]').forEach(input => input.addEventListener('change', chooseMode));
hotspot.addEventListener('click', () => dialog.showModal());
dialog.querySelector('.close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  (hotspot.hidden ? slider : hotspot).focus({ preventScroll: true });
});

try {
  const response = await fetch('track.json');
  if (!response.ok) throw new Error('Manifeste indisponible');
  sequence = await response.json();
  canvas.hidden = false;
  readPreference();
  setSource();
} catch {
  slider.disabled = true;
  setError('Le plan fixe est disponible. Le lecteur ne s’est pas chargé.');
}
