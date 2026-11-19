const pictureGeometry = {
  dial: { x: .433, y: .459, rx: .225, ry: .249, angle: .095 },
  case: { x: .436, y: .472, rx: .272, ry: .291, angle: .11 },
  aperture: { x: .425, y: .589, rx: .075, ry: .082, angle: -.05 },
};

function ellipsePath(path, geometry, width, height) {
  path.ellipse(
    geometry.x * width, geometry.y * height,
    geometry.rx * width, geometry.ry * height,
    geometry.angle, 0, Math.PI * 2,
  );
}

function caseOutline(width, height) {
  const outline = new Path2D();
  ellipsePath(outline, pictureGeometry.case, width, height);
  outline.rect(.676 * width, .419 * height, .081 * width, .102 * height);
  outline.rect(.291 * width, .677 * height, .291 * width, .129 * height);
  outline.rect(.319 * width, .164 * height, .294 * width, .092 * height);
  return outline;
}

function drawClipped(ctx, img, path, filter, inverse = false) {
  ctx.save();
  ctx.clip(path, inverse ? 'evenodd' : 'nonzero');
  ctx.filter = filter;
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

function drawConfiguredWatch(ctx, img, state, { width, height, magnification }) {
  const sourceWidth = img.naturalWidth;
  const sourceHeight = img.naturalHeight;
  const mobile = width <= 700;
  const scale = Math.min(width * (mobile ? .97 : .73) / sourceWidth, height * (mobile ? .60 : .98) / sourceHeight) * magnification;
  const x = (width - sourceWidth * scale) / 2;
  const y = height * (mobile ? .43 : .50) - sourceHeight * scale / 2;

  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  const caseMask = caseOutline(sourceWidth, sourceHeight);
  if (state.bracelet === 'non') {
    drawClipped(ctx, img, caseMask, 'none');
  } else {
    const strapMask = new Path2D();
    strapMask.rect(0, 0, sourceWidth, sourceHeight);
    strapMask.addPath(caseMask);
    ctx.drawImage(img, 0, 0);
    const strapFilter = state.bracelet === 'or'
      ? 'grayscale(1) brightness(1.5) sepia(.85) saturate(2.15)'
      : 'grayscale(1) brightness(1.65) contrast(.86)';
    drawClipped(ctx, img, strapMask, strapFilter, true);
  }

  const dialMask = new Path2D();
  ellipsePath(dialMask, pictureGeometry.dial, sourceWidth, sourceHeight);

  if (state.material === 'or') {
    const caseRing = new Path2D(caseMask);
    caseRing.addPath(dialMask);
    drawClipped(ctx, img, caseRing, 'grayscale(1) sepia(.65) saturate(1.85)', true);
  }

  const dialFilter = {
    noir: 'grayscale(.85) brightness(.75)',
    blanc: 'grayscale(1) brightness(2.3) contrast(.71)',
    rouge: 'grayscale(1) sepia(1) saturate(4.3) hue-rotate(324deg)',
  }[state.color] || 'none';

  drawClipped(ctx, img, dialMask, dialFilter);

  if (state.clockType === 'quartz') {
    const aperture = new Path2D();
    const geometry = pictureGeometry.aperture;
    ellipsePath(aperture, geometry, sourceWidth, sourceHeight);
    ctx.save();
    ctx.clip(aperture);
    ctx.filter = dialFilter;
    ctx.drawImage(
      img,
      sourceWidth * .34, sourceHeight * .27, sourceWidth * .14, sourceHeight * .14,
      (geometry.x - geometry.rx) * sourceWidth, (geometry.y - geometry.ry) * sourceHeight,
      geometry.rx * 2 * sourceWidth, geometry.ry * 2 * sourceHeight,
    );
    ctx.restore();
  }

  ctx.restore();
}

const canvas = document.getElementById('fabrya-stage');
const context = canvas.getContext('2d');
const statusLine = document.getElementById('fabrya-status');
const controls = [...document.querySelectorAll('.controls-container select')];
const imageAsset = new Image();
let ready = false;
let nextFrame = 0;
let magnification = 1;
let touchY;

function render() {
  nextFrame = 0;
  if (!ready) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.dataset.zoom = magnification.toFixed(3);
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  context.setTransform(scale, 0, 0, scale, 0, 0);
  const configuration = Object.fromEntries(controls.map(control => [control.id.slice(5), control.value]));
  drawConfiguredWatch(context, imageAsset, configuration, { width, height, magnification });
}

function queueRender() {
  if (!nextFrame) nextFrame = requestAnimationFrame(render);
}

for (const control of controls) {
  control.addEventListener('change', queueRender);
}

window.addEventListener('resize', queueRender);

function inspectAt(scale) {
  magnification = Math.max(1, Math.min(1.65, scale));
  queueRender();
}

canvas.addEventListener('keydown', event => {
  if (!['+', '=', '-'].includes(event.key)) return;
  event.preventDefault();
  inspectAt(magnification * (event.key === '-' ? .92 : 1.08));
});

canvas.addEventListener('wheel', event => {
  event.preventDefault();
  inspectAt(magnification * Math.exp(event.deltaY * .0012));
}, { passive: false });

canvas.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'touch') return;
  touchY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', event => {
  if (event.pointerType !== 'touch' || touchY === undefined) return;
  inspectAt(magnification * Math.exp((touchY - event.clientY) * .0018));
  touchY = event.clientY;
});

function finishTouch() {
  touchY = undefined;
}

canvas.addEventListener('pointerup', finishTouch);
canvas.addEventListener('pointercancel', finishTouch);
window.addEventListener('message', event => {
  const message = event.data;
  if (!message || message.type !== 'fabrya:configuration' || !message.values) return;
  for (const control of controls) {
    const value = message.values[control.id.slice(5)];
    if ([...control.options].some(option => option.value === value)) control.value = value;
  }
  queueRender();
});

imageAsset.onload = () => {
  ready = true;
  statusLine.textContent = 'Démonstration fictive';
  queueRender();
};
imageAsset.onerror = () => {
  statusLine.textContent = 'Image de démonstration indisponible';
};
imageAsset.src = 'watch.webp';
