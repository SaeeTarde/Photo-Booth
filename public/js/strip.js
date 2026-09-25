import { applyFilter } from './filters.js';

const P = 400;      // panel size
const PADX = 64;    // film edge lane (sprocket holes live here)
const TOP = 40;
const GAP = 24;
const FOOT = 120;
const CELL_W = P * 2;
const STRIP_W = PADX * 2 + CELL_W;

function hole(ctx, x, y) {
  ctx.beginPath();
  ctx.roundRect(x, y, 24, 18, 4);
  ctx.fill();
}

export function buildStrip(canvas, shots, { filter = 'none', room = '' } = {}) {
  const H = TOP + shots.length * P + (shots.length - 1) * GAP + FOOT;
  canvas.width = STRIP_W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // film base
  ctx.fillStyle = '#0f0b09';
  ctx.fillRect(0, 0, STRIP_W, H);

  // sprocket holes on both edges
  ctx.fillStyle = '#f3e9d2';
  for (let y = 18; y < H - 10; y += 44) {
    hole(ctx, 20, y);
    hole(ctx, STRIP_W - 44, y);
  }

  // frames: apply the filter on a temp canvas, then place it on the strip
  shots.forEach((shot, i) => {
    const y = TOP + i * (P + GAP);
    const tmp = document.createElement('canvas');
    tmp.width = CELL_W;
    tmp.height = P;
    const t = tmp.getContext('2d');
    t.drawImage(shot, 0, 0, CELL_W, P);
    applyFilter(t, CELL_W, P, filter);

    ctx.drawImage(tmp, PADX, y);
    ctx.fillStyle = '#0f0b09'; // thin divider between the two people
    ctx.fillRect(PADX + P - 3, y, 6, P);
  });

  // date-stamp footer in film-orange
  const date = new Date()
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase();
  ctx.fillStyle = '#e08a2b';
  ctx.textAlign = 'center';
  ctx.font = 'bold 30px "Courier New", monospace';
  ctx.fillText(`BOOTH FOR TWO · ${room}`, STRIP_W / 2, H - 62);
  ctx.font = '24px "Courier New", monospace';
  ctx.fillText(date, STRIP_W / 2, H - 28);
}