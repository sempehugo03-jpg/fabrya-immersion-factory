const track = document.querySelector('.track');
const pin = document.querySelector('.pin');
const screen = document.querySelector('.screen');
const slider = document.querySelector('#progress');
const position = document.querySelector('#position');
const canvas = screen.querySelector('canvas');
const context = canvas.getContext('2d', { alpha: false });
const hotspot = screen.querySelector('.hotspot');
const dialog = document.querySelector('dialog');
const error = screen.querySelector('.error');
const mobile = matchMedia('(max-width: 650px)');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const cache = new Map();
const cacheLimit = 10;
const parallelDecodes = 3;
let sequence;
let source;
let target = 0;
let presented = -1;
let direction = 1;
let request;
let modalScroll;

const distance = () => Math.max(1, track.offsetHeight - pin.offsetHeight);
const clamp = (value, top) => Math.max(0, Math.min(top, value));

function notify(name, detail) {
  screen.dispatchEvent(new CustomEvent('film:' + name, { detail }));
}

function setError(message = '') {
  error.hidden = !message;
  error.textContent = message;
}

function present(index) {
  if (dialog.open || presented === index || index !== target) return;
  const image = cache.get(index);
  if (!image) return;
  context.drawImage(image, 0, 0);
  const moment = performance.now();
  canvas.hidden = false;
  presented = index;
  const point = sequence.hotspot;
  const visibleX = (point.x - source.profile.left) / source.profile.span;
  const visible = index >= point.start && index <= point.end;
  if (!visible && document.activeElement === hotspot) slider.focus({ preventScroll: true });
  hotspot.hidden = !visible;
  hotspot.style.setProperty('--x', `${visibleX * 100}%`);
  hotspot.style.setProperty('--y', `${point.y * 100}%`);
  screen.dataset.presented = String(index);
  if (request) notify('presented', { ...request, moment });
}

function trimCache() {
  const current = [...cache.keys()].sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
  for (const index of current.slice(cacheLimit)) {
    cache.get(index).close();
    cache.delete(index);
  }
}

async function decode(index, origin) {
  if (index < 0 || index >= sequence.frames || cache.has(index) || origin.active.has(index)) return;
  origin.active.add(index);
  try {
    const offsets = origin.profile.offsets;
    const blob = origin.pack.slice(offsets[index], offsets[index + 1], 'image/webp');
    const image = await createImageBitmap(blob);
    if (origin !== source) {
      image.close();
      return;
    }
    cache.set(index, image);
    trimCache();
    present(index);
  } catch {
    if (origin === source && index === target) setError('Cette image ne peut pas être affichée.');
  } finally {
    origin.active.delete(index);
    if (origin === source && index !== target && error.hidden) pump();
  }
}

function pump() {
  if (!source?.pack || !error.hidden || dialog.open) return;
  present(target);
  // Reserve one decoder for a new target when a gesture reverses direction.
  if (source.active.size < parallelDecodes) void decode(target, source);
  if (reduced.matches || navigator.connection?.saveData) return;
  for (const offset of [direction, -direction, direction * 2]) {
    if (source.active.size >= parallelDecodes - 1) break;
    void decode(target + offset, source);
  }
}

function update(index) {
  if (!sequence || dialog.open) return;
  const next = clamp(Math.round(index), sequence.frames - 1);
  if (next !== target || !request) {
    if (next !== target) direction = Math.sign(next - target);
    target = next;
    request = { index: target, requested: performance.now() };
    slider.value = String(target);
    position.value = `${Math.round(target / (sequence.frames - 1) * 100)} %`;
    screen.dataset.target = String(target);
    if (source?.pack) setError();
    notify('target', request);
  }
  pump();
}

function updateFromScroll() {
  if (!sequence || reduced.matches || dialog.open) return;
  update(-track.getBoundingClientRect().top / distance() * (sequence.frames - 1));
}

async function setSource() {
  source?.controller.abort();
  for (const image of cache.values()) image.close();
  cache.clear();
  const profile = sequence.profiles[mobile.matches ? 'mobile' : 'desktop'];
  const origin = { profile, active: new Set(), controller: new AbortController() };
  source = origin;
  presented = -1;
  screen.setAttribute('aria-busy', 'true');
  canvas.hidden = true;
  hotspot.hidden = true;
  setError();
  try {
    const response = await fetch(profile.pack, { signal: origin.controller.signal });
    if (!response.ok) throw new Error('Média indisponible');
    origin.pack = await response.blob();
    if (source !== origin) return;
    if (origin.pack.size !== profile.offsets.at(-1)) throw new Error('Paquet incomplet');
    canvas.width = profile.width;
    canvas.height = profile.height;
    screen.setAttribute('aria-busy', 'false');
    slider.disabled = false;
    update(target);
  } catch {
    if (!origin.controller.signal.aborted) {
      screen.setAttribute('aria-busy', 'false');
      setError('Le film n’a pas pu être chargé. Rechargez la page pour réessayer.');
    }
  }
}

// Native scroll events already follow the rendering cycle.
addEventListener('scroll', updateFromScroll, { passive: true });
slider.addEventListener('input', () => {
  const index = slider.valueAsNumber;
  if (!reduced.matches) {
    scrollTo({ top: scrollY + track.getBoundingClientRect().top + index / (sequence.frames - 1) * distance(), behavior: 'instant' });
  }
  update(index);
});
mobile.addEventListener('change', () => { if (sequence) void setSource(); });
reduced.addEventListener('change', readPreference);
function readPreference() {
  document.querySelector('#instruction').textContent = reduced.matches
    ? 'Choisissez une image avec le curseur.'
    : 'Défilez pour avancer ou revenir.';
  if (!reduced.matches) updateFromScroll();
}
hotspot.addEventListener('click', () => {
  modalScroll = scrollY;
  dialog.showModal();
});
dialog.querySelector('.close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  if (!reduced.matches && scrollY !== modalScroll) scrollTo({ top: modalScroll, behavior: 'instant' });
  (hotspot.hidden ? slider : hotspot).focus({ preventScroll: true });
  pump();
});

try {
  const response = await fetch('track.json');
  if (!response.ok) throw new Error('Manifeste indisponible');
  sequence = await response.json();
  slider.max = String(sequence.frames - 1);
  readPreference();
  void setSource();
} catch {
  screen.setAttribute('aria-busy', 'false');
  setError('Le plan fixe est disponible. Le film n’a pas pu être chargé.');
}
