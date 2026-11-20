import { createFrameLoader } from './frame-loader.js';

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
const detailTitle = dialog.querySelector('#detail-title');
const detailCopy = dialog.querySelector('.detail-copy');
const detailLink = dialog.querySelector('.detail-link');
const directActions = document.querySelector('.direct-actions');
const mobile = matchMedia('(max-width: 650px)');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let sequence;
let source;
let target = 0;
let presented = -1;
let request;
let modalScroll;
let activePoint;
let opener;

const distance = () => Math.max(1, track.offsetHeight - pin.offsetHeight);
const clamp = (value, top) => Math.max(0, Math.min(top, value));

function notify(name, detail) {
  screen.dispatchEvent(new CustomEvent('film:' + name, { detail }));
}

function setError(message = '') {
  error.hidden = !message;
  error.textContent = message;
}

function present(index, image) {
  screen.setAttribute('aria-busy', 'false');
  slider.disabled = false;
  if (dialog.open || presented === index || index !== target) return;
  context.drawImage(image, 0, 0);
  const moment = performance.now();
  canvas.hidden = false;
  presented = index;
  activePoint = (sequence.hotspots ?? [sequence.hotspot]).find(point =>
    index >= point.start && index <= point.end);
  if (!activePoint && document.activeElement === hotspot) slider.focus({ preventScroll: true });
  hotspot.hidden = !activePoint;
  if (activePoint) {
    const visibleX = (activePoint.x - source.profile.left) / source.profile.span;
    hotspot.style.setProperty('--x', `${visibleX * 100}%`);
    hotspot.style.setProperty('--y', `${activePoint.y * 100}%`);
    if (activePoint.action) hotspot.setAttribute('aria-label', activePoint.action.label);
  }
  screen.dataset.presented = String(index);
  if (request) notify('presented', { ...request, moment });
}

function update(index) {
  if (!sequence || dialog.open) return;
  const next = clamp(Math.round(index), sequence.frames - 1);
  if (next !== target || !request) {
    target = next;
    request = { index: target, requested: performance.now() };
    slider.value = String(target);
    position.value = `${Math.round(target / (sequence.frames - 1) * 100)} %`;
    screen.dataset.target = String(target);
    if (source) setError();
    notify('target', request);
  }
  source?.loader.seek(target);
}

function updateFromScroll() {
  if (!sequence || reduced.matches || dialog.open) return;
  update(-track.getBoundingClientRect().top / distance() * (sequence.frames - 1));
}

function setSource() {
  source?.loader.dispose();
  const profile = sequence.profiles[mobile.matches ? 'mobile' : 'desktop'];
  source = {
    profile,
    loader: createFrameLoader(profile, sequence.frames, {
      onFrame: present,
      onError(message) {
        screen.setAttribute('aria-busy', 'false');
        setError(message);
      },
      isPaused: () => dialog.open,
      conserveData: () => reduced.matches || navigator.connection?.saveData,
    }),
  };
  presented = -1;
  screen.setAttribute('aria-busy', 'true');
  canvas.hidden = true;
  hotspot.hidden = true;
  canvas.width = profile.width;
  canvas.height = profile.height;
  setError();
  update(target);
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
function openDetail(origin, action) {
  if (action) {
    detailTitle.textContent = action.heading;
    detailCopy.textContent = action.body;
    detailLink.hidden = !action.href;
    if (action.href) {
      detailLink.href = action.href;
      detailLink.textContent = action.label;
    } else {
      detailLink.removeAttribute('href');
    }
  }
  opener = origin;
  modalScroll = scrollY;
  dialog.showModal();
}

hotspot.addEventListener('click', () => openDetail(hotspot, activePoint?.action));
for (const button of directActions?.querySelectorAll('button') ?? []) {
  button.addEventListener('click', () => openDetail(button, {
    heading: button.dataset.heading,
    body: button.dataset.body,
  }));
}
function resumeFilm() {
  if (dialog.open || modalScroll === undefined) return;
  const previousScroll = modalScroll;
  modalScroll = undefined;
  if (!reduced.matches && scrollY !== previousScroll) {
    scrollTo({ top: previousScroll, behavior: 'instant' });
  }
  (opener.hidden ? slider : opener).focus({ preventScroll: true });
  source?.loader.seek(target);
  notify('resumed', { index: presented });
}

dialog.querySelector('.close').addEventListener('click', () => {
  dialog.close();
  resumeFilm();
});
dialog.addEventListener('close', resumeFilm);

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
