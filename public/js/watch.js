import { createSocket } from './socket.js';
import { initChat } from './chat.js';

const $ = (id) => document.getElementById(id);
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// "W-" prefix keeps watch rooms separate from booth rooms
const code = location.pathname.split('/').pop().toUpperCase();

const screen = $('screen');
const wrap = $('screen-wrap');
const msg = $('stage-msg');
const status = $('status');
const shareBtn = $('share');
const stopBtn = $('stop-share');
const unmuteBtn = $('unmute');

const canShare = !!navigator.mediaDevices?.getDisplayMedia; // phones can watch, but not share

let pc = null;
let pending = [];          // ICE candidates that arrived early
let stream = null;         // my screen, while I'm sharing
let sharing = false;
let partnerSharing = false;
let partnerHere = false;
let noAudio = false;

// ---------- UI ----------
function refresh() {
  const live = wrap.classList.contains('live');
  shareBtn.hidden = sharing;
  stopBtn.hidden = !sharing;
  shareBtn.disabled = !canShare || partnerSharing;
  if (!canShare) shareBtn.title = "Screen sharing isn't supported on this device";

  if (sharing) {
    msg.textContent = partnerHere
      ? "🎬 You're sharing your screen. Your partner can see it."
      : '🎬 Screen ready. Waiting for your partner to join…';
    if (noAudio) msg.textContent += ' ⚠️ No audio is being shared. Share a Chrome tab and tick "Share tab audio".';
    status.textContent = partnerHere ? '● Sharing' : 'Waiting for partner…';
  } else if (partnerSharing) {
    msg.textContent = "Connecting to your partner's screen…";
    status.textContent = live ? '● Watching' : 'Connecting…';
  } else {
    msg.textContent = partnerHere
      ? 'Nobody is sharing yet. Hit "Share screen" to start 🍿'
      : 'Waiting for your partner to join… send them the invite link!';
    status.textContent = partnerHere ? '● Connected' : 'Waiting for partner…';
  }
}

// mute/unmute button: only for the viewer, and only while a screen is playing
function syncMuteBtn() {
  const show = wrap.classList.contains('live') && !sharing;
  unmuteBtn.hidden = !show;
  unmuteBtn.textContent = screen.muted ? '🔇 Tap to unmute' : '🔊 Mute';
}

function clearScreen() {
  screen.srcObject = null;
  wrap.classList.remove('live');
  syncMuteBtn();
}

async function playScreen() {
  screen.muted = false;
  try {
    await screen.play();
  } catch {
    // browser blocked sound until the user clicks something: start muted
    screen.muted = true;
    await screen.play().catch(() => {});
  }
  syncMuteBtn();
}

screen.addEventListener('playing', () => { wrap.classList.add('live'); refresh(); syncMuteBtn(); });
screen.addEventListener('volumechange', syncMuteBtn);

unmuteBtn.addEventListener('click', () => {
  screen.muted = !screen.muted;   // toggle
  screen.play().catch(() => {});
});

$('room-code').textContent = code;
$('copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(location.href);
  $('copy').textContent = 'Copied!';
  setTimeout(() => ($('copy').textContent = 'Copy invite link'), 1500);
});
$('fullscreen').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.(); // whole page, so the chat stays visible
});

// ---------- peer connection (one per sharing session) ----------
function closePeer() {
  if (pc) pc.close();
  pc = null;
  pending = [];
}

function newPeer() {
  closePeer();
  pc = new RTCPeerConnection(ICE);
  pc.onicecandidate = (e) => { if (e.candidate) socket.send('ice', { candidate: e.candidate }); };
  pc.ontrack = (e) => {
    screen.srcObject = e.streams[0];
    playScreen();
  };
  pc.onconnectionstatechange = () => {
    if (pc?.connectionState === 'failed') status.textContent = 'Connection failed. Stop and share again.';
  };
  return pc;
}

async function flushCandidates() {
  for (const c of pending) await pc.addIceCandidate(c).catch(console.error);
  pending = [];
}

// ---------- sharing ----------
function stopStream() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

function stopSharing() {
  if (!sharing) return;
  sharing = false;
  stopStream();
  closePeer();
  clearScreen();
  socket.send('share-stop');
  refresh();
}

shareBtn.addEventListener('click', async () => {
  if (sharing || partnerSharing) return;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
  } catch {
    return; // picker cancelled
  }
  if (partnerSharing) { stopStream(); return; } // partner started while the picker was open

  const video = stream.getVideoTracks()[0];
  video.contentHint = 'motion';                  // favour smooth movement over sharpness
  video.addEventListener('ended', stopSharing);  // browser's own "Stop sharing" bar
  noAudio = stream.getAudioTracks().length === 0;
  sharing = true;

  // local preview so the sharer can see what they're sharing (muted, or they'd hear it twice)
  screen.srcObject = stream;
  screen.muted = true;
  screen.play().catch(() => {});

  refresh();
  if (partnerHere) socket.send('share-start');
});

stopBtn.addEventListener('click', stopSharing);

// ---------- signaling ----------
const socket = createSocket();
initChat(socket, { floatLocal: 'screen', floatRemote: 'screen' });

socket.on('joined', ({ count }) => { partnerHere = count === 2; refresh(); });
socket.on('peer-joined', () => {
  partnerHere = true;
  if (sharing) socket.send('share-start'); // a partner arrived while I'm already sharing
  refresh();
});
socket.on('peer-left', () => {
  partnerHere = false;
  partnerSharing = false;
  closePeer();
  clearScreen();
  refresh();
});
socket.on('room-full', () => (status.textContent = 'This room is full.'));

// viewer side: partner wants to share
socket.on('share-start', () => {
  if (sharing) return socket.send('share-busy');
  partnerSharing = true;
  clearScreen();
  newPeer();
  refresh();
  socket.send('share-ready');
});

// sharer side: viewer is ready, so send the stream
socket.on('share-ready', async () => {
  if (!sharing) return;
  const p = newPeer();
  stream.getTracks().forEach((t) => p.addTrack(t, stream));
  const offer = await p.createOffer();
  await p.setLocalDescription(offer);
  socket.send('offer', { sdp: p.localDescription });
});

socket.on('share-busy', () => {
  sharing = false;
  stopStream();
  closePeer();
  clearScreen();
  refresh();
  status.textContent = 'Partner is already sharing';
});

socket.on('share-stop', () => {
  partnerSharing = false;
  closePeer();
  clearScreen();
  refresh();
});

socket.on('offer', async ({ sdp }) => {
  if (!pc) newPeer();
  await pc.setRemoteDescription(sdp);
  await flushCandidates();
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.send('answer', { sdp: pc.localDescription });
});

socket.on('answer', async ({ sdp }) => {
  if (!pc) return;
  await pc.setRemoteDescription(sdp);
  await flushCandidates();
});

socket.on('ice', async ({ candidate }) => {
  if (!pc) return;
  if (pc.remoteDescription) await pc.addIceCandidate(candidate).catch(console.error);
  else pending.push(candidate);
});

$('home').addEventListener('click', () => {
  stopStream();
  location.href = '/';
});

refresh();
socket.join(`W-${code}`);