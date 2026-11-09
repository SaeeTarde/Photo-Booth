import { createSocket } from './socket.js';
import { startCall } from './webrtc.js';
import { captureSession } from './capture.js';
import { buildStrip } from './strip.js';
import { initDoodleFilter, attachTracker, startTracker, stopTracker } from './doodle.js';
import { initChat } from './chat.js';

const $ = (id) => document.getElementById(id);
const room = location.pathname.split('/').pop().toUpperCase();

const localVideo = $('local');
const remoteVideo = $('remote');
const remoteFrame = $('remote-frame');
const status = $('status');
const snapBtn = $('snap');
const countdown = $('countdown');
const flash = $('flash');
const result = $('result');
const stripCanvas = $('strip');

let partnerLive = false;
let busy = false;
let shots = [];
let filter = 'none';
let localStream = null;

attachTracker('local', localVideo, $('local-overlay'));
attachTracker('remote', remoteVideo, $('remote-overlay'));

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
  filterOn ? (startTracker('local'), startTracker('remote')) : (stopTracker('local'), stopTracker('remote'));
});

const updateSnap = () => (snapBtn.disabled = !partnerLive || busy);

// ---------- room UI ----------
$('room-code').textContent = room;
$('copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(location.href);
  $('copy').textContent = 'Copied!';
  setTimeout(() => ($('copy').textContent = 'Copy invite link'), 1500);
});

remoteVideo.addEventListener('playing', () => {
  remoteFrame.classList.remove('waiting');
  partnerLive = true;
  updateSnap();
});

// ---------- snap session ----------
function fireFlash() {
  flash.classList.remove('go');
  void flash.offsetWidth; // restart the animation
  flash.classList.add('go');
}

function render() {
  buildStrip(stripCanvas, shots, { filter, room });
}

async function runSession() {
  if (busy) return;
  busy = true;
  updateSnap();
  result.hidden = true;

  shots = await captureSession({
    localVideo,
    remoteVideo,
    onTick: (n, i) => {
      countdown.textContent = n;
      status.textContent = `Photo ${i + 1} of 4`;
    },
    onShot: () => {
      countdown.textContent = '';
      fireFlash();
    },
  });

  status.textContent = '● Live';
  render();
  result.hidden = false;
  busy = false;
  updateSnap();
}

// Either person can start it. The other side is told over the WebSocket.
snapBtn.addEventListener('click', () => {
  if (busy) return;
  socket.send('snap-start');
  runSession();
});

$('filters').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-filter]');
  if (!btn) return;
  filter = btn.dataset.filter;
  document.querySelectorAll('#filters button').forEach((b) => b.classList.toggle('active', b === btn));
  render();
});

$('download').addEventListener('click', () => {
  const a = document.createElement('a');
  a.download = `booth-${room}-${Date.now()}.png`;
  a.href = stripCanvas.toDataURL('image/png');
  a.click();
});

$('mic-toggle').addEventListener('click', () => {
  const track = localStream?.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  $('mic-toggle').textContent = `🎤 Mic: ${track.enabled ? 'On' : 'Off'}`;
});

$('retake').addEventListener('click', () => (result.hidden = true));

// ---------- signaling ----------
const socket = createSocket();
initChat(socket);

socket.on('snap-start', runSession);
socket.on('joined', ({ count }) => {
  status.textContent = count === 1 ? 'Waiting for your partner…' : 'Connecting…';
});
socket.on('peer-joined', () => (status.textContent = 'Partner arrived, connecting…'));
socket.on('peer-left', () => {
  remoteFrame.classList.add('waiting');
  partnerLive = false;
  updateSnap();
  status.textContent = 'Partner left. Waiting…';
});
socket.on('room-full', () => (status.textContent = 'This booth is full.'));

// ---------- start the call — ONE call only ----------
try {
  const call = await startCall({
    socket,
    localVideo,
    remoteVideo,
    onState: (state) => {
      if (state === 'connected' && !busy) status.textContent = '● Live';
      if (state === 'failed') status.textContent = 'Connection failed, try refreshing';
    },
  });
  localStream = call.stream;
  remoteVideo.play?.().catch(() => {
    status.textContent = 'Tap anywhere to enable sound';
    document.addEventListener('click', () => remoteVideo.play(), { once: true });
  });
  socket.join(room);
} catch (err) {
  console.error(err);
  status.textContent = 'Camera blocked. Allow camera access and refresh.';
}

$('home').addEventListener('click', () => {
  localStream?.getTracks().forEach((t) => t.stop());
  location.href = '/';
});