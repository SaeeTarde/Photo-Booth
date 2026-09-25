import { getComposite } from './doodle.js';

const SRC = 480; // each person's photo is a 480x480 center crop
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function drawSquare(ctx, video, key, dx, mirror) {
  const source = getComposite(key) || video;           // use the doodle canvas if the filter's on
  const vw = source.videoWidth ?? source.width;
  const vh = source.videoHeight ?? source.height;
  const s = Math.min(vw, vh);
  const sx = (vw - s) / 2;
  const sy = (vh - s) / 2;

  ctx.save();
  if (mirror) {
    ctx.translate(dx + SRC, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(source, sx, sy, s, s, 0, 0, SRC, SRC);
  } else {
    ctx.drawImage(source, sx, sy, s, s, dx, 0, SRC, SRC);
  }
  ctx.restore();
}

function grabShot(localVideo, remoteVideo) {
  const c = document.createElement('canvas');
  c.width = SRC * 2;
  c.height = SRC;
  const ctx = c.getContext('2d');
  drawSquare(ctx, localVideo, 'local', 0, true);
  drawSquare(ctx, remoteVideo, 'remote', SRC, true);
  return c;
}

export async function captureSession({ localVideo, remoteVideo, count = 4, onTick, onShot }) {
  const shots = [];
  for (let i = 0; i < count; i++) {
    const from = i === 0 ? 3 : 2;
    for (let n = from; n > 0; n--) {
      onTick(n, i);
      await sleep(900);
    }
    shots.push(grabShot(localVideo, remoteVideo));
    onShot(i);
    await sleep(500);
  }
  return shots;
}