const DARK = [27, 21, 18];
const RED = [179, 38, 30];
const CREAM = [243, 233, 210];
const NAVY = [20, 34, 56];
const ICE = [214, 235, 240];

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const clamp = (v) => Math.max(0, Math.min(255, v));

function eachPixel(ctx, w, h, fn) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b] = fn(d[i], d[i + 1], d[i + 2], d[i + 3]);
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  ctx.putImageData(img, 0, 0);
}

function grayOf(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b; }

function vignette(ctx, w, h, strength = 0.55) {
  const grad = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.75);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function grain(ctx, w, h, amount = 22) {
  eachPixel(ctx, w, h, (r, g, b) => {
    const n = (Math.random() - 0.5) * amount;
    return [clamp(r + n), clamp(g + n), clamp(b + n)];
  });
}

const filters = {
  none() {},

  // warm black-and-white with grain
  film(ctx, w, h) {
    eachPixel(ctx, w, h, (r, g, b) => {
      const gray = grayOf(r, g, b);
      return [clamp(gray * 1.08 + 10), clamp(gray * 0.96 + 4), clamp(gray * 0.8)];
    });
    grain(ctx, w, h, 30);
    vignette(ctx, w, h, 0.35);
  },

  // three-tone poster: ink -> red -> cream
  poster(ctx, w, h) {
    eachPixel(ctx, w, h, (r, g, b) => {
      const t = grayOf(r, g, b) / 255;
      return t < 0.5 ? mix(DARK, RED, t * 2) : mix(RED, CREAM, (t - 0.5) * 2);
    });
  },

  // blue-toned night poster
  midnight(ctx, w, h) {
    eachPixel(ctx, w, h, (r, g, b) => {
      const t = grayOf(r, g, b) / 255;
      return t < 0.5 ? mix(DARK, NAVY, t * 2) : mix(NAVY, ICE, (t - 0.5) * 2);
    });
  },

  // classic sepia
  sepia(ctx, w, h) {
    eachPixel(ctx, w, h, (r, g, b) => [
      clamp(r * 0.393 + g * 0.769 + b * 0.189),
      clamp(r * 0.349 + g * 0.686 + b * 0.168),
      clamp(r * 0.272 + g * 0.534 + b * 0.131),
    ]);
    grain(ctx, w, h, 14);
  },

  // high-contrast noir with heavy vignette
  noir(ctx, w, h) {
    eachPixel(ctx, w, h, (r, g, b) => {
      const gray = grayOf(r, g, b);
      const c = clamp((gray - 128) * 1.6 + 128);
      return [c, c, c];
    });
    grain(ctx, w, h, 26);
    vignette(ctx, w, h, 0.6);
  },

  // negative-film look
  negative(ctx, w, h) {
    eachPixel(ctx, w, h, (r, g, b) => [255 - r, 255 - g, 255 - b]);
  },

  // pushed, saturated color, like expired film
  vivid(ctx, w, h) {
    eachPixel(ctx, w, h, (r, g, b) => {
      const gray = grayOf(r, g, b);
      const boost = (c) => clamp(gray + (c - gray) * 1.5);
      return [clamp(boost(r) * 1.05), boost(g), clamp(boost(b) * 0.92 + 6)];
    });
    vignette(ctx, w, h, 0.3);
  },

  // chunky pixels
  pixel(ctx, w, h) {
    const size = 10;
    const small = document.createElement('canvas');
    small.width = Math.ceil(w / size);
    small.height = Math.ceil(h / size);
    small.getContext('2d').drawImage(ctx.canvas, 0, 0, small.width, small.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, w, h);
  },
};

export function applyFilter(ctx, w, h, name) {
  (filters[name] || filters.none)(ctx, w, h);
}