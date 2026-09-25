// Real-time face filter using face-api.js (tiny models, runs fully in-browser).
const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';

let modelsReady = null;
function loadModels() {
  modelsReady ??= Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
  ]);
  return modelsReady;
}

const DETECT_OPTS = () => new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 });
const SMOOTH = 0.35; // 0 = frozen, 1 = no smoothing (snaps instantly to each detection)
const NEEDED = [19, 24, 30, 33, 36, 45]; // leftBrow, rightBrow, noseTip, noseBase, eyeL, eyeR

function squareCrop(vw, vh) {
  const s = Math.min(vw, vh);
  return { s, sx: (vw - s) / 2, sy: (vh - s) / 2 };
}

function createTracker(video, overlayCanvas) {
  const octx = overlayCanvas.getContext('2d');
  const composite = document.createElement('canvas'); // square-cropped video + doodle, for capture.js
  const cctx = composite.getContext('2d');

  let running = false;
  let target = null;    // latest detected points
  let current = null;   // smoothed points actually drawn
  let detecting = false;

  // ---- slow loop: detection, runs back-to-back as fast as the model allows ----
  async function detectLoop() {
    if (!running) return;
    if (!detecting) {
      detecting = true;
      const result = await faceapi.detectSingleFace(video, DETECT_OPTS()).withFaceLandmarks(true);
      detecting = false;
      if (running && result) {           // re-check running: this await may finish after stop()
        const pts = result.landmarks.positions;
        target = {};
        NEEDED.forEach((i) => (target[i] = { x: pts[i].x, y: pts[i].y }));
        if (!current) current = structuredClone(target); // snap into place on first hit only
      }
    }
    if (running) setTimeout(detectLoop, 30);
  }

  // ---- fast loop: renders every frame, chasing the target with easing ----
  function renderLoop() {
    if (!running) return;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (vw && vh) {
      const { s, sx, sy } = squareCrop(vw, vh);
      if (overlayCanvas.width !== s) { overlayCanvas.width = s; overlayCanvas.height = s; }
      if (composite.width !== s) { composite.width = s; composite.height = s; }

      octx.clearRect(0, 0, s, s);
      if (target && current) {
        NEEDED.forEach((i) => {
          current[i].x += (target[i].x - current[i].x) * SMOOTH;
          current[i].y += (target[i].y - current[i].y) * SMOOTH;
        });
        drawBunny(octx, current, sx, sy);
      }

      cctx.drawImage(video, sx, sy, s, s, 0, 0, s, s);
      cctx.drawImage(overlayCanvas, 0, 0);
    }
    requestAnimationFrame(renderLoop);
  }

  return {
    composite,
    get running() { return running; },
    start() {
      if (running) return;
      running = true;
      current = null;
      target = null;
      detectLoop();
      renderLoop();
    },
    stop() {
      running = false; // both loops check this and stop scheduling themselves
      octx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    },
  };
}

// pts is now { 19:{x,y}, 24:{x,y}, 30:{x,y}, 33:{x,y}, 36:{x,y}, 45:{x,y} } — the smoothed subset above
// ---------- neon glow drawing helpers ----------
function glowStroke(ctx, drawPath, color, width) {
  drawPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = width * 3.2;
  ctx.stroke();
  // bright white core on top, no glow, makes the line read as "lit" rather than just colored
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = width * 0.35;
  drawPath();
  ctx.stroke();
}

function starPath(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.42;
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function sparklePath(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.28, cy - r * 0.28);
  ctx.lineTo(cx + r, cy); ctx.lineTo(cx + r * 0.28, cy + r * 0.28);
  ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r * 0.28, cy + r * 0.28);
  ctx.lineTo(cx - r, cy); ctx.lineTo(cx - r * 0.28, cy - r * 0.28);
  ctx.closePath();
}

const MAGENTA = '#ff2fb2';
const RED = '#ff4d6d';
const GOLD = '#e8c07d';

function rotatePoint(x, y, angle) {
  return {
    x: x * Math.cos(angle) - y * Math.sin(angle),
    y: x * Math.sin(angle) + y * Math.cos(angle)
  };
}

// pts is { 19, 24, 30, 33, 36, 45 } — the smoothed subset from renderLoop
function drawBunny(ctx, pts, offX = 0, offY = 0) {
  const P = (i) => ({ x: pts[i].x - offX, y: pts[i].y - offY });
  const leftBrow = P(19), rightBrow = P(24);
  const noseTip = P(30), noseBase = P(33);
  const eyeL = P(36), eyeR = P(45);

  // ---- head tilt angle ----
const faceAngle = Math.atan2(
  eyeR.y - eyeL.y,
  eyeR.x - eyeL.x
);

  const eyeDist = Math.hypot(eyeR.x - eyeL.x, eyeR.y - eyeL.y);
  const cx = (leftBrow.x + rightBrow.x) / 2;
  const cy = Math.min(leftBrow.y, rightBrow.y);
  const earW = eyeDist * 0.6;
  const earH = eyeDist * 1.9;
  const earsUp = eyeDist * 0.50;

  ctx.save();

  // ---- ears: open loop outline with a nested inner loop, like the reference ----
  [[-1], [1]].forEach(([dir]) => {
    ctx.save();
    const earLocalX = dir * eyeDist * 0.45;
const earLocalY = -earH * 0.42 - earsUp;

const earPos = rotatePoint(
  earLocalX,
  earLocalY,
  faceAngle
);

ctx.translate(
  cx + earPos.x,
  cy + earPos.y
);

ctx.rotate(faceAngle + dir * 0.15);

    glowStroke(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(0, -earH / 2);
      ctx.bezierCurveTo(-earW / 2, -earH / 2, -earW / 2, earH / 3, 0, earH / 2);
      ctx.bezierCurveTo(earW / 2, earH / 3, earW / 2, -earH / 2, 0, -earH / 2);
    }, MAGENTA, 5);

    glowStroke(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(0, earH * 0.05);
      ctx.bezierCurveTo(-earW * 0.18, earH * 0.05, -earW * 0.18, earH * 0.32, 0, earH * 0.42);
      ctx.bezierCurveTo(earW * 0.18, earH * 0.32, earW * 0.18, earH * 0.05, 0, earH * 0.05);
    }, MAGENTA, 3.5);

    ctx.restore();
  });

  // ---- scattered sparkle stars between/beside the ears ----
    // ---- scattered sparkle stars between/beside the ears ----

  const SILVER = '#FFFFFF';
  const GOLD = '#FFD700';

  const stars = [

    // LEFT SIDE
    {
      x: -earW * 1.35,
      y: earH * 0.02,
      r: eyeDist * 0.15,
      color: GOLD,
      kind: 'star'
    },

    {
      x: -earW * 1.75,
      y: earH * 0.25,
      r: eyeDist * 0.08,
      color: SILVER,
      kind: 'star'
    },

    {
      x: -earW * 0.85,
      y: earH * 0.38,
      r: eyeDist * 0.055,
      color: GOLD,
      kind: 'sparkle'
    },


    // RIGHT SIDE
    {
      x: earW * 1.4,
      y: -earH * 0.02,
      r: eyeDist * 0.15,
      color: SILVER,
      kind: 'star'
    },

    {
      x: earW * 1.8,
      y: earH * 0.22,
      r: eyeDist * 0.08,
      color: GOLD,
      kind: 'star'
    },

    {
      x: earW * 0.85,
      y: earH * 0.40,
      r: eyeDist * 0.055,
      color: SILVER,
      kind: 'sparkle'
    },

  ];

  stars.forEach((st) => {

  const localX = st.x;
  const localY = -earH * 0.42 + st.y - earsUp;

  const rotated = rotatePoint(
    localX,
    localY,
    faceAngle
  );

  const x = cx + rotated.x;
  const y = cy + rotated.y;

  ctx.save();

  ctx.translate(x, y);
  ctx.rotate(faceAngle);

  const path = st.kind === 'star'
    ? () => starPath(ctx, 0, 0, st.r)
    : () => sparklePath(ctx, 0, 0, st.r);

  glowStroke(ctx, path, st.color, 2.2);

  ctx.restore();
});

  // ---- crescent moon at the nose ----
 // ---- small dot at the nose ----

const r = eyeDist * 0.035;
glowStroke(ctx, () => {
  ctx.beginPath();
  ctx.arc(noseTip.x, noseTip.y, r, 0, Math.PI * 2);
  ctx.fillStyle = MAGENTA;
  ctx.fill();
}, SILVER, 3);

  // // ---- whisker marks ----
  // [-1, 1].forEach((side) => {
  //   for (let i = -1; i <= 1; i += 2) {
  //     glowStroke(ctx, () => {
  //       ctx.beginPath();
  //        ctx.moveTo(
  //       noseBase.x + side * eyeDist * 0.14,
  //       noseBase.y + i * eyeDist * 0.045 - eyeDist * 0.08
  //     );

  //     ctx.lineTo(
  //       noseBase.x + side * eyeDist * 0.40,
  //       noseBase.y + i * eyeDist * 0.08 - eyeDist * 0.08
  //     );
  //     }, MAGENTA, 3);
  //   }
  // });

// ---- cheek blush ----

[-1, 1].forEach((side) => {

  // Position of cheek relative to nose
  const cheekLocalX = side * eyeDist * 0.40;
  const cheekLocalY = -eyeDist * 0.18;

  const cheekOffset = rotatePoint(
    cheekLocalX,
    cheekLocalY,
    faceAngle
  );

  const cheekX = noseBase.x + cheekOffset.x;
  const cheekY = noseBase.y + cheekOffset.y;

  for (let i = -2; i <= 2; i++) {

    const offset = i * eyeDist * 0.050;

    // Start point relative to cheek
    const start = rotatePoint(
      offset,
      eyeDist * 0.035,
      faceAngle
    );

    // End point relative to cheek
    const end = rotatePoint(
      offset + side * eyeDist * 0.035,
      -eyeDist * 0.035,
      faceAngle
    );

    glowStroke(ctx, () => {

      ctx.beginPath();

      ctx.moveTo(
        cheekX + start.x,
        cheekY + start.y
      );

      ctx.lineTo(
        cheekX + end.x,
        cheekY + end.y
      );

    }, MAGENTA, 2.5);

  }
});

  ctx.restore();
}

const trackers = new Map();

export const initDoodleFilter = loadModels;
export function attachTracker(key, video, overlayCanvas) {
  trackers.set(key, createTracker(video, overlayCanvas));
}
export function startTracker(key) { trackers.get(key)?.start(); }
export function stopTracker(key) { trackers.get(key)?.stop(); }
export function getComposite(key) {
  const t = trackers.get(key);
  return t?.running ? t.composite : null;
}