// ============================================================
// Usage of Empires II — renderer. Ground and fog are painted per chunk into
// canvases (only when needed), entities are drawn per frame in depth order.
// Zoom: 1×..5× crisp pixels, 0.75×/0.5× smooth, 0.33×/0.25× from small overview tiles.
// ============================================================
import * as M from "./sim.js";
import { PAL, buildSprites, mix } from "./gfx.js";
const { C, C4, WK } = M;
export const sx = (x, y) => (x - y) * 8, sy = (x, y) => (x + y) * 4;
const rgb = c => "rgb(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + ")";
const pick = (arr, t) => arr[Math.min(arr.length - 1, Math.max(0, t | 0))];
const LOOK = { cloth: [[170, 70, 52], [72, 110, 170], [200, 160, 70], [86, 140, 84], [150, 90, 140], [190, 120, 90], [96, 150, 160], [180, 180, 170]], hair: [[60, 40, 24], [200, 160, 70], [40, 30, 24], [150, 70, 40], [90, 90, 96], [220, 190, 110], [50, 34, 26], [120, 60, 36]], skin: [[240, 200, 160], [220, 170, 130], [250, 215, 180], [200, 150, 110], [240, 190, 150]] };
const CROPC = { wheat: [[170, 128, 44], [214, 170, 60], [240, 206, 100]], barley: [[176, 160, 92], [210, 196, 122], [232, 222, 160]], cabbage: [[60, 110, 70], [96, 156, 96], [150, 200, 130]], flax: [[70, 110, 60], [110, 130, 200], [150, 170, 230]] };
const PLOW = [[60, 40, 28], [82, 56, 38], [104, 74, 50]];
// ---------- fog pattern (tileable 128x128) ----------
const FP = 128, fogPat = new Uint8ClampedArray(FP * FP * 3);
(() => {
  const per = (x, y, s) => { const n = FP / s, xi = Math.floor(x / s), yi = Math.floor(y / s), xf = x / s - xi, yf = y / s - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), h = (i, j) => M.ih(((i % n) + n) % n + 77, ((j % n) + n) % n + 13); const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
  for (let y = 0; y < FP; y++) for (let x = 0; x < FP; x++) {
    const w = per(x, y * 2, 32) * .7 + per(x, y * 2, 8) * .3, o = (y * FP + x) * 3;
    const c = w > .62 ? [44, 54, 58] : w > .47 ? [34, 43, 47] : [27, 35, 38]; const n = (M.ih(x, y) - .5) * 6;
    fogPat[o] = c[0] + n; fogPat[o + 1] = c[1] + n; fogPat[o + 2] = c[2] + n;
  }
})();
let fogPatCanvas = null;
function fogPattern(ctx) {
  if (!fogPatCanvas) { fogPatCanvas = document.createElement("canvas"); fogPatCanvas.width = FP; fogPatCanvas.height = FP; const x = fogPatCanvas.getContext("2d"), im = x.createImageData(FP, FP); for (let i = 0; i < FP * FP; i++) { im.data[i * 4] = fogPat[i * 3]; im.data[i * 4 + 1] = fogPat[i * 3 + 1]; im.data[i * 4 + 2] = fogPat[i * 3 + 2]; im.data[i * 4 + 3] = 255; } x.putImageData(im, 0, 0); }
  return ctx.createPattern(fogPatCanvas, "repeat");
}
// ---------- per chunk painting ----------
const CW = C * 16, CH = C * 8, OVM = 24; // chunk canvas size; overview top margin (1/4 px)
export const chunkOrigin = ch => [(ch.cx - ch.cy - 1) * C * 8, (ch.cx + ch.cy) * C * 4];
function samples(ch) {
  if (ch.g) return ch.g;
  const lf = new Float32Array(C4 * C4), fd = new Float32Array(C4 * C4), lk = new Float32Array(C4 * C4);
  for (let j = 0; j < C4; j++) for (let i = 0; i < C4; i++) { const x = ch.x0 + (i + .5) / 4, y = ch.y0 + (j + .5) / 4, k = j * C4 + i; lf[k] = M.lfV(x, y); fd[k] = M.fdV(x, y); lk[k] = M.lakeV(x, y); }
  return ch.g = { lf, fd, lk };
}
let W = null, season = "summer", SP = null;
function fieldPix(b, x, y, gx, gy, P, h, h2) {
  const ph = (((x - b.x) * 2.3) % 1 + 1) % 1, edge = x - b.x < .25 || y - b.y < .25 || b.x + b.a - x < .25 || b.y + b.b - y < .25;
  let c;
  if (!b.done) { c = ph < .4 ? PLOW[0] : PLOW[1]; if (b.prog < (y - b.y) / b.b) c = mix(c, P.g[1], .6); }
  else if (b.stage === 0) { c = ph < .34 ? PLOW[0] : ph < .6 ? PLOW[1] : PLOW[0]; if (ph > .34 && ph < .46) c = PLOW[2]; }
  else if (b.stage === 1) { c = ph < .5 ? PLOW[1] : PLOW[0]; if (ph > .2 && ph < .38 && h2 < .55) c = [80, 140, 60]; }
  else if (b.stage === 2) { c = ph < .62 ? (h2 < .5 ? [72, 128, 52] : [96, 156, 64]) : PLOW[0]; }
  else { const cc = CROPC[b.crop] || CROPC.wheat; c = ph < .7 ? (ph < .12 ? cc[0] : ph < .45 ? cc[1] : cc[0]) : PLOW[0]; if (h2 < .2) c = cc[2]; if (b.crop === "flax" && h2 > .55 && ph < .7) c = [80, 130, 70]; if (b.crop === "cabbage" && ph < .7 && h2 > .6) c = [70, 120, 70]; }
  if (P.snow) c = mix(c, [236, 242, 248], b.stage === 0 ? .85 : .6);
  if (edge) c = mix(c, [70, 52, 36], .45);
  return [c[0] * (.94 + h * .12), c[1] * (.94 + h * .12), c[2] * (.94 + h * .12)];
}
function pix(ch, gx, gy, P) {
  const b0 = (gy + .5) / 4, a = (gx + .5) / 8, x = (a + b0) / 2, y = (b0 - a) / 2;
  if (Math.floor(x / C) !== ch.cx || Math.floor(y / C) !== ch.cy) return null;
  const g = ch.g, i = Math.floor((x - ch.x0) * 4), j = Math.floor((y - ch.y0) * 4), k = j * C4 + i, h = M.ih(gx, gy), h2 = M.ih(gx * 7 + 3, gy * 5 + 1);
  const lk = g.lk[k], lf = g.lf[k], fd = g.fd[k];
  if (lk > .7) { const dp = M.clamp((lk - .7) / .08, 0, 1); let c = P.water[dp > .5 ? 0 : 1]; if (h2 < .06) c = P.water[2]; if (!P.snow && ((((x * 3 + y * 2) % 1) + 1) % 1 < .08)) c = P.water[2]; return c; }
  if (lk > .675) { let c = h < .5 ? P.dirt[0] : P.dirt[1]; if (h2 < .15) c = P.dirt[2]; return c; }
  const b = M.occAt(W, x, y);
  if (b) { const T = M.TYPES[b.type]; if (T.field) return fieldPix(b, x, y, gx, gy, P, h, h2); if (!T.deco) { let c = P.dirt[(h * 2.6) | 0]; if (P.snow && h2 < .5) c = P.g[1]; return c; } }
  const w = ch.wear[k] / WK, dn = w + (h - .5) * .55;
  if (dn > .42) {
    let c = P.dirt[Math.min(3, Math.floor((h * 2 + (dn > .9 ? 1 : 0)) * 1.3))];
    if (h2 < .05) c = P.dirt[0]; if (h2 > .95) c = [150, 140, 128];
    if (dn < .55 && h < .5) c = pick(P.g, lf * 2.2 + h);
    if (P.snow && dn < .75 && h2 > .4) c = P.g[1];
    return c;
  }
  let t = lf * 2.1 + h * 1.4 - .35; if (fd > .6) t -= .7; if (gx % 2 === gy % 2 && h2 < .5) t += .4; if (w > .18) t -= .6;
  let c = pick(P.g, t); if (h2 < .03) c = P.g[0];
  if (h2 > .9965 && !P.snow && fd < .55 && w < .1) c = P.flo[(h * 4 * 977 | 0) % P.flo.length];
  return c;
}
function paintRect(ch, pxa, pya, pxb, pyb) {
  const [X0, Y0] = chunkOrigin(ch); pxa = Math.max(0, pxa); pya = Math.max(0, pya); pxb = Math.min(CW, pxb); pyb = Math.min(CH, pyb);
  const w = pxb - pxa, h = pyb - pya; if (w <= 0 || h <= 0) return;
  const P = PAL[season], ctx = ch.gc.getContext("2d"), img = ctx.getImageData(pxa, pya, w, h), d = img.data;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const c = pix(ch, X0 + pxa + i, Y0 + pya + j, P); if (!c) continue; const o = (j * w + i) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; }
  ctx.putImageData(img, pxa, pya); ch.ovDirty = true;
}
function bake(ch) {
  samples(ch);
  if (!ch.gc) { ch.gc = document.createElement("canvas"); ch.gc.width = CW; ch.gc.height = CH; }
  const [X0, Y0] = chunkOrigin(ch), P = PAL[season], ctx = ch.gc.getContext("2d"), img = ctx.createImageData(CW, CH), d = img.data, wp = [];
  for (let py = 0; py < CH; py++) for (let px = 0; px < CW; px++) { const c = pix(ch, X0 + px, Y0 + py, P); if (!c) continue; const o = (py * CW + px) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; if (c === P.water[0] || c === P.water[1]) if ((px * 7 + py * 13) % 5 === 0) wp.push(px, py); }
  ctx.putImageData(img, 0, 0); ch.waterPx = wp; ch.bakedSeason = season; ch.ovDirty = true;
  details(ch, ctx, P);
  paintFog(ch, 0, 0, CW, CH);
}
function details(ch, ctx, P) {
  const [X0, Y0] = chunkOrigin(ch);
  for (let y = ch.y0 + .5; y < ch.y0 + C; y += .9) for (let x = ch.x0 + .5; x < ch.x0 + C; x += .9) {
    const r = M.ih(Math.floor(x * 17), Math.floor(y * 13)); if (r > .07) continue;
    const jx = x + M.ih(Math.floor(x * 3), Math.floor(y)) * .8, jy = y + M.ih(Math.floor(x), Math.floor(y * 3)) * .8;
    if (Math.floor(jx / C) !== ch.cx || Math.floor(jy / C) !== ch.cy) continue;
    if (M.wearAt(W, jx, jy) > .3 || M.lakeV(jx, jy) > .64 || M.occAt(W, jx, jy)) continue;
    const px = Math.round(sx(jx, jy) - X0), py = Math.round(sy(jx, jy) - Y0);
    if (r < .03) { ctx.fillStyle = P.snow ? "#c9d2dc" : "#7e7a72"; ctx.fillRect(px, py, 2, 1); ctx.fillStyle = "#a8a49a"; ctx.fillRect(px, py - 1, 1, 1); }
    else if (r < .05 && !P.snow) { ctx.fillStyle = "#e8dcc4"; ctx.fillRect(px, py - 1, 1, 2); ctx.fillStyle = "#c04a30"; ctx.fillRect(px - 1, py - 2, 3, 1); }
  }
}
function fogT(tx, ty) { const ch = W.chunks.get(M.ckey(Math.floor(tx / C), Math.floor(ty / C))); if (!ch) return 1; return ch.fog[(ty - ch.y0) * C + (tx - ch.x0)]; }
function paintFog(ch, pxa, pya, pxb, pyb) {
  if (!ch.fc) { if (!ch.fog.some(v => v)) { ch.fogClear = true; return; } ch.fc = document.createElement("canvas"); ch.fc.width = CW; ch.fc.height = CH; }
  const [X0, Y0] = chunkOrigin(ch); pxa = Math.max(0, pxa); pya = Math.max(0, pya); pxb = Math.min(CW, pxb); pyb = Math.min(CH, pyb);
  const w = pxb - pxa, h = pyb - pya; if (w <= 0 || h <= 0) return;
  const ctx = ch.fc.getContext("2d"), img = ctx.createImageData(w, h), d = img.data; let any = false;
  const cache = new Map(), fv = (tx, ty) => { const k = tx * 100003 + ty; let v = cache.get(k); if (v === undefined) { v = fogT(tx, ty); cache.set(k, v); } return v; };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const gx = X0 + pxa + i, gy = Y0 + pya + j, b0 = (gy + .5) / 4, a = (gx + .5) / 8, x = (a + b0) / 2, y = (b0 - a) / 2;
    if (Math.floor(x / C) !== ch.cx || Math.floor(y / C) !== ch.cy) continue;
    const fx = x - .5, fy = y - .5, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const f = (fv(ix, iy) * (1 - tx) + fv(ix + 1, iy) * tx) * (1 - ty) + (fv(ix, iy + 1) * (1 - tx) + fv(ix + 1, iy + 1) * tx) * ty + (M.ih(gx * 3, gy * 7) - .5) * .35;
    if (f < .55) continue;
    const po = (((gy & 127) * FP) + (gx & 127)) * 3, o = (j * w + i) * 4, e = f < .68 ? 18 : 0;
    d[o] = fogPat[po] + e; d[o + 1] = fogPat[po + 1] + e; d[o + 2] = fogPat[po + 2] + e; d[o + 3] = 255; any = true;
  }
  ctx.clearRect(pxa, pya, w, h); ctx.putImageData(img, pxa, pya); ch.ovDirty = true;
  if (!ch.fog.some(v => v)) { // fully explored: drop fog canvas once neighbours are explored too
    let n = true; for (let j = -1; j <= 1 && n; j++) for (let i = -1; i <= 1; i++) { const q = W.chunks.get(M.ckey(ch.cx + i, ch.cy + j)); if (!q || q.fog.some(v => v)) { n = false; break; } }
    if (n) { ch.fc = null; ch.fogClear = true; }
  }
}
function worldRectPx(x0, y0, x1, y1) { return [Math.floor(sx(x0, y1)) - 2, Math.floor(sy(x0, y0)) - 2, Math.ceil(sx(x1, y0)) + 2, Math.ceil(sy(x1, y1)) + 2]; }
function repaintWorldRect(x0, y0, x1, y1, fogToo) {
  const [ga, gb, gc, gd] = worldRectPx(x0, y0, x1, y1);
  for (let cy = Math.floor(y0 / C); cy <= Math.floor(y1 / C); cy++) for (let cx = Math.floor(x0 / C); cx <= Math.floor(x1 / C); cx++) {
    const ch = W.chunks.get(M.ckey(cx, cy)); if (!ch || !ch.gc) continue; const [X0, Y0] = chunkOrigin(ch);
    paintRect(ch, ga - X0, gb - Y0, gc - X0, gd - Y0); if (fogToo) paintFog(ch, ga - X0, gb - Y0, gc - X0, gd - Y0);
  }
}
// ---------- sync with simulation ----------
export function setWorld(nw, old) {
  const prev = old || W; W = nw;
  if (prev && prev !== nw) {
    for (const ch of nw.chunks.values()) {
      const o = prev.chunks.get(ch.k); if (!o || !o.gc) continue;
      ch.gc = o.gc; ch.fc = o.fc; ch.ov = o.ov; ch.g = o.g; ch.waterPx = o.waterPx; ch.bakedSeason = o.bakedSeason; ch.fogClear = o.fogClear; ch.ovDirty = true;
      // repaint what differs
      for (let k = 0; k < C4 * C4; k++) if (((o.wear[k] / WK * 14) | 0) !== ((ch.wear[k] / WK * 14) | 0)) nw.dirtyGround.push(ch, k);
      let fd = false; for (let k = 0; k < C * C; k++) if (o.fog[k] !== ch.fog[k]) { fd = true; break; }
      if (fd) { if (!ch.fc && ch.fog.some(v => v)) ch.fogClear = false; paintFog(ch, 0, 0, CW, CH); }
    }
    const ob = new Map(prev.S.b.map(b => [b.id, b])); for (const b of nw.S.b) { const q = ob.get(b.id); if (!q || q.done !== b.done || q.stage !== b.stage || q.crop !== b.crop || (!b.done && Math.abs((q.prog || 0) - b.prog) > .05)) repaintWorldRect(b.x - .5, b.y - .5, b.x + b.a + .5, b.y + b.b + .5); }
    for (const b of prev.S.b) if (!nw.S.b.find(q => q.id === b.id)) repaintWorldRect(b.x - .5, b.y - .5, b.x + b.a + .5, b.y + b.b + .5);
  }
}
export function setSeason(s) { if (s === season && SP) return; season = s; SP = buildSprites(s); if (W) for (const ch of W.chunks.values()) ch.bakedSeason = null; }
function consume() {
  const dg = W.dirtyGround; let n = 0;
  while (dg.length && n < 300) { const ch = dg.shift(), k = dg.shift(); n++; if (!ch.gc) continue; const i = k % C4, j = (k / C4) | 0, x = ch.x0 + i / 4, y = ch.y0 + j / 4; repaintWorldRect(x, y, x + .25, y + .25); }
  const df = W.dirtyFog; let m = 0;
  while (df.length && m < 6) { const [cx, cy, r] = df.shift(); m++; repaintWorldRect(cx - r - 1.5, cy - r - 1.5, cx + r + 1.5, cy + r + 1.5, true); }
  for (const e of W.events) {
    if (e.k === "build" || e.k === "built" || e.k === "field" || e.k === "removed") { const b = e.b; repaintWorldRect(b.x - .5, b.y - .5, b.x + b.a + .5, b.y + b.b + .5); }
  }
}
// ---------- overview tiles (1/4 scale) ----------
function buildOverview(ch) {
  if (!ch.ov) { ch.ov = document.createElement("canvas"); ch.ov.width = CW / 4; ch.ov.height = CH / 4 + OVM; }
  const c = ch.ov.getContext("2d"), [X0, Y0] = chunkOrigin(ch);
  c.clearRect(0, 0, ch.ov.width, ch.ov.height); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high";
  if (ch.gc) c.drawImage(ch.gc, 0, OVM, CW / 4, CH / 4);
  const ents = [];
  for (const t of ch.trees) { if (M.hidden(W, t.x, t.y)) continue; const a = t.felled ? null : treeSprite(t); if (a) ents.push([t.x + t.y, a, t.x, t.y]); }
  for (const r of ch.rocks) if (r.stone > 0 && !M.hidden(W, r.x, r.y)) ents.push([r.x + r.y, (r.big ? SP.bigRock : SP.rock)[Math.floor(r.v * 3) % 3], r.x, r.y]);
  ents.sort((a, b) => a[0] - b[0]);
  for (const [, s, x, y] of ents) { const px = (sx(x, y) - X0 - s.ax) / 4, py = (sy(x, y) - Y0 - s.ay) / 4 + OVM; c.drawImage(s.canvas, px, py, s.w / 4, s.h / 4); }
  for (const b of W.S.b) { if (Math.floor((b.x + b.a / 2) / C) !== ch.cx || Math.floor((b.y + b.b / 2) / C) !== ch.cy) continue; const s = bSprite(b); if (!s) continue; c.drawImage(s.canvas, (sx(b.x, b.y) - X0 - s.ax) / 4, (sy(b.x, b.y) - Y0 - s.ay) / 4 + OVM, s.w / 4, s.h / 4); }
  if (ch.fc) c.drawImage(ch.fc, 0, OVM, CW / 4, CH / 4);
  ch.ovDirty = false; ch.ovAt = performance.now();
}
// ---------- sprites for things ----------
function treeSprite(t) { const g = Math.floor(t.v * 3) * 3 + (t.s < .95 ? 0 : t.s < 1.2 ? 1 : 2); if (t.t === "oak") return SP.oak[g]; if (t.t === "birch") return SP.birch[g & 1]; return SP.spruce[t.t === "spruceS" ? Math.floor(t.v * 3) * 3 : g]; }
function bSprite(b) { const B = SP.bld; if (B[b.type]) return B[b.type]; if (b.type === "camp") return B.tent; if (b.type === "well") return B.well; if (b.type === "bench") return B.bench; if (b.type === "torch") return B.torch; return null; }
// ---------- frame ----------
export const view = { cam: { x: 0, y: 0 }, zoom: 3, hover: null, ghost: null, sel: 0, hourOverride: null, seasonOverride: null, weatherOverride: null };
let cv, ctx, Vw = 300, Vh = 200, k = 1, R = 3, vx0 = 0, vy0 = 0, T = 0, hits = [], vig = null, parts = [], floats = [], says = new Map();
export function init(canvas) { cv = canvas; ctx = cv.getContext("2d"); }
export function resize() {
  const r = cv.parentElement.getBoundingClientRect(); const Z = view.zoom; R = Z >= 1 ? Z : 1; k = Z >= 1 ? 1 : Z;
  Vw = Math.max(60, Math.floor(r.width / R)); Vh = Math.max(60, Math.floor(r.height / R)); cv.width = Vw; cv.height = Vh;
  const g = ctx.createRadialGradient(Vw / 2, Vh / 2, Math.min(Vw, Vh) * .3, Vw / 2, Vh / 2, Math.hypot(Vw, Vh) * .58); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.45)");
  vig = document.createElement("canvas"); vig.width = Vw; vig.height = Vh; const x = vig.getContext("2d"); x.fillStyle = g; x.fillRect(0, 0, Vw, Vh);
}
const STOPS = [[0, [56, 70, 128]], [5.2, [70, 84, 140]], [6.4, [255, 176, 140]], [8, [255, 238, 220]], [10, [255, 255, 255]], [15, [255, 252, 240]], [17.2, [255, 222, 170]], [18.4, [255, 160, 120]], [19.6, [100, 96, 150]], [21, [58, 72, 128]], [24, [56, 70, 128]]];
function tint(h) { for (let i = 0; i < STOPS.length - 1; i++) { const a = STOPS[i], b = STOPS[i + 1]; if (h >= a[0] && h <= b[0]) { const t = (h - a[0]) / (b[0] - a[0]); return [0, 1, 2].map(q => a[1][q] + (b[1][q] - a[1][q]) * t); } } return [255, 255, 255]; }
export function nightOf(h) { const t = tint(h); return M.clamp((1 - (t[0] + t[1] + t[2]) / 765) / .45, 0, 1); }
const rain = Array.from({ length: 160 }, () => ({ x: Math.random(), y: Math.random(), s: .7 + Math.random() * .6 }));
function px(c, x, y, w, h, col, a) { c.fillStyle = col; if (a !== undefined) c.globalAlpha = a; c.fillRect(x, y, w, h); if (a !== undefined) c.globalAlpha = 1; }
export function frame(now, rdt) {
  T = now / 1000; if (!W) return;
  const S = W.S, clk = M.clockOf(S), hour = view.hourOverride ?? clk.hour, sea = view.seasonOverride || M.seasonOf(clk.month);
  if (sea !== season || !SP) setSeason(sea);
  consume(); W.events.length = 0;
  const Z = view.zoom, over = Z < .5;
  vx0 = Math.round(view.cam.x - Vw / k / 2); vy0 = Math.round(view.cam.y - Vh / k / 2);
  const VWa = Vw / k, VHa = Vh / k;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
  const pat = fogPattern(ctx); pat.setTransform(new DOMMatrix([k, 0, 0, k, -vx0 * k % (FP * k), -vy0 * k % (FP * k)]));
  ctx.fillStyle = pat; ctx.fillRect(0, 0, Vw, Vh);
  ctx.setTransform(k, 0, 0, k, 0, 0); ctx.imageSmoothingEnabled = k < 1; ctx.imageSmoothingQuality = "high";
  // visible tile range
  const inv = (gx, gy) => { const a = gx / 8, b = gy / 4; return [(a + b) / 2, (b - a) / 2]; };
  const cs = [inv(vx0, vy0), inv(vx0 + VWa, vy0), inv(vx0, vy0 + VHa), inv(vx0 + VWa, vy0 + VHa + 60)];
  const tx0 = Math.min(...cs.map(c => c[0])) - 2, tx1 = Math.max(...cs.map(c => c[0])) + 2, ty0 = Math.min(...cs.map(c => c[1])) - 2, ty1 = Math.max(...cs.map(c => c[1])) + 2;
  const vis = [];
  for (let cy = Math.floor(ty0 / C); cy <= Math.floor(ty1 / C); cy++) for (let cx = Math.floor(tx0 / C); cx <= Math.floor(tx1 / C); cx++) {
    const ch = W.chunks.get(M.ckey(cx, cy)); if (!ch) continue; const [X0, Y0] = chunkOrigin(ch);
    if (X0 - vx0 > VWa || Y0 - vy0 > VHa + 40 || X0 + CW - vx0 < 0 || Y0 + CH - vy0 < -OVM * 4) continue; vis.push(ch);
  }
  let baked = 0;
  for (const ch of vis) if (ch.bakedSeason !== season && baked < (over ? 6 : 2)) { bake(ch); baked++; }
  hits = [];
  if (over) {
    let ob = 0;
    for (const ch of vis) { if (!ch.gc || ch.bakedSeason !== season) continue; if ((!ch.ov || ch.ovDirty) && ob < 4 && (!ch.ov || performance.now() - (ch.ovAt || 0) > 1500)) { buildOverview(ch); ob++; } }
    vis.sort((a, b) => (a.cx + a.cy) - (b.cx + b.cy));
    for (const ch of vis) if (ch.ov) { const [X0, Y0] = chunkOrigin(ch); ctx.drawImage(ch.ov, X0 - vx0, Y0 - vy0 - OVM * 4, CW, CH + OVM * 4); }
    ctx.fillStyle = "#f4e6c0"; for (const p of S.people) if (!p.asleep) ctx.fillRect(Math.round(sx(p.x, p.y) - vx0 - 2), Math.round(sy(p.x, p.y) - vy0 - 6), 4, 6);
  } else {
    for (const ch of vis) if (ch.gc) { const [X0, Y0] = chunkOrigin(ch); ctx.drawImage(ch.gc, X0 - vx0, Y0 - vy0); }
    if (k >= 1) { ctx.fillStyle = rgb(PAL[season].water[2]); const ph = Math.floor(T * 2); for (const ch of vis) { const wp = ch.waterPx; if (!wp || !wp.length) continue; const [X0, Y0] = chunkOrigin(ch), n = wp.length / 2; for (let i = 0; i < Math.min(12, n / 30); i++) { const q = ((ph * 7919 + i * 104729 + ch.cx * 31) % n) * 2; ctx.fillRect(X0 + wp[q] - vx0, Y0 + wp[q + 1] - vy0, 2, 1); } } }
    for (const ch of vis) if (ch.fc) { const [X0, Y0] = chunkOrigin(ch); ctx.drawImage(ch.fc, X0 - vx0, Y0 - vy0); }
    drawEntities(vis, hour, VWa, VHa);
    drawGhost();
    for (const p of parts) { const q = p.a / p.l; ctx.globalAlpha = (1 - q) * .7; ctx.fillStyle = "#d6d6d0"; const s = q < .4 ? 2 : 1; ctx.fillRect(Math.round(p.x - vx0), Math.round(p.y - vy0), s, s); } ctx.globalAlpha = 1;
  }
  // particles update
  for (const p of parts) { p.a += rdt; p.y -= rdt * 7; p.x += rdt * (p.vx + 2); } parts = parts.filter(p => p.a < p.l);
  // light
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const wk = view.weatherOverride || S.weather.kind;
  let tn = tint(hour); if (wk !== "clear") tn = tn.map(v => v * (wk === "cloudy" || wk === "fog" ? .9 : .84));
  ctx.globalCompositeOperation = "multiply"; ctx.fillStyle = rgb(tn); ctx.fillRect(0, 0, Vw, Vh); ctx.globalCompositeOperation = "source-over";
  const n = nightOf(hour); if (n > .2 && !over) drawGlow(n, hour);
  if (wk === "fog") { ctx.fillStyle = "rgba(200,206,210,.18)"; ctx.fillRect(0, 0, Vw, Vh); }
  drawWeather(wk, rdt); ctx.drawImage(vig, 0, 0);
  if (Z >= 2 && !over) drawTexts(rdt);
}
function spr(list, s, wx, wy, depth, info, VWa, VHa) {
  if (!s) return; const x = sx(wx, wy) - s.ax - vx0, y = sy(wx, wy) - s.ay - vy0;
  if (x > VWa || y > VHa || x + s.w < 0 || y + s.h < 0) return;
  list.push({ depth, draw: () => ctx.drawImage(s.canvas, x, y), box: info ? [x, y, x + s.w, y + s.h, info] : null });
}
function drawEntities(vis, hour, VWa, VHa) {
  const S = W.S, ents = [], P = PAL[season], hv = view.hover;
  for (const ch of vis) {
    for (const t of ch.trees) {
      const x0 = sx(t.x, t.y) - vx0, y0 = sy(t.x, t.y) - vy0; if (x0 < -24 || x0 > VWa + 24 || y0 < -8 || y0 > VHa + 50) continue; if (M.hidden(W, t.x, t.y)) continue;
      if (t.felled) { if (!t.cleared || !M.occAt(W, t.x, t.y)) spr(ents, SP.stump, t.x, t.y, t.x + t.y, t.cleared ? null : { t: "Stump", d: "A young tree will grow here again." }, VWa, VHa); continue; }
      const a = treeSprite(t), x = x0 - a.ax, y = y0 - a.ay, near = hv && Math.abs(hv.vx - x0) < 12 && hv.vy > y && hv.vy < y0 + 2;
      ents.push({ depth: t.x + t.y, draw: () => ctx.drawImage(a.canvas, x, y), box: near ? [x0 - 6, y, x0 + 6, y0 + 2, { t: t.t === "oak" ? "Oak" : t.t === "birch" ? "Birch" : "Spruce", d: t.logs + " loads of wood left." }] : null });
    }
    for (const b of ch.bushes) { if (b.gone || M.hidden(W, b.x, b.y)) continue; const has = b.berries > 0 && P.berry; spr(ents, (has ? SP.bush : SP.bushBare)[Math.floor(b.v * 3) % 3], b.x, b.y, b.x + b.y, { t: "Berry bush", d: has ? "Ripe berries to pick." : "No berries right now." }, VWa, VHa); }
    for (const r of ch.rocks) { if (r.stone <= 0 || M.hidden(W, r.x, r.y)) continue; spr(ents, (r.big ? SP.bigRock : SP.rock)[Math.floor(r.v * 3) % 3], r.x, r.y, r.x + r.y, { t: r.big ? "Stone outcrop" : "Rock", d: r.stone + " loads of stone left." }, VWa, VHa); }
  }
  const R0 = S.res, tier = v => v >= 300 ? 2 : v >= 60 ? 1 : 0;
  for (const b of S.b) {
    const T = M.TYPES[b.type], info = { t: T.name + (b.done ? "" : " (being built)"), d: b.done ? T.d : "Building site: " + Math.round(b.prog * 100) + "% done." + (b.by === "mayor" ? " Ordered by the Mayor." : " The villagers' own idea."), b: b.id };
    if (b.type === "field") {
      if (b.done) { info.d = ["Plowed, waiting to be sown.", "Sown. Small sprouts.", "Growing.", "Ripe! Ready to harvest."][b.stage] + " Crop: " + M.CROPS[b.crop].name + (b.auto ? " (villagers' choice)." : " (Mayor's choice)."); if (b.stage >= 1) spr(ents, SP.bld.scarecrow, b.x + .7, b.y + .7, b.x + b.y + 1.4, null, VWa, VHa); }
      const [x0, y0] = [sx(b.x + b.a / 2, b.y + b.b / 2) - vx0, sy(b.x + b.a / 2, b.y + b.b / 2) - vy0]; hitsPush([x0 - 24, y0 - 10, x0 + 24, y0 + 10, info]); continue;
    }
    if (b.type === "camp") {
      spr(ents, SP.bld.tent, b.x + .2, b.y - .3, b.x + b.y + 2.6, info, VWa, VHa);
      const f = { x: b.x + 1.6, y: b.y + 2.3 }, fx = Math.round(sx(f.x, f.y) - vx0), fy = Math.round(sy(f.x, f.y) - vy0);
      ents.push({ depth: f.x + f.y, draw: () => drawFire(fx, fy, hour), box: [fx - 7, fy - 10, fx + 7, fy + 4, { t: "Firepit", d: "The heart of the village. People gather here at night." }] });
      if (Math.random() < .08) parts.push({ x: sx(f.x, f.y), y: sy(f.x, f.y) - 6, a: 0, l: 3 + Math.random() * 2, vx: (Math.random() - .3) * 3 });
      const st = { x: b.x - .7, y: b.y + 2.4 }, inf = { t: "Stockpile", d: "Wood " + R0.wood + " · Stone " + R0.stone + " · Food " + R0.food };
      if (R0.wood > 0) spr(ents, SP.wood[tier(R0.wood)], st.x, st.y, st.x + st.y, inf, VWa, VHa);
      if (R0.stone > 0) spr(ents, SP.stone[tier(R0.stone)], st.x + 1.2, st.y + .9, st.x + st.y + 2.1, inf, VWa, VHa);
      if (R0.food > 0) spr(ents, SP.food[tier(R0.food)], st.x - .5, st.y - 1.1, st.x + st.y - 1.6, inf, VWa, VHa);
      continue;
    }
    const s = bSprite(b); if (!s) continue;
    const ox = b.type === "well" ? -.2 : 0, X = sx(b.x + ox, b.y + ox) - s.ax - vx0, Y = sy(b.x + ox, b.y + ox) - s.ay - vy0;
    if (X > VWa || Y > VHa || X + s.w < 0 || Y + s.h < 0) continue;
    const depth = b.x + b.a + b.y + b.b - .5;
    if (b.done) {
      ents.push({ depth, draw: () => ctx.drawImage(s.canvas, X, Y), box: [X, Y, X + s.w, Y + s.h, info] });
      if (b.type === "torch") ents.push({ depth: depth + .01, draw: () => flame(X + s.flame[0], Y + s.flame[1], hour) });
    } else {
      const p = Math.max(.12, b.prog), cut = Math.floor(s.h * (1 - p));
      ents.push({ depth, draw: () => { ctx.drawImage(s.canvas, 0, cut, s.w, s.h - cut, X, Y + cut, s.w, s.h - cut); scaffold(b); }, box: [X, Y, X + s.w, Y + s.h, info] });
    }
    const prop = { wcut: [SP.wood[1], 2.5, .7], forage: [SP.food[1], 2.4, 1.2], fisher: [SP.bld.rack, 2.6, .9], quarry: [SP.stone[2], 2.5, .9], store: [SP.wood[tier(R0.wood)], 3.4, 1.4] }[b.type];
    if (prop && b.done) spr(ents, prop[0], b.x + prop[1], b.y + prop[2], b.x + prop[1] + b.y + prop[2], info, VWa, VHa);
  }
  // wagon + ox
  const wg = S.wagon, ws = wg.alongY ? SP.wagonM : SP.wagon;
  spr(ents, ws, wg.alongY ? wg.x - .65 : wg.x - 1.2, wg.alongY ? wg.y - 1.2 : wg.y - .65, wg.x + wg.y + .8, { t: "Wagon", d: S.phase === "choose" ? "Everything the settlers own. Waiting for the Mayor's decision." : "It carried the first settlers and all their tools." }, VWa, VHa);
  { const o = S.ox, x = Math.round(sx(o.x, o.y) - vx0), y = Math.round(sy(o.x, o.y) - vy0), fl = S.phase === "travel" ? (wg.hx - wg.hy >= 0 ? 1 : -1) : 1, fr = S.phase === "travel" ? Math.floor(T * 5) % 2 : 0; ents.push({ depth: o.x + o.y, draw: () => drawOx(x, y, fl, fr), box: [x - 5, y - 7, x + 6, y + 1, { t: "Ox", d: "Pulled the wagon all the way here. Now it grazes." }] }); }
  for (const p of S.people) {
    if (p.asleep) continue; const x = Math.round(sx(p.x, p.y) - vx0), y = Math.round(sy(p.x, p.y) - vy0); if (x < -6 || x > VWa + 6 || y < -4 || y > VHa + 10) continue;
    if (M.hidden(W, p.x, p.y)) continue;
    const fr = p.moving ? Math.floor(T * 6 + p.id) % 2 : 0;
    ents.push({ depth: p.x + p.y + .2, draw: () => drawPerson(x, y, p, fr), box: [x - 3, y - 9, x + 4, y + 1, { t: p.name, d: (p.act || "") + ". " + p.trait[0].toUpperCase() + p.trait.slice(1) + "." }], p });
  }
  ents.sort((a, b) => a.depth - b.depth);
  for (const e of ents) { e.draw(); if (e.box) hitsPush(e.box); }
  textAnchors = ents.filter(e => e.p).map(e => [e.p, e.box]);
}
let textAnchors = [];
function hitsPush(b) { hits.push(b); }
function scaffold(b) {
  ctx.fillStyle = "#8a6038";
  const pts = [[b.x, b.y + b.b], [b.x + b.a, b.y + b.b], [b.x + b.a, b.y], [b.x, b.y]];
  for (const [x, y] of pts) { const X = Math.round(sx(x, y) - vx0), Y = Math.round(sy(x, y) - vy0); ctx.fillRect(X, Y - 16, 1, 16); }
  for (const h of [6, 12]) for (let i = 0; i < 3; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; const A = [sx(x0, y0) - vx0, sy(x0, y0) - vy0 - h], B = [sx(x1, y1) - vx0, sy(x1, y1) - vy0 - h], L = Math.max(Math.abs(B[0] - A[0]), Math.abs(B[1] - A[1])); for (let s = 0; s <= L; s++) ctx.fillRect(Math.round(A[0] + (B[0] - A[0]) * s / L), Math.round(A[1] + (B[1] - A[1]) * s / L), 1, 1); }
}
function drawPerson(x, y, p, fr) {
  const cl = LOOK.cloth[p.look[0]], hair = LOOK.hair[p.look[1]], skin = LOOK.skin[p.look[2]];
  px(ctx, x - 2, y, 5, 1, "#000", .22);
  const bob = fr ? 1 : 0, s = p.sit ? 2 : 0;
  px(ctx, x - 1, y - 6 + bob + s, 3, 2, rgb(skin)); px(ctx, x - 1, y - 7 + bob + s, 3, 1, rgb(hair));
  px(ctx, x - 1, y - 4 + bob + s, 3, 2, rgb(cl)); px(ctx, x - 1, y - 4 + bob + s, 1, 2, rgb(cl.map(v => Math.min(255, v * 1.15))));
  if (!p.sit) { px(ctx, x - 1, y - 2 + bob, 1, 2 - bob, "#3a2c22"); px(ctx, x + 1, y - 2 + bob, 1, 1 + bob, "#3a2c22"); } else px(ctx, x - 2, y - 1, 5, 1, "#3a2c22");
  if (p.state === "work") {
    const sw = Math.floor(T * 4) % 2;
    if (p.job === "wood" || p.job === "stone" || p.job === "construct") { px(ctx, x + 2, y - 6 + sw * 2, 1, 3, "#6a4a2c"); px(ctx, x + 2, y - 6 + sw * 2, 2, 1, "#b8b8b8"); }
    else if (p.job === "fish") { ctx.fillStyle = "#cfd6d8"; for (let i = 0; i < 5; i++) ctx.fillRect(x + 2 + i, y - 7 + i, 1, 1); }
    else if (p.job === "berries" || p.job === "harvest" || p.job === "sow") px(ctx, x + 2, y - 3 + sw, 2, 2, "#8a5a30");
  }
  if (p.carry) { const t = p.carry.type; px(ctx, x - 2, y - 8 + bob, 4, 2, t === "wood" ? "#9a6a3a" : t === "stone" ? "#9a9890" : "#b03a30"); px(ctx, x - 2, y - 8 + bob, 4, 1, t === "wood" ? "#c89a60" : t === "stone" ? "#c8c6c0" : "#7050a0"); }
}
function drawOx(x, y, fl, fr) {
  px(ctx, x - 5, y, 11, 1, "#000", .22); const b = "#7a5034", d = "#5a3a24", h = fl > 0 ? x + 4 : x - 6;
  px(ctx, x - 4, y - 5, 8, 4, b); px(ctx, x - 4, y - 5, 8, 1, "#94643f"); px(ctx, x - 4, y - 2, 8, 1, d);
  px(ctx, x - 3, y - 1 + fr, 1, 1, d); px(ctx, x + 2, y - fr, 1, 1, d); px(ctx, x - 2, y - 1, 1, 1, d); px(ctx, x + 3, y - 1, 1, 1, d);
  px(ctx, h, y - 5, 3, 3, "#6a4430"); px(ctx, h, y - 6, 1, 1, "#e8dcc0"); px(ctx, h + 2, y - 6, 1, 1, "#e8dcc0"); px(ctx, fl > 0 ? h + 2 : h, y - 3, 1, 1, "#2a1a10");
}
function drawFire(x, y, hour) {
  const s = SP.pit; ctx.drawImage(s.canvas, x - s.ax, y - s.ay);
  px(ctx, x - 3, y - 1, 6, 1, "#4a3020"); px(ctx, x - 2, y - 2, 4, 1, "#6a4228");
  const big = nightOf(hour) > .3 ? 1 : 0;
  for (let i = -2; i <= 2; i++) { const h = 2 + big + Math.floor((Math.sin(T * 9 + i * 1.7) + Math.sin(T * 13 + i)) * 1.2 + 1.5 - Math.abs(i) * .6); for (let q = 0; q < h; q++) { ctx.fillStyle = q >= h - 1 ? "#fff2a0" : q > h * .5 ? "#ffb040" : "#e05a20"; ctx.fillRect(x + i, y - 2 - q, 1, 1); } }
}
function flame(x, y, hour) { if (nightOf(hour) < .15) { px(ctx, x - 1, y, 3, 1, "#3a2a1c"); return; } for (let i = -1; i <= 1; i++) { const h = 2 + Math.floor((Math.sin(T * 11 + i * 2) + 1) * 1.2) - Math.abs(i); for (let q = 0; q < h; q++) { ctx.fillStyle = q >= h - 1 ? "#fff2a0" : "#ffa030"; ctx.fillRect(x + i, y - q, 1, 1); } } }
function drawGlow(n, hour) {
  const S = W.S; ctx.globalCompositeOperation = "lighter";
  const glow = (x, y, r, a) => { x = (x - vx0) * k; y = (y - vy0) * k; r *= k; if (x < -r || y < -r || x > Vw + r || y > Vh + r) return; const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, "rgba(255,170,70," + a + ")"); g.addColorStop(1, "rgba(255,110,40,0)"); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); };
  for (const b of S.b) {
    if (!b.done) continue;
    if (b.type === "camp") { const f = { x: b.x + 1.6, y: b.y + 2.3 }; glow(sx(f.x, f.y), sy(f.x, f.y) - 3, 40 * (1 + Math.sin(T * 7) * .06), .55 * n); }
    else if (b.type === "torch") glow(sx(b.x, b.y) + 0, sy(b.x, b.y) - 14, 22, .5 * n);
    else if (M.TYPES[b.type].beds && hour > 17 && hour < 23.2 && S.people.some(p => p.home === b.id)) { const s = bSprite(b); if (s && s.wins) for (const w of s.wins) glow(sx(b.x, b.y) - s.ax + w[0], sy(b.x, b.y) - s.ay + w[1], 9, .5 * n); }
  }
  ctx.globalCompositeOperation = "source-over";
  for (const b of S.b) { if (!b.done || !M.TYPES[b.type].beds || b.type === "camp" || !(hour > 17 && hour < 23.2) || !S.people.some(p => p.home === b.id)) continue; const s = bSprite(b); if (!s) continue; ctx.fillStyle = "rgba(255,214,120," + n + ")"; for (const w of s.wins) ctx.fillRect(Math.round((sx(b.x, b.y) - s.ax + w[0] - vx0) * k) - 1, Math.round((sy(b.x, b.y) - s.ay + w[1] - vy0) * k) - 1, 2, 2); }
}
function drawWeather(wk, dt) {
  if (wk !== "rain" && wk !== "snow") return;
  for (const d of rain) { if (wk === "rain") { d.y += dt * 1.5 * d.s; d.x -= dt * .12; } else { d.y += dt * .22 * d.s; d.x += Math.sin(T * 1.5 + d.s * 9) * dt * .04; } if (d.y > 1.05) { d.y = -.05; d.x = Math.random(); } if (d.x < -.05) d.x = 1.05;
    const x = Math.round(d.x * Vw), y = Math.round(d.y * Vh); if (wk === "rain") { ctx.fillStyle = "rgba(170,200,236,.7)"; ctx.fillRect(x, y, 1, 3); } else { ctx.fillStyle = "rgba(250,252,255,.95)"; ctx.fillRect(x, y, 1, 1); } }
}
const SAY = ["Smells like rain.", "Good soil here.", "Listen, an eagle.", "I miss bread.", "Nice view.", "My back hurts.", "Who took my axe?", "Lovely day.", "The Mayor is watching.", "Warm fire tonight?"];
function drawTexts(dt) {
  ctx.font = "7px ui-monospace,Menlo,Consolas,monospace"; ctx.textBaseline = "top";
  for (const f of floats) { f.a += dt; ctx.globalAlpha = Math.max(0, 1 - f.a / 2.2); ctx.fillStyle = f.c; ctx.fillText(f.t, Math.round(sx(f.x, f.y) - vx0 - 8), Math.round(sy(f.x, f.y) - vy0 - 14 - f.a * 6)); } ctx.globalAlpha = 1; floats = floats.filter(f => f.a < 2.2);
  for (const [p, box] of textAnchors) {
    let s = says.get(p.id);
    if (!s && Math.random() < dt * .012 && p.state !== "sleep") { s = { t: SAY[(Math.random() * SAY.length) | 0], ttl: 4 }; says.set(p.id, s); }
    if (!s) continue; s.ttl -= dt; if (s.ttl <= 0) { says.delete(p.id); continue; }
    const w = Math.ceil(ctx.measureText(s.t).width) + 4, x = box[0] + 3, y = box[1] - 3;
    ctx.globalAlpha = .94; ctx.fillStyle = "#f6eedb"; ctx.fillRect(x - w / 2 | 0, y - 8, w, 9); ctx.fillRect((x | 0) - 1, y + 1, 2, 2); ctx.globalAlpha = 1; ctx.fillStyle = "#2a2218"; ctx.fillText(s.t, (x - w / 2 | 0) + 2, y - 7);
  }
}
export function addFloat(x, y, t, c) { floats.push({ x, y, t, c, a: 0 }); }
// ---------- placement ghost ----------
function drawGhost() {
  const g = view.ghost; if (!g) return;
  const col = g.ok ? "#ffd36a" : "#ff6a5a";
  if (g.kind === "settle") {
    const x = sx(g.x, g.y) - vx0, y = sy(g.x, g.y) - vy0, r = 4.3;
    ctx.globalAlpha = .18; ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, r * 11.3, r * 5.66, 0, 0, 6.29); ctx.fill(); ctx.globalAlpha = 1;
    for (let a = 0; a < 6.28; a += .05) { if (Math.floor(a * 8 + T * 2) % 2 === 0) continue; ctx.fillRect(Math.round(x + Math.cos(a) * r * 11.3) - 1, Math.round(y + Math.sin(a) * r * 5.66), 2, 1); }
    px(ctx, x, y - 14, 1, 14, "#5a3a24"); px(ctx, x + 1, y - 14, 5, 3, col); return;
  }
  const T0 = M.TYPES[g.type], x0 = g.x, y0 = g.y, a = T0.a, b = T0.b;
  const P = [[x0, y0], [x0 + a, y0], [x0 + a, y0 + b], [x0, y0 + b]].map(([x, y]) => [sx(x, y) - vx0, sy(x, y) - vy0]);
  ctx.globalAlpha = .28; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for (const q of P) ctx.lineTo(q[0], q[1]); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke();
  const s = bSprite({ type: g.type }); if (s) { ctx.globalAlpha = .55; ctx.drawImage(s.canvas, sx(x0, y0) - s.ax - vx0, sy(x0, y0) - s.ay - vy0); ctx.globalAlpha = 1; }
}
// ---------- coordinates ----------
export function toWorld(clientX, clientY) {
  const r = cv.getBoundingClientRect(), cxp = (clientX - r.left) / r.width * Vw, cyp = (clientY - r.top) / r.height * Vh;
  const ax = cxp / k + vx0, ay = cyp / k + vy0, a = ax / 8, b = ay / 4; return { x: (a + b) / 2, y: (b - a) / 2, vx: ax - vx0, vy: ay - vy0 };
}
export function hitAt(vx, vy) { for (let i = hits.length - 1; i >= 0; i--) { const b = hits[i]; if (vx >= b[0] && vx <= b[2] && vy >= b[1] && vy <= b[3]) return b[4]; } return null; }
export function artPerCss() { return Vw / k / cv.getBoundingClientRect().width; }
export function exploredBounds() {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const ch of W.chunks.values()) for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) { if (ch.fog[j * C + i]) continue; const x = ch.x0 + i, y = ch.y0 + j, X = sx(x, y), Y = sy(x, y); if (X - 8 < x0) x0 = X - 8; if (X + 8 > x1) x1 = X + 8; if (Y < y0) y0 = Y; if (Y + 8 > y1) y1 = Y + 8; }
  return { x0, y0, x1, y1 };
}
export function cssSize() { const r = cv.getBoundingClientRect(); return { w: r.width, h: r.height }; }
