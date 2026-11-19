/* Hélior — calibre H-01
 * Procedural watch built with three.js. The scroll position (smoothed like a
 * crown under the thumb) drives one continuous timeline: crown, exploded view,
 * escapement close-up, finishes, dial selection, appointment.
 */
import * as THREE from './vendor/three.module.min.js';
import { EffectComposer } from './vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/addons/postprocessing/RenderPass.js';
import { BokehPass } from './vendor/addons/postprocessing/BokehPass.js';
import { UnrealBloomPass } from './vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/addons/postprocessing/OutputPass.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
const mobileMQ = matchMedia('(max-width: 820px)');

/* =========================================================================
   1. Scroll timeline, chapter nav, power-reserve gauge (independent of WebGL)
   ========================================================================= */
const chapters = $$('[data-chapter]');
const LAST = chapters.length - 1;
let centers = [];
function measure() {
  const vh = innerHeight;
  centers = chapters.map((el) => {
    const r = el.getBoundingClientRect();
    return r.top + scrollY + r.height / 2 - vh / 2;
  });
  centers[0] = Math.min(centers[0], 0);
}
function scrollT() {
  const y = scrollY;
  if (y <= centers[0]) return 0;
  for (let i = 0; i < LAST; i++) {
    if (y < centers[i + 1]) return i + (y - centers[i]) / (centers[i + 1] - centers[i]);
  }
  return LAST;
}
measure();
addEventListener('resize', measure);
addEventListener('load', measure);
if (document.fonts) document.fonts.ready.then(measure);

const navLinks = $$('[data-nav]');
navLinks.forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault();
  const i = +a.dataset.nav;
  measure();
  scrollTo({ top: Math.max(0, centers[i]), behavior: reduceMQ.matches ? 'auto' : 'smooth' });
}));
$$('a[href="#rdv"]').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault();
  measure();
  scrollTo({ top: Math.max(0, centers[LAST]), behavior: reduceMQ.matches ? 'auto' : 'smooth' });
  setTimeout(() => $('#nom').focus({ preventScroll: true }), reduceMQ.matches ? 0 : 900);
}));

// power-reserve gauge ticks: 0 → 72 h along a half dial
const ticks = $('#reserve-ticks');
for (let h = 0; h <= 72; h += 6) {
  const a = Math.PI + (h / 72) * Math.PI;
  const r1 = 46, r2 = h % 24 === 0 ? 40 : 43;
  const x1 = 60 + Math.cos(a) * r1, y1 = 66 + Math.sin(a) * r1;
  const x2 = 60 + Math.cos(a) * r2, y2 = 66 + Math.sin(a) * r2;
  ticks.insertAdjacentHTML('beforeend', `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`);
  if (h % 24 === 0) {
    const xt = 60 + Math.cos(a) * 32, yt = 66 + Math.sin(a) * 32 + 2.5;
    ticks.insertAdjacentHTML('beforeend', `<text x="${xt.toFixed(1)}" y="${yt.toFixed(1)}">${h}</text>`);
  }
}
const needle = $('#reserve-needle');
const fill = $('#reserve-fill');
const reserveValue = $('#reserve-value');
let lastReserve = -1, lastActive = -1;
function updateChrome(t) {
  const p = clamp(t / LAST);
  needle.style.transform = `rotate(${-90 + 180 * p}deg)`;
  fill.style.strokeDashoffset = (145 * (1 - p)).toFixed(1);
  const h = Math.round(72 * p);
  if (h !== lastReserve) { reserveValue.textContent = `${h} h`; lastReserve = h; }
  const active = Math.round(t);
  if (active !== lastActive) {
    navLinks.forEach((a) => a.classList.toggle('is-active', +a.dataset.nav === active));
    lastActive = active;
  }
}

/* ---------- appointment form (local only) ---------- */
const DIAL_NAMES = { nuit: 'Bleu nuit soleillé', email: 'Émail grand feu', ardoise: 'Ardoise guillochée' };
const form = $('#rdv-form');
const status = $('#rdv-status');
const dateInput = $('#date');
{
  const d = new Date(); d.setDate(d.getDate() + 2);
  dateInput.min = d.toISOString().slice(0, 10);
}
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const nom = $('#nom'), email = $('#email');
  const okNom = nom.value.trim().length > 1;
  const okMail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
  nom.setAttribute('aria-invalid', String(!okNom));
  email.setAttribute('aria-invalid', String(!okMail));
  if (!okNom || !okMail) {
    status.textContent = !okNom ? 'Indiquez votre nom pour que nous puissions vous accueillir.' : 'Vérifiez l’adresse e-mail, elle doit contenir un « @ » et un domaine.';
    (!okNom ? nom : email).focus();
    return;
  }
  const when = dateInput.value
    ? new Date(dateInput.value + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    : 'une date à convenir';
  status.textContent = `Demande préparée pour ${nom.value.trim()} : cadran ${DIAL_NAMES[$('#cadran').value]}, ${when}. Démonstration, rien n’a été envoyé.`;
});

/* ---------- escapement sound (opt-in) ---------- */
let audio = null, soundOn = false;
const soundBtn = $('#sound');
soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  soundBtn.setAttribute('aria-pressed', String(soundOn));
  if (soundOn && !audio) {
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { audio = null; }
  }
  if (audio && audio.state === 'suspended') audio.resume();
});
function tick(tac) {
  if (!soundOn || !audio) return;
  const t = audio.currentTime;
  const len = 0.03;
  const buf = audio.createBuffer(1, Math.floor(audio.sampleRate * len), audio.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (audio.sampleRate * 0.0025));
  const src = audio.createBufferSource(); src.buffer = buf;
  const bp = audio.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = tac ? 3200 : 4300; bp.Q.value = 6;
  const g = audio.createGain(); g.gain.value = 0.5;
  src.connect(bp).connect(g).connect(audio.destination);
  src.start(t);
}

/* =========================================================================
   2. WebGL stage
   ========================================================================= */
const canvas = $('#scene');
const loader = $('.loader');
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch (err) {
  renderer = null;
}

if (!renderer) {
  document.documentElement.classList.add('no-webgl');
  loader.classList.add('done');
  const loop = () => { updateChrome(scrollT()); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
} else {
  buildStage(renderer);
}

function buildStage(renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  // photo studio: black room, softboxes and strip lights, so polished steel reads as it does in a product shot
  function studioEnvironment() {
    const env = new THREE.Scene();
    env.background = new THREE.Color(0x010203);
    const panel = (w, h, x, y, z, intensity, color = 0xffffff) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
    };
    panel(34, 12, 0, 30, 16, 5.5);               // overhead softbox
    panel(3.5, 36, -27, 4, 12, 9);               // left strip
    panel(3.5, 36, 27, 2, 8, 6.5, 0xffeed6);     // right strip, warm
    panel(46, 2.2, 0, -16, 24, 3.2);             // low strip: the bright line across the dial
    panel(10, 34, 10, 6, -30, 4.5, 0xc9dcff);    // cool rim from behind
    panel(70, 26, 0, 4, 46, 0.35, 0xdfe6f5);     // faint front bounce
    panel(14, 14, -18, -24, -10, 1.6, 0xffd9a8); // warm kicker low left
    return env;
  }
  scene.environment = pmrem.fromScene(studioEnvironment(), 0.015).texture;
  scene.environmentIntensity = 1.0;
  {
    const c = document.createElement('canvas'); c.width = 64; c.height = 1024;
    const g2 = c.getContext('2d');
    const lg = g2.createLinearGradient(0, 0, 0, 1024);
    lg.addColorStop(0, '#0d1528'); lg.addColorStop(0.55, '#0a1020'); lg.addColorStop(1, '#05080f');
    g2.fillStyle = lg; g2.fillRect(0, 0, 64, 1024);
    const bg = new THREE.CanvasTexture(c); bg.colorSpace = THREE.SRGBColorSpace;
    scene.background = bg;
  }

  const camera = new THREE.PerspectiveCamera(26, 1, 8, 900);

  const key = new THREE.DirectionalLight(0xffe6c2, 2.6); key.position.set(40, 50, 70); scene.add(key);
  key.castShadow = true;
  key.shadow.mapSize.set(3072, 3072);
  Object.assign(key.shadow.camera, { left: -52, right: 52, top: 52, bottom: -52, near: 10, far: 260 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.04; key.shadow.radius = 4;
  const rim = new THREE.DirectionalLight(0x8fb0ff, 1.6); rim.position.set(-60, -20, -40); scene.add(rim);
  const fillL = new THREE.DirectionalLight(0xffffff, 0.5); fillL.position.set(-30, 40, 30); scene.add(fillL);

  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  /* ---------------- textures ---------------- */
  function canvasTexture(size, draw, opts = {}) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    draw(ctx, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    if (opts.span) { // map shape coordinates (mm) into the texture: centred, `span` mm wide
      tex.repeat.set(1 / opts.span, 1 / opts.span);
      tex.offset.set(0.5, 0.5);
    }
    tex.userData.redraw = (fn) => { fn(ctx, size); tex.needsUpdate = true; };
    return tex;
  }

  const cotesTex = canvasTexture(1024, (ctx, s) => {
    ctx.fillStyle = '#9aa0a8'; ctx.fillRect(0, 0, s, s);
    ctx.save();
    ctx.translate(s / 2, s / 2); ctx.rotate(-0.62); ctx.translate(-s, -s);
    const w = s / 11;
    for (let x = 0; x < s * 2; x += w) {
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, '#80868f'); g.addColorStop(0.42, '#f3f5f8'); g.addColorStop(0.58, '#e3e7ec'); g.addColorStop(1, '#7c828b');
      ctx.fillStyle = g; ctx.fillRect(x, 0, w + 1, s * 2);
    }
    ctx.restore();
  }, { span: 34 });

  const perlageTex = canvasTexture(2048, (ctx, s) => {
    ctx.fillStyle = '#9da3ab'; ctx.fillRect(0, 0, s, s);
    const step = s / 42, r = step * 0.82;
    let row = 0;
    for (let y = 0; y < s + step; y += step * 0.78, row++) {
      for (let x = (row % 2) * step / 2; x < s + step; x += step) {
        let g;
        if (ctx.createConicGradient) {
          g = ctx.createConicGradient(Math.random() * TAU, x, y);
          for (let i = 0; i <= 10; i++) g.addColorStop(i / 10, i % 2 ? '#dfe3e8' : '#7a8088');
        } else {
          g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
          g.addColorStop(0, '#f4f6f8'); g.addColorStop(1, '#8b9199');
        }
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(50,55,62,.35)'; ctx.lineWidth = 1.2; ctx.stroke();
      }
    }
  });

  const sunburstSteelTex = canvasTexture(1024, (ctx, s) => {
    const c = s / 2;
    ctx.fillStyle = '#c9ced5'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      const a = (i / 900) * TAU, a2 = ((i + 1) / 900) * TAU;
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '40,45,52'},${(0.04 + Math.random() * 0.12).toFixed(3)})`;
      ctx.beginPath(); ctx.moveTo(c, c);
      ctx.lineTo(c + Math.cos(a) * s, c + Math.sin(a) * s);
      ctx.lineTo(c + Math.cos(a2) * s, c + Math.sin(a2) * s);
      ctx.fill();
    }
  }, { span: 10 });

  /* ---------------- dials ---------------- */
  const DIALS = {
    nuit: { pattern: 'sunburst', c0: '#2a4f93', c1: '#0b1733', ink: '#efe2c4', fine: 'rgba(239,226,196,.62)', metal: 0.55, rough: 0.3, coat: 0.4, trim: 'gold', ring: 0x0d1a38 },
    email: { pattern: 'enamel', c0: '#fbf8f1', c1: '#e8e2d5', ink: '#161a22', fine: 'rgba(22,26,34,.7)', metal: 0.0, rough: 0.12, coat: 1.0, trim: 'blued', ring: 0xe9e4d8 },
    ardoise: { pattern: 'guilloche', c0: '#575c65', c1: '#2b2f36', ink: '#f0f2f4', fine: 'rgba(240,242,244,.55)', metal: 0.55, rough: 0.32, coat: 0.3, trim: 'steel', ring: 0x2c3037 },
  };
  const R_DIAL = 17.3;
  const SUB = { x: 0, y: -8, r: 3.55 };

  function drawDial(ctx, s, v) {
    const c = s / 2, R = s / 2;
    ctx.save();
    ctx.clearRect(0, 0, s, s);
    const g = ctx.createRadialGradient(c * 0.92, c * 0.82, 0, c, c, R);
    g.addColorStop(0, v.c0); g.addColorStop(1, v.c1);
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);

    if (v.pattern === 'sunburst') {
      const n = 1440;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU, a2 = ((i + 1) / n) * TAU;
        const light = Math.random() < 0.5;
        ctx.fillStyle = light ? `rgba(160,190,255,${(Math.random() * 0.07).toFixed(3)})` : `rgba(0,0,10,${(Math.random() * 0.12).toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(c, c);
        ctx.lineTo(c + Math.cos(a) * R * 1.5, c + Math.sin(a) * R * 1.5);
        ctx.lineTo(c + Math.cos(a2) * R * 1.5, c + Math.sin(a2) * R * 1.5);
        ctx.fill();
      }
    } else if (v.pattern === 'guilloche') {
      ctx.lineWidth = s * 0.0009;
      for (let k = 0; k < 220; k++) {
        const a = (k / 220) * TAU;
        ctx.strokeStyle = k % 2 ? 'rgba(255,255,255,.075)' : 'rgba(0,0,0,.12)';
        ctx.beginPath(); ctx.arc(c + Math.cos(a) * R * 0.16, c + Math.sin(a) * R * 0.16, R * 0.64, 0, TAU); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0,0,0,.18)';
      ctx.beginPath(); ctx.arc(c, c, R, 0, TAU); ctx.arc(c, c, R * 0.86, 0, TAU, true); ctx.fill();
    } else {
      for (let i = 0; i < 9000; i++) {
        ctx.fillStyle = `rgba(120,100,70,${(Math.random() * 0.035).toFixed(3)})`;
        ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
      }
    }

    // chemin de fer minute track
    ctx.strokeStyle = v.fine; ctx.lineWidth = s * 0.0014;
    ctx.beginPath(); ctx.arc(c, c, R * 0.955, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(c, c, R * 0.925, 0, TAU); ctx.stroke();
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU - Math.PI / 2;
      const five = i % 5 === 0;
      const r0 = five ? R * 0.905 : R * 0.925, r1 = R * 0.955;
      ctx.lineWidth = five ? s * 0.004 : s * 0.0018;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
      ctx.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
      ctx.stroke();
    }
    // five-minute numerals outside the track
    ctx.fillStyle = v.fine;
    ctx.font = `500 ${Math.round(s * 0.017)}px "IBM Plex Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 5; i <= 60; i += 5) {
      const a = (i / 60) * TAU - Math.PI / 2;
      ctx.save();
      ctx.translate(c + Math.cos(a) * R * 0.978, c + Math.sin(a) * R * 0.978);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillText(String(i).padStart(2, '0'), 0, 0);
      ctx.restore();
    }

    // signature
    ctx.fillStyle = v.ink;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(s * 0.012)}px`;
    ctx.font = `500 ${Math.round(s * 0.05)}px "Bodoni Moda", Didot, "Bodoni 72", Georgia, serif`;
    ctx.fillText('HÉLIOR', c + s * 0.006, c - R * 0.4);
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(s * 0.006)}px`;
    ctx.font = `400 ${Math.round(s * 0.0145)}px "IBM Plex Mono", ui-monospace, monospace`;
    ctx.fillStyle = v.fine;
    ctx.fillText('MANUFACTURE', c + s * 0.003, c - R * 0.315);
    ctx.fillText('CALIBRE H-01', c + s * 0.003, c + R * 0.19);

    // small seconds, azurage
    const sx = c + (SUB.x / R_DIAL) * R, sy = c - (SUB.y / R_DIAL) * R, sr = (SUB.r / R_DIAL) * R;
    ctx.save();
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.clip();
    ctx.fillStyle = v.pattern === 'enamel' ? 'rgba(0,0,0,.035)' : 'rgba(0,0,0,.16)';
    ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    ctx.lineWidth = s * 0.0007;
    for (let r = 2; r < sr; r += s * 0.0021) {
      ctx.strokeStyle = (Math.round(r) % 2) ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.1)';
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = v.fine;
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU - Math.PI / 2;
      const long = i % 10 === 0;
      ctx.lineWidth = long ? s * 0.0024 : s * 0.0011;
      const r0 = sr * (long ? 0.78 : 0.86), r1 = sr * 0.96;
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(a) * r0, sy + Math.sin(a) * r0);
      ctx.lineTo(sx + Math.cos(a) * r1, sy + Math.sin(a) * r1);
      ctx.stroke();
    }
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.font = `500 ${Math.round(s * 0.013)}px "IBM Plex Mono", ui-monospace, monospace`;
    ctx.fillStyle = v.fine;
    [[60, -90], [20, 30], [40, 150]].forEach(([n, deg]) => {
      const a = (deg * Math.PI) / 180;
      ctx.fillText(String(n), sx + Math.cos(a) * sr * 0.56, sy + Math.sin(a) * sr * 0.56);
    });
    ctx.restore();
  }

  let currentDial = 'nuit';
  const dialTex = canvasTexture(2048, (ctx, s) => drawDial(ctx, s, DIALS[currentDial]));

  const grainTex = canvasTexture(512, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let i = 0; i < s * s; i++) {
      const x = i % s, y = (i / s) | 0;
      const cell = Math.sin(x * 0.31 + Math.sin(y * 0.13) * 3) * Math.sin(y * 0.29 + Math.sin(x * 0.11) * 3);
      const v = 150 + cell * 40 + (Math.random() - 0.5) * 70;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, { linear: true });
  grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping; grainTex.repeat.set(3, 4);

  // sunburst: brushing direction runs radially from the centre (tangent-space vectors)
  const sunAniso = canvasTexture(512, (ctx, s) => {
    const img = ctx.createImageData(s, s), c = s / 2;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const dx = x - c + 0.5, dy = -(y - c + 0.5), l = Math.hypot(dx, dy) || 1, i = (y * s + x) * 4;
      img.data[i] = (dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = 255; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, { linear: true });

  /* ---------------- materials ---------------- */
  const M = {
    steel: new THREE.MeshPhysicalMaterial({ color: 0xe2e5ea, metalness: 1, roughness: 0.14 }),
    brushed: new THREE.MeshPhysicalMaterial({ color: 0xcdd2d8, metalness: 1, roughness: 0.32, anisotropy: 0.7 }),
    gold: new THREE.MeshPhysicalMaterial({ color: 0xe8c78c, metalness: 1, roughness: 0.2 }),
    gilt: new THREE.MeshPhysicalMaterial({ color: 0xd8b26a, metalness: 1, roughness: 0.3 }),
    blued: new THREE.MeshPhysicalMaterial({ color: 0x2c55c4, metalness: 0.85, roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.1 }),
    ruby: new THREE.MeshPhysicalMaterial({ color: 0xb0102e, metalness: 0, roughness: 0.04, clearcoat: 1, emissive: 0x2a0008 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.0, transmission: 1, thickness: 1.4, ior: 1.77, specularIntensity: 1, attenuationColor: 0xe8f0ff, attenuationDistance: 40 }),
    backGlass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.02, transmission: 1, thickness: 0.5, ior: 1.77 }),
    bridge: new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: cotesTex, bumpMap: cotesTex, bumpScale: 0.6, metalness: 1, roughness: 0.22, anisotropy: 0.6, anisotropyRotation: Math.PI / 2 - 0.62 }),
    plate: new THREE.MeshPhysicalMaterial({ color: 0xc4c9d0, map: perlageTex, bumpMap: perlageTex, bumpScale: 0.5, metalness: 1, roughness: 0.3 }),
    ratchet: new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: sunburstSteelTex, metalness: 1, roughness: 0.18 }),
    leather: new THREE.MeshPhysicalMaterial({ color: 0x2a1910, bumpMap: grainTex, bumpScale: 2.5, roughnessMap: grainTex, roughness: 0.75, metalness: 0, sheen: 1, sheenColor: 0x6e4c34, sheenRoughness: 0.5, clearcoat: 0.15, side: THREE.DoubleSide }),
    stitch: new THREE.MeshStandardMaterial({ color: 0xd8c7a4, roughness: 0.8 }),
    hair: new THREE.MeshPhysicalMaterial({ color: 0xa9bde2, metalness: 1, roughness: 0.2 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0a0d14, metalness: 0.2, roughness: 0.6 }),
    dial: new THREE.MeshPhysicalMaterial({ map: dialTex, metalness: 0.55, roughness: 0.3, clearcoat: 0.4, anisotropy: 0.9, anisotropyMap: sunAniso }),
    ring: new THREE.MeshPhysicalMaterial({ color: 0x0d1a38, metalness: 0.4, roughness: 0.4 }),
    trim: new THREE.MeshPhysicalMaterial({ color: 0xe8c78c, metalness: 1, roughness: 0.16 }),
    hand: new THREE.MeshPhysicalMaterial({ color: 0xe8c78c, metalness: 1, roughness: 0.14 }),
    secHand: new THREE.MeshPhysicalMaterial({ color: 0x2c55c4, metalness: 0.85, roughness: 0.2, clearcoat: 0.8 }),
  };
  const TRIMS = {
    gold: { color: 0xe8c78c, metalness: 1, roughness: 0.16, clearcoat: 0 },
    blued: { color: 0x2a50bd, metalness: 0.85, roughness: 0.2, clearcoat: 0.9 },
    steel: { color: 0xeef0f3, metalness: 1, roughness: 0.12, clearcoat: 0 },
  };

  /* ---------------- geometry helpers ---------------- */
  const ext = (shape, depth, bevel = 0.06, segs = 2, curveSegments = 32) => new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segs, curveSegments,
  });
  const circleShape = (r, x = 0, y = 0) => { const s = new THREE.Shape(); s.absarc(x, y, r, 0, TAU, false); return s; };
  const holePath = (r, x = 0, y = 0) => { const p = new THREE.Path(); p.absarc(x, y, r, 0, TAU, true); return p; };
  const lathe = (pts, segs = 180) => {
    const g = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), segs);
    g.rotateX(Math.PI / 2); // lathe axis Y → watch axis Z
    return g;
  };
  const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m;
  };

  function gearShape(R, n, h, { hub = 0.6, spokes = 0, rim = 0.55, club = false } = {}) {
    const s = new THREE.Shape();
    const step = TAU / n;
    const prof = club ? [[0, 0], [0.12, 1], [0.32, 1], [0.62, 0]] : [[0, 0], [0.22, 1], [0.48, 1], [0.7, 0]];
    let first = true;
    for (let i = 0; i < n; i++) {
      for (const [f, up] of prof) {
        const a = i * step + f * step;
        const r = up ? R : R - h;
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (first) { s.moveTo(x, y); first = false; } else s.lineTo(x, y);
      }
    }
    s.closePath();
    const inner = R - h - rim;
    const hubR = hub + 0.35;
    if (spokes && inner - hubR > 0.5) {
      const half = 0.28;
      for (let k = 0; k < spokes; k++) {
        const a0 = (k / spokes) * TAU + half / hubR, a1 = ((k + 1) / spokes) * TAU - half / hubR;
        const b0 = (k / spokes) * TAU + half / inner, b1 = ((k + 1) / spokes) * TAU - half / inner;
        const p = new THREE.Path();
        p.moveTo(Math.cos(a0) * hubR, Math.sin(a0) * hubR);
        p.lineTo(Math.cos(b0) * inner, Math.sin(b0) * inner);
        p.absarc(0, 0, inner, b0, b1, false);
        p.lineTo(Math.cos(a1) * hubR, Math.sin(a1) * hubR);
        p.absarc(0, 0, hubR, a1, a0, true);
        s.holes.push(p);
      }
    }
    s.holes.push(holePath(hub * 0.45));
    return s;
  }

  function ratchetShape(R, n, h) {
    const s = new THREE.Shape();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, a2 = ((i + 1) / n) * TAU;
      const p1 = [Math.cos(a) * R, Math.sin(a) * R];
      const p2 = [Math.cos(a2) * (R - h), Math.sin(a2) * (R - h)];
      if (i === 0) s.moveTo(...p1); else s.lineTo(...p1);
      s.lineTo(...p2);
    }
    s.closePath();
    s.holes.push(holePath(0.9));
    return s;
  }

  function armShape(points, w) {
    const P = points.map(([x, y]) => new THREE.Vector2(x, y));
    const n = P.length, N = [];
    for (let i = 0; i < n; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
      const d = b.clone().sub(a).normalize();
      const nn = new THREE.Vector2(-d.y, d.x);
      if (i > 0 && i < n - 1) {
        const d1 = P[i].clone().sub(P[i - 1]).normalize();
        nn.multiplyScalar(1 / Math.max(nn.dot(new THREE.Vector2(-d1.y, d1.x)), 0.5));
      }
      N.push(nn);
    }
    const L = P.map((p, i) => p.clone().addScaledVector(N[i], w));
    const Rr = P.map((p, i) => p.clone().addScaledVector(N[i], -w));
    const s = new THREE.Shape();
    s.moveTo(L[0].x, L[0].y);
    for (let i = 1; i < n; i++) s.lineTo(L[i].x, L[i].y);
    const ae = Math.atan2(N[n - 1].y, N[n - 1].x);
    s.absarc(P[n - 1].x, P[n - 1].y, w, ae, ae - Math.PI, true);
    for (let i = n - 1; i >= 0; i--) s.lineTo(Rr[i].x, Rr[i].y);
    const as = Math.atan2(-N[0].y, -N[0].x);
    s.absarc(P[0].x, P[0].y, w, as, as - Math.PI, true);
    return s;
  }

  function strapGeometry(curve, segs, w0, w1, th) {
    const pos = [], index = [], uv = [];
    for (let i = 0; i <= segs; i++) {
      const tt = i / segs;
      const p = curve.getPoint(tt), tan = curve.getTangent(tt);
      const n = new THREE.Vector3(0, -tan.z, tan.y).normalize();
      const w = lerp(w0, w1, tt) / 2, r = Math.min(0.7, th / 2);
      // rounded-edge rectangle cross-section, 10 points
      const ring = [[-w + r, 1], [w - r, 1], [w, 0.55], [w, -0.55], [w - r, -1], [-w + r, -1], [-w, -0.55], [-w, 0.55]];
      ring.forEach(([x, k], j) => { pos.push(x, p.y + n.y * k * th / 2, p.z + n.z * k * th / 2); uv.push(x / 20 + 0.5, tt * 2.2); });
    }
    const R = 8;
    for (let i = 0; i < segs; i++) {
      for (let j = 0; j < R; j++) {
        const a = i * R + j, b = i * R + ((j + 1) % R), c = (i + 1) * R + j, d = (i + 1) * R + ((j + 1) % R);
        index.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  }

  function facets(tris) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(2), 3));
    g.computeVertexNormals();
    return g;
  }
  // applied index: a bar with a polished roof ridge (half width w, half length l)
  function roofBar(w, l, h0, h) {
    const a = [-w, -l, 0], b = [w, -l, 0], c = [w, l, 0], d = [-w, l, 0];
    const A = [-w, -l, h0], B = [w, -l, h0], C = [w, l, h0], D = [-w, l, h0];
    const R1 = [0, -l, h], R2 = [0, l, h];
    const q = (p1, p2, p3, p4) => [[p1, p2, p3], [p1, p3, p4]];
    return facets([...q(B, C, R2, R1), ...q(D, A, R1, R2), [A, B, R1], [C, D, R2], ...q(a, b, B, A), ...q(b, c, C, B), ...q(c, d, D, C), ...q(d, a, A, D)]);
  }

  function polyShape(points) {
    const s = new THREE.Shape();
    points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    s.closePath();
    return s;
  }

  /* ---------------- the watch ---------------- */
  const watch = new THREE.Group();
  scene.add(watch);
  const G = {};
  ['back', 'case', 'plate', 'train', 'bridges', 'dial', 'hands', 'bezel', 'glass'].forEach((k) => {
    G[k] = new THREE.Group(); watch.add(G[k]);
  });
  const anchors = {};
  const anchor = (name, group, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); group.add(o); anchors[name] = o; };

  // --- middle case, lugs, crown
  mesh(lathe([[17.9, -4.2], [17.9, -5.0], [18.7, -5.0], [19.7, -4.5], [20.3, -3.0], [20.5, -0.2], [20.3, 2.4], [19.7, 3.5], [18.9, 4.0], [17.9, 4.0], [17.9, -4.2]]), M.brushed, G.case);
  {
    const s = new THREE.Shape();
    s.moveTo(16, -4.0); s.lineTo(19.6, -4.4);
    s.quadraticCurveTo(25.0, -4.6, 25.6, -2.2);
    s.lineTo(25.8, 0.3);
    s.quadraticCurveTo(24.4, 2.8, 19.2, 3.1);
    s.lineTo(16, 3.1); s.closePath();
    const geo = ext(s, 2.4, 0.35, 4, 24);
    geo.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
    [10.3, -12.7].forEach((x) => {
      mesh(geo, M.steel, G.case, x, 0, 0);
      const bot = mesh(geo, M.steel, G.case, -x, 0, 0);
      bot.rotation.z = Math.PI;
    });
    // leather strap with saddle stitching, both ends
    const curve = new THREE.CatmullRomCurve3([
      [0, 21.2, -0.9], [0, 26, -1.5], [0, 31, -3.2], [0, 35.5, -6.6], [0, 39.5, -12.0], [0, 42.5, -19.5], [0, 44.5, -28],
    ].map((p) => new THREE.Vector3(...p)));
    const strapGeo = strapGeometry(curve, 90, 20.2, 17.0, 1.7);
    const stitchGeo = new THREE.BoxGeometry(0.16, 0.75, 0.1);
    const STITCH = 2 * 56;
    for (const flip of [0, Math.PI]) {
      const grp = new THREE.Group(); grp.rotation.z = flip; G.case.add(grp);
      mesh(strapGeo, M.leather, grp);
      const st = new THREE.InstancedMesh(stitchGeo, M.stitch, STITCH);
      const dummy = new THREE.Object3D();
      let k = 0;
      for (let i = 0; i < STITCH / 2; i++) {
        const tt = 0.04 + (i / (STITCH / 2)) * 0.9;
        const p = curve.getPoint(tt), tan = curve.getTangent(tt);
        const w = lerp(20.2, 17.0, tt) / 2 - 0.9;
        const nrm = new THREE.Vector3(0, -tan.z, tan.y).normalize();
        for (const sx of [-1, 1]) {
          dummy.position.copy(p).addScaledVector(nrm, 0.86); dummy.position.x = sx * w;
          dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
          dummy.updateMatrix(); st.setMatrixAt(k++, dummy.matrix);
        }
      }
      grp.add(st);
    }
  }
  const crown = new THREE.Group();
  crown.position.set(20.2, 0, -0.3);
  G.case.add(crown);
  {
    const stem = new THREE.CylinderGeometry(1.0, 1.0, 1.6, 32); stem.rotateZ(Math.PI / 2);
    mesh(stem, M.steel, crown, 0.8, 0, 0);
    const k = new THREE.Shape();
    const n = 36;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, a2 = ((i + 0.5) / n) * TAU;
      const p = [Math.cos(a) * 2.75, Math.sin(a) * 2.75];
      if (i === 0) k.moveTo(...p); else k.lineTo(...p);
      k.lineTo(Math.cos(a2) * 2.5, Math.sin(a2) * 2.5);
    }
    k.closePath();
    const kg = ext(k, 2.6, 0.18, 2, 8); kg.rotateY(Math.PI / 2);
    mesh(kg, M.steel, crown, 1.5, 0, 0);
    const cap = new THREE.CylinderGeometry(1.4, 1.4, 0.2, 48); cap.rotateZ(Math.PI / 2);
    mesh(cap, M.gold, crown, 4.42, 0, 0);
  }
  anchor('case', G.case, 20.5, -12, 0);

  // --- caseback with sapphire
  mesh(lathe([[13.2, -5.0], [18.6, -5.0], [18.3, -6.1], [17.4, -6.6], [13.6, -6.6], [13.2, -6.3], [13.2, -5.0]]), M.steel, G.back);
  {
    const g = new THREE.CylinderGeometry(13.3, 13.3, 0.5, 96); g.rotateX(Math.PI / 2);
    mesh(g, M.backGlass, G.back, 0, 0, -6.2);
  }
  anchor('back', G.back, 18, -10, -6);

  // --- main plate (perlage)
  {
    const g = new THREE.CylinderGeometry(16.7, 16.7, 1.1, 160); g.rotateX(Math.PI / 2);
    mesh(g, M.plate, G.plate, 0, 0, -3.6);
  }
  anchor('plate', G.plate, 16.5, -6, -3.2);

  // --- going train (gilded wheels)
  const P = {
    barrel: [6.6, 7.2], center: [0, 0], third: [8.4, -4.6], fourth: [SUB.x, SUB.y], escape: [-5.4, -10.6], balance: [-9.7, -4.3], pallet: [-7.6, -7.9],
  };
  const wheel = (shape, depth, mat, [x, y], z) => {
    const grp = new THREE.Group(); grp.position.set(x, y, z); G.train.add(grp);
    mesh(ext(shape, depth, 0.05, 1, 24), mat, grp);
    const pin = new THREE.CylinderGeometry(0.42, 0.42, 1.8, 20); pin.rotateX(Math.PI / 2);
    mesh(pin, M.steel, grp, 0, 0, 0.2);
    return grp;
  };
  const barrel = wheel(gearShape(5.9, 84, 0.32, { hub: 1.6, spokes: 0, rim: 0 }), 1.0, M.gilt, P.barrel, -3.0);
  const center = wheel(gearShape(5.1, 72, 0.3, { hub: 0.7, spokes: 4 }), 0.32, M.gilt, P.center, -2.1);
  const third = wheel(gearShape(4.0, 64, 0.26, { hub: 0.55, spokes: 5 }), 0.3, M.gilt, P.third, -2.5);
  const fourth = wheel(gearShape(3.5, 60, 0.24, { hub: 0.5, spokes: 5 }), 0.3, M.gilt, P.fourth, -2.75);
  const escape = wheel(gearShape(2.45, 20, 0.7, { hub: 0.45, spokes: 5, rim: 0.3, club: true }), 0.26, M.steel, P.escape, -2.35);
  anchor('train', G.train, 12.5, -10.5, -2.2);

  // pallet fork
  const pallet = new THREE.Group(); pallet.position.set(...P.pallet, -2.0); G.train.add(pallet);
  {
    mesh(ext(armShape([[1.5, -1.6], [0, 0], [-1.2, 2.0]], 0.28), 0.22, 0.04, 1), M.steel, pallet);
    mesh(ext(armShape([[-1.2, -0.9], [0, 0], [1.4, 0.6]], 0.22), 0.22, 0.04, 1), M.steel, pallet);
    const pj = new THREE.BoxGeometry(0.35, 0.7, 0.3);
    mesh(pj, M.ruby, pallet, -1.15, -0.95, 0.12);
    mesh(pj, M.ruby, pallet, 1.4, 0.55, 0.12);
  }

  // balance wheel + hairspring
  const balance = new THREE.Group(); balance.position.set(...P.balance, -1.9); G.train.add(balance);
  {
    const ring = circleShape(4.55); ring.holes.push(holePath(3.95));
    mesh(ext(ring, 0.55, 0.06, 2, 96), M.gilt, balance);
    const arm = new THREE.BoxGeometry(8.0, 0.55, 0.32);
    mesh(arm, M.gilt, balance, 0, 0, 0.12).rotation.z = 0.35;
    const hub = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 24); hub.rotateX(Math.PI / 2);
    mesh(hub, M.gilt, balance, 0, 0, 0.2);
    const screw = new THREE.CylinderGeometry(0.26, 0.26, 0.55, 12);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + 0.15;
      const m = mesh(screw, M.gold, balance, Math.cos(a) * 4.75, Math.sin(a) * 4.75, 0.27);
      m.rotation.z = a - Math.PI / 2;
    }
  }
  const hairspring = new THREE.Group(); hairspring.position.set(...P.balance, -1.2); G.train.add(hairspring);
  {
    const pts = []; const turns = 13;
    for (let i = 0; i <= 900; i++) {
      const th = (i / 900) * turns * TAU;
      const r = 0.95 + (2.85 - 0.95) * (i / 900);
      pts.push(new THREE.Vector3(Math.cos(th) * r, Math.sin(th) * r, 0));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    mesh(new THREE.TubeGeometry(curve, 1400, 0.03, 4, false), M.hair, hairspring);
  }

  // --- bridges (Côtes de Genève) with jewels and blued screws
  const BZ = -1.0;
  const bridge = (shape) => mesh(ext(shape, 0.75, 0.12, 2, 32), M.bridge, G.bridges, 0, 0, BZ);
  bridge(polyShape([[1.4, 3.6], [5.4, 0.6], [12.0, 2.0], [14.3, 7.6], [10.6, 12.6], [4.2, 13.4], [0.6, 9.5]]));
  bridge(armShape([[12.4, 1.2], [P.third[0], P.third[1]], [P.fourth[0], P.fourth[1]], [P.escape[0], P.escape[1]], [-7.4, -13.4]], 1.25));
  bridge(armShape([[-16.0, -1.0], [-13.0, -2.6], [P.balance[0], P.balance[1]]], 1.15));
  bridge(armShape([[-4.5, -5.6], [P.pallet[0], P.pallet[1]]], 0.75));
  [[P.third, 1.7], [P.fourth, 1.65], [P.escape, 1.55], [P.balance, 1.7]].forEach(([[x, y], r]) => bridge(circleShape(r, x, y)));

  const jewel = (x, y, z, big = false) => {
    const j = new THREE.CylinderGeometry(big ? 0.55 : 0.42, big ? 0.55 : 0.42, 0.16, 24); j.rotateX(Math.PI / 2);
    mesh(j, M.ruby, G.bridges, x, y, z);
    const ch = new THREE.TorusGeometry(big ? 0.85 : 0.68, 0.16, 10, 36);
    mesh(ch, M.gold, G.bridges, x, y, z);
  };
  const BT = BZ + 0.75 + 0.14;
  [P.third, P.fourth, P.escape, P.balance, P.pallet].forEach(([x, y], i) => jewel(x, y, BT, i === 3));

  const screwGeo = new THREE.CylinderGeometry(0.55, 0.6, 0.28, 24); screwGeo.rotateX(Math.PI / 2);
  const slotGeo = new THREE.BoxGeometry(1.0, 0.14, 0.1);
  const screwAt = (x, y) => {
    const g = new THREE.Group(); g.position.set(x, y, BT + 0.05); g.rotation.z = Math.random() * Math.PI; G.bridges.add(g);
    mesh(screwGeo, M.blued, g);
    mesh(slotGeo, M.dark, g, 0, 0, 0.12);
  };
  [[1.8, 9.8], [11.0, 3.4], [9.0, 12.4], [11.6, 0.3], [-6.4, -12.4], [4.2, -6.3], [-14.6, -1.6], [-5.0, -6.2]].forEach(([x, y]) => screwAt(x, y));

  // ratchet wheel on the barrel bridge, turned by the crown
  const ratchet = new THREE.Group(); ratchet.position.set(...P.barrel, BT - 0.05); G.bridges.add(ratchet);
  mesh(ext(ratchetShape(4.6, 46, 0.42), 0.4, 0.06, 1, 24), M.ratchet, ratchet);
  {
    const sc = new THREE.Group(); sc.position.set(0, 0, 0.5); ratchet.add(sc);
    const big = new THREE.CylinderGeometry(1.0, 1.05, 0.3, 32); big.rotateX(Math.PI / 2);
    mesh(big, M.blued, sc);
    mesh(new THREE.BoxGeometry(1.8, 0.2, 0.12), M.dark, sc, 0, 0, 0.14);
  }
  // crown wheel
  const crownWheel = new THREE.Group(); crownWheel.position.set(12.6, 6.0, BT - 0.05); G.bridges.add(crownWheel);
  mesh(ext(gearShape(1.9, 22, 0.32, { hub: 0.5 }), 0.36, 0.05, 1, 16), M.ratchet, crownWheel);
  anchor('bridges', G.bridges, 15.5, 2, 0);

  // --- dial
  mesh(new THREE.CircleGeometry(R_DIAL, 160), M.dial, G.dial, 0, 0, 0.6);
  const rehaut = mesh(lathe([[R_DIAL, 0.6], [17.95, 3.6], [17.95, 3.7], [R_DIAL - 0.05, 0.62]], 160), M.ring, G.dial);
  rehaut.renderOrder = 1;
  {
    const ig = roofBar(0.36, 1.3, 0.2, 0.42);
    for (let h = 0; h < 12; h++) {
      const a = Math.PI / 2 - (h / 12) * TAU;
      const r = 13.9;
      const place = (dx) => {
        const m = mesh(ig, M.trim, G.dial, Math.cos(a) * r + Math.cos(a - Math.PI / 2) * dx, Math.sin(a) * r + Math.sin(a - Math.PI / 2) * dx, 0.62);
        m.rotation.z = a - Math.PI / 2;
      };
      if (h === 0) { place(-0.55); place(0.55); } else if (h === 6) {
        // six o'clock index shortened above the small seconds
      } else place(0);
    }
    const subRing = new THREE.TorusGeometry(SUB.r, 0.07, 8, 96);
    mesh(subRing, M.trim, G.dial, SUB.x, SUB.y, 0.66);
  }
  anchor('dial', G.dial, 17.2, 7, 0.6);

  // --- hands (dauphine, faceted by bevel)
  function dauphine(len, w, tail) {
    // four facets meeting on a raised spine, like a hand-polished dauphine
    const h = w * 0.55;
    const T = [0, -tail, h * 0.5], L = [-w, 0, 0], P = [0, len, h * 0.15], Rr = [w, 0, 0], C = [0, 0, h];
    return facets([[T, C, L], [L, C, P], [T, Rr, C], [C, Rr, P], [T, L, P], [T, P, Rr]]);
  }
  const hourHand = new THREE.Group(); hourHand.position.z = 1.2; G.hands.add(hourHand);
  mesh(dauphine(9.6, 0.62, 1.8), M.hand, hourHand);
  const minuteHand = new THREE.Group(); minuteHand.position.z = 1.6; G.hands.add(minuteHand);
  mesh(dauphine(14.6, 0.5, 2.4), M.hand, minuteHand);
  {
    const cap = new THREE.CylinderGeometry(0.75, 0.75, 1.3, 32); cap.rotateX(Math.PI / 2);
    mesh(cap, M.hand, G.hands, 0, 0, 1.25);
  }
  const secHand = new THREE.Group(); secHand.position.set(SUB.x, SUB.y, 1.0); G.hands.add(secHand);
  {
    mesh(new THREE.BoxGeometry(0.12, 3.9, 0.06), M.secHand, secHand, 0, 1.05, 0);
    const cw = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 24); cw.rotateX(Math.PI / 2);
    mesh(cw, M.secHand, secHand, 0, 0, 0);
    mesh(cw, M.secHand, secHand, 0, -0.9, 0).scale.setScalar(0.7);
  }
  anchor('hands', G.hands, 15.5, 11, 1.4);

  // --- bezel
  mesh(lathe([[17.8, 4.0], [19.05, 4.0], [19.4, 4.35], [19.1, 5.2], [18.3, 5.7], [17.75, 5.6], [17.75, 4.0]]), M.steel, G.bezel);
  anchor('bezel', G.bezel, 19.2, 3, 5);

  // --- domed sapphire
  {
    const Rs = 120, th = Math.asin(17.85 / Rs);
    const g = new THREE.SphereGeometry(Rs, 128, 8, 0, TAU, 0, th);
    g.rotateX(Math.PI / 2);
    const m = mesh(g, M.glass, G.glass, 0, 0, 6.6 - Rs);
    m.renderOrder = 10;
  }
  anchor('glass', G.glass, 13, 13, 6);

  /* ---------------- dial switching ---------------- */
  function applyTrim(mat, key) { const t = TRIMS[key]; mat.color.setHex(t.color); mat.metalness = t.metalness; mat.roughness = t.roughness; mat.clearcoat = t.clearcoat; }
  function setDial(key) {
    if (!DIALS[key]) return;
    currentDial = key;
    const v = DIALS[key];
    dialTex.userData.redraw((ctx, s) => drawDial(ctx, s, v));
    M.dial.metalness = v.metal; M.dial.roughness = v.rough; M.dial.clearcoat = v.coat;
    M.dial.anisotropy = v.pattern === 'sunburst' ? 0.9 : v.pattern === 'guilloche' ? 0.35 : 0;
    M.ring.color.setHex(v.ring);
    applyTrim(M.trim, v.trim);
    applyTrim(M.hand, v.trim);
    if (v.trim === 'blued') applyTrim(M.secHand, 'steel'); else applyTrim(M.secHand, 'blued');
    $$('[data-dial]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.dial === key)));
    const sel = $('#cadran'); if (sel.value !== key) sel.value = key;
  }
  $$('[data-dial]').forEach((b) => b.addEventListener('click', () => setDial(b.dataset.dial)));
  $('#cadran').addEventListener('change', (e) => setDial(e.target.value));
  if (document.fonts) {
    Promise.all([
      document.fonts.load('500 40px "Bodoni Moda"'),
      document.fonts.load('500 20px "IBM Plex Mono"'),
    ]).then(() => setDial(currentDial)).catch(() => {});
  }

  /* ---------------- camera choreography ----------------
     One keyframe per chapter. rot: watch orientation, look: point of interest in
     watch space, dist: camera distance, shift: on-screen offset of the subject
     (fraction of the viewport; d = desktop, m = phone), e: exploded view,
     e2: upper layers slid aside to reveal the movement. */
  const K = [
    { rot: [0.0, 0.0, 0.0], look: [0, 0, 0], dist: 158, d: [0.2, 0], m: [0, 0.21], e: 0, e2: 0, dof: 0.00002 },
    { rot: [-0.32, -1.08, 0.08], look: [6, 0, 0], dist: 112, d: [0.21, 0], m: [0, 0.21], e: 0, e2: 0, dof: 0.00022 },
    { rot: [-0.98, -0.6, 0.45], look: [0, 0, -1], dist: 250, d: [0.17, 0], m: [-0.04, 0.19], e: 1, e2: 0, dof: 0.00008 },
    { rot: [-0.18, 0.22, 0.05], look: [-7.6, -6.4, -2], dist: 78, d: [0.21, 0], m: [0, 0.21], e: 1, e2: 1, dof: 0.00045 },
    { rot: [-0.62, 0.42, 0.3], look: [3, 1, -2], dist: 98, d: [0.25, 0], m: [0, 0.21], e: 0.3, e2: 1, dof: 0.00028 },
    { rot: [0.0, 0.0, 0.0], look: [0, 0, 0], dist: 150, d: [0.2, 0], m: [0, 0.21], e: 0, e2: 0, dof: 0.00002 },
    { rot: [0.18, 0.55, -0.12], look: [0, 0, 0], dist: 165, d: [-0.22, 0], m: [0, 0.24], e: 0, e2: 0, dof: 0.0001 },
  ];

  /* ---------------- shadows ---------------- */
  watch.traverse((o) => {
    if (!o.isMesh) return;
    const glassy = o.material === M.glass || o.material === M.backGlass;
    o.castShadow = !glassy && !o.isInstancedMesh;
    o.receiveShadow = !glassy;
  });

  /* ---------------- lens: MSAA, depth of field, bloom ---------------- */
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bokeh = new BokehPass(scene, camera, { focus: 150, aperture: 0.0002, maxblur: 0.009 });
  composer.addPass(bokeh);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.18, 0.5, 0.96);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* ---------------- interaction state ---------------- */
  let W = 1, H = 1, mobile = false;
  function resize() {
    W = innerWidth; H = innerHeight;
    mobile = mobileMQ.matches;
    const pr = Math.min(devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pr);
    renderer.setSize(W, H, false);
    composer.setPixelRatio(pr);
    composer.setSize(W, H);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener('resize', resize);

  let mx = 0, my = 0, smx = 0, smy = 0;
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    mx = (e.clientX / W) * 2 - 1; my = (e.clientY / H) * 2 - 1;
  }, { passive: true });

  const tagEls = $$('.tag');
  const tagsWrap = $('#tags');
  const v3 = new THREE.Vector3();
  const lookV = new THREE.Vector3();
  const eul = new THREE.Euler();

  let smoothT = scrollT();
  let simTime = 0, lastBeat = 0;
  let last = performance.now();
  let first = true;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (document.hidden) return;
    const reduce = reduceMQ.matches;

    const target = scrollT();
    smoothT = reduce ? target : smoothT + (target - smoothT) * (1 - Math.exp(-dt * 4.2));
    if (Math.abs(target - smoothT) < 1e-4) smoothT = target;
    const t = smoothT;
    updateChrome(t);

    // keyframe blend, holding briefly on each chapter
    const i = Math.min(LAST - 1, Math.floor(t));
    const f = smoothstep(0.1, 0.9, t - i);
    const a = K[i], b = K[i + 1];
    const L = mobile ? 'm' : 'd';
    const e = lerp(a.e, b.e, f), e2 = lerp(a.e2, b.e2, f);

    smx += (mx - smx) * (1 - Math.exp(-dt * 3));
    smy += (my - smy) * (1 - Math.exp(-dt * 3));
    const idle = reduce ? 0 : Math.sin(now * 0.00035) * 0.035;
    const par = reduce ? 0 : 1;
    watch.rotation.set(
      lerp(a.rot[0], b.rot[0], f) + smy * 0.09 * par,
      lerp(a.rot[1], b.rot[1], f) + smx * 0.14 * par + idle,
      lerp(a.rot[2], b.rot[2], f),
    );

    // explode
    G.back.position.z = -24 * e;
    G.case.position.z = -13 * e;
    G.plate.position.z = -4 * e;
    G.train.position.z = 0;
    G.bridges.position.z = 4 * e;
    const slide = (grp, base, z, k, delay) => {
      const s = smoothstep(delay, delay + 0.6, e2);
      grp.position.set(70 * s * k, 26 * s * k, base + z * e + 8 * s);
      grp.visible = s < 0.995;
    };
    slide(G.dial, 0.9, 10, 1.0, 0.3);
    slide(G.hands, 0.9, 16, 1.05, 0.2);
    slide(G.bezel, 0, 22, 1.1, 0.1);
    slide(G.glass, 0, 28, 1.15, 0.0);

    // camera: point of interest expressed in watch space
    eul.copy(watch.rotation);
    lookV.set(lerp(a.look[0], b.look[0], f), lerp(a.look[1], b.look[1], f), lerp(a.look[2], b.look[2], f)).applyEuler(eul);
    const aspect = W / H;
    const distMul = aspect < 1 ? Math.max(1, 1.18 / aspect) * 0.86 : 1;
    const dist = lerp(a.dist, b.dist, f) * distMul;
    camera.position.set(lookV.x, lookV.y, lookV.z + dist);
    camera.lookAt(lookV);
    const sx = lerp(a[L][0], b[L][0], f), sy = lerp(a[L][1], b[L][1], f);
    camera.setViewOffset(W, H, -sx * W, sy * H, W, H);

    // time: the crown sets the hands forward as you scroll, then they return to the exact hour
    const d = new Date();
    const offsetMin = t < 5 ? t * 48 : 240 * (LAST - t);
    const secs = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000 + offsetMin * 60;
    const m = (secs / 60) % 60, h = (secs / 3600) % 12;
    minuteHand.rotation.z = -(m / 60) * TAU;
    hourHand.rotation.z = -(h / 12) * TAU;
    const realS = d.getSeconds() + Math.floor(d.getMilliseconds() / 125) / 8;
    secHand.rotation.z = -(realS / 60) * TAU;

    crown.rotation.x = -t * TAU * 2.2;
    ratchet.rotation.z = t * TAU * 0.35;
    crownWheel.rotation.z = -t * TAU * 0.85;

    // movement: time slows down in the heart chapter
    const heart = 1 - clamp(Math.abs(t - 3) * 1.4);
    const rate = reduce ? 0 : lerp(1, 0.25, smoothstep(0, 1, heart));
    simTime += dt * rate;
    const phase = TAU * 4 * simTime;
    balance.rotation.z = 4.0 * Math.sin(phase);
    hairspring.rotation.z = 1.6 * Math.sin(phase);
    const breathe = 1 + 0.035 * Math.sin(phase);
    hairspring.scale.set(breathe, breathe, 1);
    pallet.rotation.z = 0.17 * Math.tanh(6 * Math.cos(phase));
    const beats = Math.floor(simTime * 8);
    if (beats !== lastBeat) { tick(beats % 2); lastBeat = beats; }
    escape.rotation.z = -beats * (Math.PI / 20);
    fourth.rotation.z = -(beats / 8 / 60) * TAU;
    third.rotation.z = (simTime / 450) * TAU;
    center.rotation.z = -(simTime / 3600) * TAU;
    barrel.rotation.z = (simTime / 28800) * TAU;

    key.position.set(40 + smx * 20, 50 - smy * 20, 70);

    // exploded-view labels
    const tagAlpha = smoothstep(1.5, 1.85, t) * (1 - smoothstep(2.2, 2.55, t));
    tagsWrap.style.opacity = tagAlpha.toFixed(3);
    if (tagAlpha > 0.001) {
      watch.updateMatrixWorld();
      const pos = tagEls.map((el) => {
        v3.setFromMatrixPosition(anchors[el.dataset.anchor].matrixWorld).project(camera);
        return { el, x: (v3.x * 0.5 + 0.5) * W, y: (-v3.y * 0.5 + 0.5) * H };
      }).sort((p, q) => p.y - q.y);
      const gap = mobile ? 20 : 34;
      let prev = -Infinity;
      for (const p of pos) {
        p.y = Math.max(p.y, prev + gap); prev = p.y;
        const x = Math.min(p.x, W - (mobile ? 120 : 230));
        p.el.style.transform = `translate(${x.toFixed(1)}px, ${(p.y - 7).toFixed(1)}px)`;
      }
    }

    bokeh.uniforms.focus.value = dist;
    bokeh.uniforms.aperture.value = lerp(a.dof, b.dof, f) * (mobile ? 0.6 : 1);
    composer.render(dt);
    if (first) { first = false; loader.classList.add('done'); }
  }
  requestAnimationFrame(frame);
}
