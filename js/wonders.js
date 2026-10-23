// ============================================================
// Wonder of the world sprites. Procedural placeholders (same pixel style as the rest of the game).
// If a file assets/wonders/<kind>.png exists it replaces the placeholder (anchor = bottom centre).
// ============================================================
import { ih } from "./sim.js";
export const WSIZE = { stones: [56, 36], falls: [48, 60], elder: [64, 72], ruins: [60, 50], spring: [56, 30], crystal: [52, 48], bones: [60, 34], fairy: [44, 30], shrine: [36, 44], obelisk: [22, 60], lighthouse: [30, 72], arch: [64, 52] };
const rgb = (c, m = 1) => [Math.min(255, c[0] * m), Math.min(255, c[1] * m), Math.min(255, c[2] * m)];
const STONE = [150, 148, 142], MOSS = [88, 126, 64], WOOD = [118, 80, 52], SAND = [214, 196, 150];
function mk(w, h) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"), img = x.createImageData(w, h), d = img.data;
  const put = (px, py, col, a = 255) => { px |= 0; py |= 0; if (px < 0 || py < 0 || px >= w || py >= h) return; const o = (py * w + px) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = a; };
  const rect = (x0, y0, ww, hh, col) => { for (let j = 0; j < hh; j++) for (let i = 0; i < ww; i++) put(x0 + i, y0 + j, col); };
  // lit from top-left: left edge light, right edge dark, noise for texture
  const blob = (cx, cy, rx, ry, col, seed = 1) => { for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) { const q = (i * i) / (rx * rx) + (j * j) / (ry * ry); if (q > 1) continue; const L = 1.08 - (i / rx) * .2 - (j / ry) * .22 - q * .12 + (ih(i + seed * 37, j + seed * 11) - .5) * .12; put(cx + i, cy + j, rgb(col, L)); } };
  const slab = (x0, y0, ww, hh, col, seed = 1) => { for (let j = 0; j < hh; j++) for (let i = 0; i < ww; i++) { const L = 1.1 - (i / ww) * .34 - (j / hh) * .08 + (ih(i + seed * 31, j * 3 + seed) - .5) * .12; put(x0 + i, y0 + j, rgb(col, L)); } };
  const finish = () => {
    const al = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) al[i] = d[i * 4 + 3] ? 1 : 0;
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) { const i = y * w + xx; if (!al[i]) continue; if (xx === 0 || y === 0 || xx === w - 1 || y === h - 1 || !al[i - 1] || !al[i + 1] || !al[i - w] || !al[i + w]) { const o = i * 4; d[o] *= .56; d[o + 1] *= .54; d[o + 2] *= .58; } }
    x.putImageData(img, 0, 0); return { canvas: c, ax: w >> 1, ay: h - 4, w, h };
  };
  const shadow = (cx, cy, rx, ry) => { for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) if ((i * i) / (rx * rx) + (j * j) / (ry * ry) <= 1) put(cx + i, cy + j, [0, 0, 0], 44); };
  return { w, h, put, rect, blob, slab, finish, shadow };
}
const DRAW = {
  stones(g) { const { w, h } = g; g.shadow(w / 2, h - 6, 26, 7);
    const pos = [[6, 18, 7, 16], [16, 10, 8, 20], [30, 6, 8, 22], [42, 12, 7, 18], [47, 20, 6, 12], [24, 20, 8, 14], [12, 24, 6, 8]]; pos.forEach(([x, y, ww, hh], i) => { g.slab(x, y + 4, ww, hh, STONE, i); for (let k = 0; k < ww; k++) if (ih(i * 5 + k, 2) < .5) g.put(x + k, y + 3, MOSS); });
    g.slab(18, 20, 18, 4, rgb(STONE, .9), 9); },
  falls(g) { const { w, h } = g; g.slab(0, 22, 20, 32, [128, 120, 112], 2); g.slab(28, 22, 20, 32, [112, 106, 100], 3); g.rect(0, 20, 20, 3, MOSS); g.rect(28, 20, 20, 3, MOSS);
    for (let y = 22; y < 52; y++) for (let x = 19; x < 29; x++) { const L = .86 + ih(x, y * 2) * .22; g.put(x, y, [Math.min(255, 190 * L), Math.min(255, 224 * L), Math.min(255, 240 * L)]); }
    for (let x = 14; x < 36; x++) for (let y = 52; y < 58; y++) if (ih(x, y) < .55) g.put(x, y, [230, 244, 250], 200);
    g.rect(19, 18, 10, 4, [96, 156, 196]); },
  elder(g) { const { w, h } = g; g.shadow(w / 2, h - 6, 24, 6);
    g.slab(26, 38, 12, 30, [104, 74, 50], 1); g.slab(22, 58, 6, 10, [96, 68, 46], 2); g.slab(36, 58, 6, 10, [96, 68, 46], 3);
    g.blob(32, 24, 28, 18, [56, 112, 48], 4); g.blob(18, 32, 14, 10, [66, 126, 54], 5); g.blob(48, 30, 14, 10, [50, 104, 44], 6); g.blob(30, 14, 16, 9, [82, 142, 62], 7);
    for (let i = 0; i < 7; i++) { const x = 10 + i * 7; for (let y = 36; y < 44 + (i % 3) * 3; y++) g.put(x, y, i % 2 ? [220, 90, 80] : [236, 200, 90]); } },
  ruins(g) { const { w, h } = g; g.shadow(w / 2, h - 6, 26, 6);
    g.slab(14, 10, 12, 36, [168, 160, 146], 1); g.slab(26, 22, 14, 24, [150, 144, 132], 2); g.slab(40, 30, 14, 16, [160, 154, 140], 3); g.slab(6, 34, 10, 12, [150, 144, 132], 4);
    for (let y = 14; y < 24; y += 5) g.rect(18, y, 3, 3, [40, 36, 40]); g.rect(14, 8, 12, 2, MOSS); g.rect(26, 20, 14, 2, MOSS);
    for (let y = 12; y < 46; y++) if (ih(y, 5) < .5) g.put(25, y, MOSS); g.blob(46, 44, 8, 3, MOSS, 3); },
  spring(g) { const { w, h } = g; g.blob(28, 18, 26, 9, [150, 146, 138], 1); g.blob(28, 18, 20, 6, [70, 190, 190], 2); g.blob(22, 17, 6, 2, [150, 230, 226], 3); g.blob(36, 19, 5, 2, [120, 214, 214], 4);
    for (let i = 0; i < 6; i++) g.put(22 + i * 3, 6 - (i % 3), [236, 244, 248], 150); },
  crystal(g) { const { w, h } = g; g.shadow(w / 2, h - 6, 24, 6);
    g.blob(26, 34, 24, 14, [118, 112, 106], 1); g.blob(26, 38, 9, 8, [26, 22, 30], 2);
    const cr = [[10, 20, 5, 22, [120, 150, 240]], [16, 12, 5, 28, [170, 130, 240]], [36, 14, 6, 26, [130, 170, 250]], [42, 22, 5, 20, [190, 140, 240]], [28, 8, 4, 18, [150, 220, 250]]];
    cr.forEach(([x, y, ww, hh, col]) => { for (let j = 0; j < hh; j++) { const k = Math.max(1, Math.round(ww * (1 - Math.max(0, (hh - j) / hh - .55) * 1.2))); for (let i = 0; i < k; i++) g.put(x + i + ((ww - k) >> 1), y + j, rgb(col, 1.1 - i / ww * .4 - j / hh * .1)); } g.put(x + 1, y + 2, [255, 255, 255]); }); },
  bones(g) { const { w, h } = g; g.blob(30, 26, 28, 6, SAND, 1);
    for (let i = 0; i < 5; i++) { const x = 10 + i * 9; for (let y = 4; y < 26; y++) { const bend = Math.round(Math.sin((y - 4) / 22 * 1.4) * 5); g.put(x + bend, y, rgb([236, 228, 206], 1 - i * .02)); g.put(x + bend + 1, y, [190, 182, 160]); } }
    g.slab(6, 22, 48, 3, [226, 218, 196], 8); g.blob(54, 22, 6, 5, [230, 222, 200], 4); g.put(52, 21, [50, 44, 40]); g.put(53, 21, [50, 44, 40]); },
  fairy(g) { const { w, h } = g; g.blob(22, 22, 20, 6, [70, 130, 58], 1);
    [[6, 14, 5], [14, 8, 6], [28, 8, 6], [36, 14, 5], [22, 18, 4]].forEach(([x, y, r], i) => { g.slab(x, y + r - 1, 3, 8 - (i % 2), [236, 230, 210], i); g.blob(x + 1, y + 1, r, Math.ceil(r * .6), [206, 60, 50], i + 3); g.put(x - 1, y, [250, 250, 240]); g.put(x + 2, y - 1, [250, 250, 240]); g.put(x + 3, y + 1, [250, 250, 240]); });
    for (let i = 0; i < 5; i++) g.put(8 + i * 7, 3 + (i % 3) * 3, [255, 244, 160], 190); },
  shrine(g) { const { w, h } = g; g.shadow(w / 2, h - 6, 14, 4);
    g.slab(8, 20, 18, 20, [196, 184, 150], 1); for (let j = 0; j < 8; j++) for (let i = 0; i < 24; i++) { if (i < 12 - j * 1.4 || i > 12 + j * 1.4) continue; g.put(5 + i, 12 + j, rgb([150, 90, 60], 1.1 - j * .04 - (i / 24) * .2)); }
    g.rect(14, 28, 5, 12, [60, 40, 30]); g.put(16, 30, [255, 214, 110]); g.rect(28, 14, 2, 26, WOOD); g.slab(26, 10, 6, 6, [200, 170, 70], 4); g.put(28, 17, [90, 70, 40]); },
  obelisk(g) { const { w, h } = g; g.shadow(w / 2, h - 6, 10, 3);
    for (let y = 4; y < 52; y++) { const half = 3 + Math.round((y - 4) / 48 * 4), x0 = 11 - half; for (let i = 0; i < half * 2; i++) { const L = 1.08 - i / (half * 2) * .36; g.put(x0 + i, y, rgb([206, 202, 190], L)); } }
    for (let y = 0; y < 5; y++) for (let i = 0; i < 5 - y; i++) g.put(9 + i + (y >> 1), 3 - y + 3, rgb([220, 216, 204], 1 - y * .02));
    for (let y = 12; y < 46; y += 7) { g.put(9, y, [120, 112, 100]); g.put(11, y + 1, [120, 112, 100]); g.put(10, y + 2, [120, 112, 100]); }
    g.slab(4, 52, 14, 4, [160, 156, 146], 3); },
  lighthouse(g) { const { w, h } = g; g.shadow(w / 2, h - 6, 12, 3);
    for (let y = 18; y < 66; y++) { const half = 5 + Math.round((y - 18) / 48 * 4), x0 = 15 - half; for (let i = 0; i < half * 2; i++) { const band = Math.floor((y - 18) / 9) % 2; const col = band ? [200, 70, 56] : [226, 220, 204]; g.put(x0 + i, y, rgb(col, 1.1 - i / (half * 2) * .38)); } }
    g.slab(9, 10, 12, 8, [70, 66, 72], 2); g.rect(12, 12, 6, 4, [250, 214, 110]); g.slab(8, 6, 14, 3, [150, 70, 56], 3); g.rect(14, 2, 2, 4, [90, 86, 90]); },
  arch(g) { const { w, h } = g; g.shadow(w / 2, h - 6, 28, 6);
    g.slab(4, 22, 16, 28, [190, 150, 110], 1); g.slab(44, 22, 16, 28, [170, 134, 98], 2);
    for (let x = 4; x < 60; x++) { const t = (x - 4) / 56, top = 8 + Math.round(Math.pow(Math.abs(t - .5) * 2, 2) * 16), bot = top + 10 + Math.round(Math.abs(t - .5) * 8); for (let y = top; y < bot; y++) g.put(x, y, rgb([196, 156, 112], 1.1 - (y - top) / 14 * .3 - t * .18 + (ih(x, y) - .5) * .1)); }
    g.rect(24, 6, 16, 2, MOSS); g.rect(4, 20, 16, 2, MOSS); },
};
const cache = {}, art = {};
export function wonderSprites(season) {
  const key = season === "winter" ? "w" : "n"; if (cache[key]) return mergeArt(cache[key]);
  const out = {};
  for (const k of Object.keys(DRAW)) {
    const [w, h] = WSIZE[k], g = mk(w, h); DRAW[k](g); const s = g.finish();
    if (season === "winter") { const x = s.canvas.getContext("2d"), im = x.getImageData(0, 0, w, h), d = im.data; for (let i = 0; i < w * h; i++) { if (!d[i * 4 + 3]) continue; const y = (i / w) | 0, up = i >= w && !d[(i - w) * 4 + 3]; if (up && ih(i, 7) < .8) { d[i * 4] = 240; d[i * 4 + 1] = 244; d[i * 4 + 2] = 250; } } x.putImageData(im, 0, 0); }
    out[k] = s;
  }
  cache[key] = out; return mergeArt(out);
}
function mergeArt(o) { const r = {}; for (const k in o) r[k] = art[k] || o[k]; return r; }
// optional hand-made art: tries assets/wonders/<kind>.png ; returns when all tried
export function loadWonderArt(done) {
  let n = Object.keys(DRAW).length;
  for (const k of Object.keys(DRAW)) {
    const im = new Image(); im.onload = () => { const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; c.getContext("2d").drawImage(im, 0, 0); art[k] = { canvas: c, ax: im.width >> 1, ay: im.height - 4, w: im.width, h: im.height }; if (!--n && done) done(); };
    im.onerror = () => { if (!--n && done) done(); }; im.src = "assets/wonders/" + k + ".png";
  }
}
