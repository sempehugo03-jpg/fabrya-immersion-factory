'use strict';

const journey = document.querySelector('.journey');
const stage = document.querySelector('.stage');
const canvas = document.querySelector('canvas');
const context = canvas.getContext('2d', { alpha: false });
const chapters = [...document.querySelectorAll('.chapter')];
const indicator = document.querySelector('.progress span');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const lastFrame = 95;
const preloadLimit = 4;
const totalLoadLimit = 6;
const loaded = new Map();
let activeLoads = 0;
let desiredFrame = 0;
let paintedFrame = -1;
let pending = false;
let started = false;

function drawFrame(frame) {
  const record = loaded.get(frame);
  if (paintedFrame === frame || !record?.ready || !context) return;
  context.drawImage(record.image, 0, 0, canvas.width, canvas.height);
  paintedFrame = frame;
  canvas.dataset.frame = String(frame);
  canvas.dataset.ready = 'true';
}

function loadFrame(frame) {
  if (frame < 0 || frame > lastFrame || loaded.has(frame)) return;
  const image = new Image();
  const record = { image, ready: false };
  loaded.set(frame, record);
  activeLoads += 1;
  image.fetchPriority = frame === desiredFrame ? 'high' : 'low';
  image.src = `frames/${String(frame).padStart(3, '0')}.webp`;
  image.decode().then(() => {
    record.ready = true;
    if (frame === desiredFrame && !reducedMotion.matches) drawFrame(frame);
  }).catch(() => {
    loaded.set(frame, { ready: false });
  }).finally(() => {
    activeLoads -= 1;
    if (started && !reducedMotion.matches) loadFrame(desiredFrame);
    prefetch();
  });
}

function prefetch() {
  if (!started || reducedMotion.matches) return;
  for (let distance = 1; distance <= 20 && activeLoads < preloadLimit; distance += 1) {
    loadFrame(desiredFrame + distance);
    if (activeLoads < preloadLimit) loadFrame(desiredFrame - distance);
  }
  for (const [frame, record] of loaded) {
    if (record.ready && Math.abs(frame - desiredFrame) > 34) loaded.delete(frame);
  }
}

function display() {
  pending = false;
  const travel = Math.max(1, journey.offsetHeight - stage.offsetHeight);
  const progress = reducedMotion.matches ? 0 : Math.min(1, Math.max(0, -journey.getBoundingClientRect().top / travel));
  desiredFrame = Math.round(progress * lastFrame);
  indicator.style.transform = `scaleX(${progress})`;
  const position = Math.max(0, Math.min(3, (progress - .085) * 4.2));
  const nearest = Math.round(position);
  chapters.forEach((chapter, index) => {
    chapter.style.opacity = String(Math.max(0, 1 - 1.55 * Math.abs(position - index)));
    chapter.setAttribute('aria-hidden', String(index !== nearest));
  });
  if (reducedMotion.matches) {
    canvas.removeAttribute('data-ready');
    paintedFrame = -1;
    return;
  }
  if (progress > 0) started = true;
  if (!started) return;
  if (activeLoads < totalLoadLimit) loadFrame(desiredFrame);
  if (loaded.get(desiredFrame)?.ready) {
    drawFrame(desiredFrame);
  } else {
    for (let distance = 1; distance <= 3; distance += 1) {
      const nearestLoaded = [desiredFrame - distance, desiredFrame + distance].find(frame => loaded.get(frame)?.ready);
      if (nearestLoaded === undefined) continue;
      drawFrame(nearestLoaded);
      break;
    }
  }
  prefetch();
}

function scheduleDisplay() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(display);
}

addEventListener('scroll', scheduleDisplay, { passive: true });
addEventListener('resize', scheduleDisplay, { passive: true });
reducedMotion.addEventListener('change', scheduleDisplay);
addEventListener('load', () => {
  if (reducedMotion.matches || navigator.connection?.saveData) return;
  setTimeout(() => {
    started = true;
    scheduleDisplay();
  }, 230);
}, { once: true });
scheduleDisplay();

const dialog = document.querySelector('#reservation');
const form = dialog.querySelector('form');
const service = form.elements.soin;
const date = form.elements.date;
const recap = dialog.querySelector('#recap');
const steps = [...dialog.querySelectorAll('[data-step]')];
let step = 1;
let trigger;

function showStep(number) {
  step = number;
  steps.forEach(panel => { panel.hidden = Number(panel.dataset.step) !== number; });
  form.hidden = number === 3;
  service.disabled = number !== 1;
  date.disabled = number !== 2;
  [service, date, recap][number - 1].focus();
}

document.querySelectorAll('[data-book]').forEach(button => {
  button.addEventListener('click', () => {
    trigger = button;
    form.reset();
    service.value = button.dataset.book;
    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    date.min = today.toISOString().slice(0, 10);
    dialog.showModal();
    showStep(service.value ? 2 : 1);
  });
});

form.addEventListener('submit', event => {
  event.preventDefault();
  if (step === 1) {
    showStep(2);
    return;
  }
  const selected = service.selectedOptions[0].textContent;
  const preferred = date.value
    ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(date.value))
    : 'Pas de préférence';
  recap.textContent = `${selected}\nDate souhaitée · ${preferred}`;
  showStep(3);
});
dialog.querySelectorAll('[data-back]').forEach(button => button.addEventListener('click', () => showStep(step - 1)));
dialog.querySelectorAll('.close, [data-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
dialog.addEventListener('close', () => { if (!dialog.open) trigger?.focus(); });
