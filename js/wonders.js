// ============================================================
// Wonder of the world sprites. Procedural placeholders (same pixel style as the rest of the game).
// If a file assets/wonders/<kind>.png exists it replaces the placeholder (anchor = bottom centre).
// ============================================================
import { ih } from "./sim.js";
export const WSIZE = { pyramid: [84, 64], tisland: [60, 60], wtemple: [56, 80], stones: [56, 36], falls: [48, 60], elder: [64, 72], ruins: [60, 50], spring: [56, 30], crystal: [52, 48], bones: [60, 34], fairy: [44, 30], shrine: [36, 44], obelisk: [22, 60], lighthouse: [30, 72], arch: [64, 52] };
const rgb = (c, m = 1) => [Math.min(255, c[0] * m), Math.min(255, c[1] * m), Math.min(255, c[2] * m)];
const STONE = [150, 148, 142], MOSS = [88, 126, 64], WOOD = [118, 80, 52], SAND = [214, 196, 150];
function mk(w, h) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"), img = x.createImageData(w, h), d = img.data;
  const put = (px, py, col, a = 255) => { px |= 0; py |= 0; if (px < 0 || py < 0 || px >= w || py >= h) return; const o = (py * w + px) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = a; };
  const rect = (x0, y0, ww, hh, col) => { for (let j = 0; j < hh; j++) for (let i = 0; i < ww; i++) put(x0 + i, y0 + j, col); };
  // lit from top-left: left edge light, right edge dark, noise for texture
  const blob = (cx, cy, rx, ry, col, seed = 1) => { for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) { const q = (i * i) / (rx * rx) + (j * j) / (ry * ry); if (q > 1) continue; const L = 1.08 - (i / rx) * .2 - (j / ry) * .22 - q * .12 + (ih(i + seed * 37, j + seed * 11) - .5) * .12; put(cx + i, cy + j, rgb(col, L)); } };
  const slab = (x0, y0, ww, hh, col, seed = 1) => { for (let j = 0; j < hh; j++) for (let i = 0; i < ww; i++) { const L = 1.1 - (i / ww) * .34 - (j / hh) * .08 + (ih(i + seed * 31, j * 3 + seed) - .5) * .12; put(x0 + i, y0 + j, rgb(col, L)); } };
  const finish = (anchor) => {
    const al = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) al[i] = d[i * 4 + 3] ? 1 : 0;
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) { const i = y * w + xx; if (!al[i]) continue; if (xx === 0 || y === 0 || xx === w - 1 || y === h - 1 || !al[i - 1] || !al[i + 1] || !al[i - w] || !al[i + w]) { const o = i * 4; d[o] *= .56; d[o + 1] *= .54; d[o + 2] *= .58; } }
    x.putImageData(img, 0, 0); return { canvas: c, ax: w >> 1, ay: anchor === undefined ? h - 4 : anchor, w, h };
  };
  const shadow = (cx, cy, rx, ry) => { for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) if ((i * i) / (rx * rx) + (j * j) / (ry * ry) <= 1) put(cx + i, cy + j, [0, 0, 0], 44); };
  // an isometric box: base diamond bottom vertex at (cx, by), half-width hw, half-height hh (2:1), height ht
  const iso = (cx, by, hw, hh, ht, cL, cR, cT, seed = 1) => {
    const cy = by - hh, ty = cy - ht;
    for (let y = ty - hh; y <= by; y++) for (let xx = cx - hw; xx <= cx + hw; xx++) {
      const dx = xx - cx, ax = Math.abs(dx) / hw; let col = null; const n = (ih(xx * 3 + seed, y * 5) - .5) * .1;
      if (ax <= 1 && Math.abs(y - ty) <= hh * (1 - ax)) col = rgb(cT, 1.06 + n);
      else { const yt = ty + hh * (1 - ax), yb = cy + hh * (1 - ax); if (y > yt && y <= yb) col = rgb(dx < 0 ? cL : cR, (dx < 0 ? 1.04 - ax * .12 : .96 - ax * .1) + n + ((y - yt) % 7 === 0 ? -.06 : 0)); }
      if (col) put(xx, y, col);
    }
  };
  return { w, h, put, rect, blob, slab, iso, finish, shadow };
}
Object.assign(WSIZE, { swamphut: [58, 66], icespires: [56, 70], goldtree: [76, 88] });
const DRAW = {
  swamphut(g) { const { w, h } = g, cx = 29; g.blob(cx, h - 9, 27, 7, [50, 68, 60], 1); g.blob(cx - 8, h - 10, 8, 2, [104, 132, 118], 2); g.blob(cx + 11, h - 8, 5, 1, [84, 110, 98], 3);
    const DW = [84, 60, 42], PL = [126, 94, 62], WALL = [118, 90, 60], TH = [156, 132, 66];
    [[12, 30], [22, 34], [36, 34], [46, 30]].forEach(([x, y0], i) => { g.slab(x, y0 + 8, 3, h - 9 - (y0 + 8), DW, i + 1); g.put(x + 1, h - 10, [30, 40, 34], 150); });
    for (let k = 0; k < 5; k++) g.rect(11 + k * 8, h - 22 + (k % 2), 6, 1, rgb(DW, 1.2));
    g.iso(cx, 46, 22, 11, 3, rgb(PL, 1.04), rgb(PL, .74), rgb(PL, 1.12), 2);
    g.iso(cx, 42, 14, 7, 13, rgb(WALL, 1.04), rgb(WALL, .76), rgb(WALL, 1.1), 3);
    g.rect(cx - 9, 34, 4, 4, [170, 255, 150]); g.rect(cx - 8, 35, 2, 2, [230, 255, 200]); g.rect(cx + 5, 33, 4, 7, [46, 34, 28]);
    g.iso(cx, 24, 19, 9, 3, rgb(TH, 1.04), rgb(TH, .74), rgb(TH, 1.12), 4); g.blob(cx - 1, 12, 12, 8, rgb(TH, .96), 5); g.blob(cx + 2, 9, 7, 5, rgb(TH, 1.1), 6); g.rect(cx + 3, 1, 1, 6, [70, 54, 40]);
    g.rect(52, 28, 1, 22, DW); g.rect(51, 25, 3, 3, [150, 255, 120]); g.put(52, 26, [235, 255, 210]); for (let i = 0; i < 6; i++) g.put(48 + ((ih(i, 3) * 8) | 0), 22 + ((ih(i, 5) * 8) | 0), [170, 255, 150], 120);
    for (let k = 0; k < 8; k++) { g.rect(cx + 14, 48 + k * 2, 5, 1, rgb(DW, 1.25)); } g.rect(cx + 14, 46, 1, 18, DW); g.rect(cx + 18, 46, 1, 18, DW);
    for (let i = 0; i < 7; i++) { const x = 4 + i * 8 + ((ih(i, 9) * 4) | 0), L = 5 + ((ih(i, 2) * 6) | 0); for (let y = 0; y < L; y++) g.put(x, h - 8 - y, y % 3 ? [74, 106, 44] : [96, 128, 52]); if (i % 2 === 0) { g.put(x, h - 9 - L, [104, 64, 34]); g.put(x, h - 10 - L, [124, 78, 40]); } } },
  icespires(g) { const { w, h } = g; g.blob(28, h - 8, 26, 6, [226, 236, 246], 1); g.shadow(28, h - 7, 24, 5);
    const ICE = [[16, 44, 6, 42], [40, 46, 6, 36], [28, 52, 8, 62], [8, 50, 4, 24], [48, 50, 4, 28]];
    ICE.forEach(([cx, by, hw, ht], i) => { const top = by - ht; for (let y = top; y <= by; y++) { const t = (y - top) / ht, half = Math.max(0, Math.round(hw * Math.pow(t, .8))); for (let x = -half; x <= half; x++) { const side = half ? x / half : 0; let col = side < -.2 ? [196, 232, 252] : side > .35 ? [96, 150, 214] : [140, 198, 240]; col = rgb(col, 1.08 - t * .16 + (ih(cx + x, y) - .5) * .08); if (Math.abs(x) === half) col = rgb(col, .9); g.put(cx + x, y, col, 232); } }
      for (let y = top + 4; y < by - 4; y += 7) g.put(cx - 1, y, [236, 248, 255]); g.put(cx, top, [250, 254, 255]); });
    for (let i = 0; i < 8; i++) g.put(4 + ((ih(i, 11) * 48) | 0), 6 + ((ih(i, 13) * 50) | 0), [255, 255, 255], 200); },
  goldtree(g) { const { w, h } = g, cx = 38; g.shadow(cx, h - 8, 30, 7);
    g.slab(cx - 7, 44, 14, h - 8 - 44, [112, 78, 46], 1); g.slab(cx - 14, h - 14, 10, 8, [104, 72, 44], 2); g.slab(cx + 4, h - 14, 10, 8, [96, 66, 40], 3);
    const GL = [[0, 0, 28, 20, [236, 188, 56]], [-20, 10, 16, 12, [222, 160, 40]], [20, 8, 16, 12, [226, 166, 44]], [-8, -14, 18, 12, [250, 214, 100]], [10, -12, 14, 10, [244, 200, 80]], [0, 16, 22, 8, [200, 130, 30]]];
    GL.forEach(([dx, dy, rx, ry, col], i) => g.blob(cx + dx, 30 + dy, rx, ry, col, i + 4));
    for (let i = 0; i < 40; i++) { const x = 8 + ((ih(i, 3) * 60) | 0), y = 12 + ((ih(i, 7) * 50) | 0); g.put(x, y, ih(i, 9) < .5 ? [255, 236, 140] : [255, 206, 70]); }
    for (let i = 0; i < 14; i++) g.put(6 + ((ih(i, 21) * 64) | 0), 52 + ((ih(i, 23) * 28) | 0), [255, 214, 90], 200); },
  pyramid(g) { const { w, h } = g, cx = 42, by = h - 3; g.shadow(cx, by - 6, 38, 10);
    const GOLD = [214, 176, 98]; let hw = 38, y = by;
    for (let i = 0; i < 5; i++) { const hh = hw / 2, ht = i === 4 ? 5 : 6; g.iso(cx, y, hw, hh, ht, rgb(GOLD, 1.02), rgb(GOLD, .74), rgb(GOLD, 1.18), i + 1); const nh = (hw - 6) / 2; y = y - ht - (hh - nh); hw -= 6; }
    g.rect(cx - 9, by - 15, 7, 9, [40, 28, 24]); g.rect(cx - 10, by - 16, 9, 1, [250, 226, 150]); g.rect(cx - 10, by - 16, 1, 10, [250, 226, 150]);
    for (let k = 0; k < 4; k++) g.rect(cx - 11 + k, by - 6 + k, 16 - k * 2, 1, rgb(GOLD, 1.16));
    g.rect(cx - 1, 2, 2, 5, [250, 236, 160]); },
  tisland(g) { const { w, h } = g, cx = 30, by = h - 3; g.shadow(cx, by - 8, 28, 8);
    const MARB = [236, 232, 220]; g.iso(cx, by, 27, 13, 4, rgb(MARB, .98), rgb(MARB, .74), rgb(MARB, 1.06), 2); g.iso(cx, by - 4, 23, 11, 3, rgb(MARB, .98), rgb(MARB, .74), rgb(MARB, 1.06), 3);
    const cyT = by - 4 - 11 - 3, col = (x, y) => { g.slab(x - 1, y - 18, 3, 18, MARB, x); g.rect(x - 2, y - 19, 5, 2, rgb(MARB, 1.05)); g.rect(x - 2, y - 1, 5, 2, rgb(MARB, .85)); };
    col(cx, cyT - 8); col(cx - 17, cyT); col(cx + 17, cyT); col(cx - 9, cyT + 4); col(cx + 9, cyT + 4); col(cx, cyT + 8);
    const rc = cyT - 18; g.iso(cx, rc + 10, 21, 10, 3, [70, 118, 150], [44, 82, 112], [100, 148, 184], 4);
    g.blob(cx, rc - 5, 7, 6, [236, 196, 90], 5); g.rect(cx - 1, rc - 13, 2, 5, [250, 226, 140]); },
  wtemple(g) { const { w, h } = g, cx = 28; g.shadow(cx, h - 8, 24, 6);
    const WD = [92, 64, 46], RF = [150, 56, 44]; let by = h - 4, hw = 22;
    g.iso(cx, by, 24, 12, 4, rgb([120, 112, 100], 1), rgb([120, 112, 100], .75), rgb([140, 132, 118], 1.05), 1); by -= 4;
    for (let t = 0; t < 3; t++) { const hh = hw / 2; g.iso(cx, by, hw - 6, (hw - 6) / 2, 9, rgb(WD, 1.06), rgb(WD, .76), rgb(WD, 1.1), t + 2); for (let k = 0; k < 3; k++) g.rect(cx - (hw - 8) + 2 + k * (hw - 8) * 2 / 3, by - 14 + 2, 1, 6, [250, 214, 110]);
      g.iso(cx, by - 9, hw + 2, (hw + 2) / 2, 3, rgb(RF, 1.02), rgb(RF, .72), rgb(RF, 1.1), t + 5); g.put(cx - hw - 2, by - 9 - (hw + 2) / 2 - 1, rgb(RF, 1.2)); g.put(cx + hw + 2, by - 9 - (hw + 2) / 2 - 1, rgb(RF, 1.2));
      by -= 12 + 1; hw -= 5; }
    g.rect(cx, by - 8, 1, 10, [60, 44, 34]); g.put(cx, by - 9, [250, 214, 110]); g.rect(cx - 12, by + 20, 2, 3, [250, 214, 110]); g.rect(cx + 11, by + 22, 2, 3, [250, 214, 110]); },
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
const ANCH = { pyramid: 22, tisland: 15, wtemple: 15, swamphut: 10 }; // distance from the bottom of the canvas up to the footprint centre
const cache = {}, art = {};
export function wonderSprites(season) {
  const key = season === "winter" ? "w" : "n"; if (cache[key]) return mergeArt(cache[key]);
  const out = {};
  for (const k of Object.keys(DRAW)) {
    const [w, h] = WSIZE[k], g = mk(w, h); DRAW[k](g); const s = g.finish(ANCH[k] === undefined ? undefined : h - ANCH[k]);
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

// the harbour boat: a small clinker boat with one sail. Drawn facing right; flipped for the other way.
let boatCache = null;
export function boatSprites() {
  if (boatCache) return boatCache;
  const w = 28, h = 26, c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"), img = x.createImageData(w, h), d = img.data;
  const put = (px, py, col) => { if (px < 0 || py < 0 || px >= w || py >= h) return; const o = (py * w + px) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255; };
  for (let py = 0; py < 6; py++) for (let px = 0; px < 22; px++) { const t = px / 21, top = 16 + Math.round(Math.pow(Math.abs(t - .45) * 2, 2.2) * -3 + 0), halfW = 11 - py * .0; const inside = px >= Math.round(py * .9) && px <= 21 - Math.round(py * 1.1); if (!inside) continue; const L = .78 + (px % 5 === 0 ? -.08 : 0) + (py === 0 ? .18 : 0) - py * .03; put(3 + px, 17 + py, rgb(py === 0 ? [176, 128, 80] : [118, 80, 52], L / .8)); }
  for (let py = 2; py < 17; py++) put(13, py, [70, 50, 36]); // mast
  for (let py = 3; py < 15; py++) for (let px = 14; px < 14 + Math.round((py - 2) * .9); px++) put(px, py, py > 8 && py < 11 ? [200, 70, 56] : [240, 236, 222]); // sail
  for (let py = 5; py < 14; py++) put(12, py, [226, 220, 204]); put(12, 5, [226, 220, 204]);
  for (let px = 13; px < 17; px++) put(px, 1, [200, 70, 56]); put(13, 2, [70, 50, 36]);
  for (let px = 4; px < 24; px++) { put(px, 23, [0, 0, 0]); }
  x.putImageData(img, 0, 0);
  // outline
  const im2 = x.getImageData(0, 0, w, h), q = im2.data, al = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) al[i] = q[i * 4 + 3] === 255 && !(q[i * 4] === 0 && q[i * 4 + 1] === 0) ? 1 : 0;
  for (let i = 0; i < w * h; i++) { if (q[i * 4] === 0 && q[i * 4 + 1] === 0 && q[i * 4 + 3] === 255) { q[i * 4 + 3] = 0; } }
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) { const i = py * w + px; if (!al[i]) continue; if (px === 0 || py === 0 || !al[i - 1] || !al[i + 1] || !al[i - w] || (py < h - 1 && !al[i + w])) { q[i * 4] *= .55; q[i * 4 + 1] *= .52; q[i * 4 + 2] *= .56; } }
  x.putImageData(im2, 0, 0);
  const f = document.createElement("canvas"); f.width = w; f.height = h; const fx = f.getContext("2d"); fx.translate(w, 0); fx.scale(-1, 1); fx.drawImage(c, 0, 0);
  return boatCache = { r: { canvas: c, ax: 14, ay: 21, w, h }, l: { canvas: f, ax: 14, ay: 21, w, h } };
}
