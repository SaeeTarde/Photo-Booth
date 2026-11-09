import { buildSoloStrip } from './strip.js';
import { initDoodleFilter, attachTracker, startTracker, stopTracker, getComposite } from './doodle.js';

const $ = (id) => document.getElementById(id);

const video = $('local');
const status = $('status');
const snapBtn = $('snap');
const countdown = $('countdown');
const flash = $('flash');
const result = $('result');
const stripCanvas = $('strip');

const SRC = 480;   // each photo is a 480x480 centre crop
const SHOTS = 4;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let stream = null;
let busy = false;
let shots = [];
let filter = 'none';

// ---------- bunny filter ----------
attachTracker('local', video, $('local-overlay'));
let filterOn = false;
let modelsLoaded = false;

$('filter-toggle').addEventListener('click', async () => {
  const btn = $('filter-toggle');
  if (!modelsLoaded) {
    btn.textContent = '🐰 Loading…';
    await initDoodleFilter();
    modelsLoaded = true;
  }
  filterOn = !filterOn;
  btn.textContent = `🐰 Bunny filter: ${filterOn ? 'On' : 'Off'}`;
  filterOn ? startTracker('local') : stopTracker('local');
});

// ---------- camera ----------
async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    });
    video.srcObject = stream;
    await video.play().catch(() => {});
    status.textContent = '● Live';
    snapBtn.disabled = false;
  } catch (err) {
    console.error(err);
    status.textContent = 'Camera blocked. Allow camera access and refresh.';
  }
}

// ---------- capture ----------
function grabShot() {
  const source = getComposite('local') || video; // bunny canvas if the filter is on
  const vw = source.videoWidth ?? source.width;
  const vh = source.videoHeight ?? source.height;
  const s = Math.min(vw, vh);
  const sx = (vw - s) / 2;
  const sy = (vh - s) / 2;

  const c = document.createElement('canvas');
  c.width = c.height = SRC;
  const ctx = c.getContext('2d');
  ctx.translate(SRC, 0);   // mirror, so the photo matches the preview
  ctx.scale(-1, 1);
  ctx.drawImage(source, sx, sy, s, s, 0, 0, SRC, SRC);
  return c;
}

function fireFlash() {
  flash.classList.remove('go');
  void flash.offsetWidth; // restart the animation
  flash.classList.add('go');
}

function render() {
  buildSoloStrip(stripCanvas, shots, { filter });
}

async function runSession() {
  if (busy) return;
  busy = true;
  snapBtn.disabled = true;
  result.hidden = true;
  shots = [];

  for (let i = 0; i < SHOTS; i++) {
    status.textContent = `Photo ${i + 1} of ${SHOTS}`;
    for (let n = i === 0 ? 3 : 2; n > 0; n--) {
      countdown.textContent = n;
      await sleep(900);
    }
    countdown.textContent = '';
    fireFlash();
    shots.push(grabShot());
    await sleep(500);
  }

  status.textContent = '● Live';
  render();
  result.hidden = false;
  busy = false;
  snapBtn.disabled = false;
}

// ---------- events ----------
snapBtn.addEventListener('click', runSession);

$('filters').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-filter]');
  if (!btn) return;
  filter = btn.dataset.filter;
  document.querySelectorAll('#filters button').forEach((b) => b.classList.toggle('active', b === btn));
  render();
});

$('download').addEventListener('click', () => {
  const a = document.createElement('a');
  a.download = `solo-booth-${Date.now()}.png`;
  a.href = stripCanvas.toDataURL('image/png');
  a.click();
});

$('retake').addEventListener('click', () => (result.hidden = true));

$('home').addEventListener('click', () => {
  stopTracker('local');
  stream?.getTracks().forEach((t) => t.stop());
  location.href = '/';
});

startCamera();