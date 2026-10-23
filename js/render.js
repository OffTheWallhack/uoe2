// ============================================================
// Usage of Empires II — renderer. Ground and fog are painted per chunk into
// canvases (only when needed), entities are drawn per frame in depth order.
// Zoom: 1×..5× crisp pixels, 0.75×/0.5× smooth, 0.33×/0.25× from small overview tiles.
// ============================================================
import * as M from "./sim.js";
import { PAL, buildSprites, mix } from "./gfx.js";
import { wonderSprites, boatSprites } from "./wonders.js";
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
// ---------- terrain height (cached samples, 4 per tile, bilinear) ----------
const HC = new Map(), HS = C4 + 1;
function hcache(cx, cy) {
  const k = cx + "," + cy; let h = HC.get(k); if (h) return h;
  const a = new Float32Array(HS * HS); let mx = 0;
  for (let j = 0; j < HS; j++) for (let i = 0; i < HS; i++) { const v = M.heightAt(cx * C + i / 4, cy * C + j / 4); a[j * HS + i] = v; if (v > mx) mx = v; }
  h = { a, mx }; HC.set(k, h); return h;
}
let hcK = NaN, hcA = null; // last chunk looked up (most calls hit the same one)
export function hR(x, y) {
  const cx = Math.floor(x / C), cy = Math.floor(y / C), key = cx * 100003 + cy; if (key !== hcK) { hcA = hcache(cx, cy).a; hcK = key; } const h = hcA, fx = (x - cx * C) * 4, fy = (y - cy * C) * 4, i = Math.min(HS - 2, Math.floor(fx)), j = Math.min(HS - 2, Math.floor(fy)), tx = fx - i, ty = fy - j, o = j * HS + i;
  return (h[o] * (1 - tx) + h[o + 1] * tx) * (1 - ty) + (h[o + HS] * (1 - tx) + h[o + HS + 1] * tx) * ty;
}
const gyH = (x, y) => sy(x, y) - hR(x, y);
// ray through a screen pixel: the visible ground point (x, y, z) and which face (1 top, 2 side facing +x, 3 side facing +y)
function rayHit(gx, gy, tmax) {
  const a = (gx + .5) / 8, b = (gy + .5) / 4, x0 = (a + b) / 2, y0 = (b - a) / 2;
  let t = tmax; while (t > 0 && 8 * t > hR(x0 + t, y0 + t)) t -= .125;
  if (t < 0) t = 0;
  return rayFinish(x0, y0, t, tmax);
}
function rayFinish(x0, y0, t, tmax) {
  let lo = t, hi = Math.min(tmax, t + .125);
  if (hi > lo) for (let q = 0; q < 5; q++) { const m = (lo + hi) / 2; if (8 * m <= hR(x0 + m, y0 + m)) lo = m; else hi = m; }
  const x = x0 + lo, y = y0 + lo, z = 8 * lo, h = hR(x, y);
  let face = 1;
  if (h - z > 1.1) { const dx = hR(x + .2, y) - hR(x - .2, y), dy = hR(x, y + .2) - hR(x, y - .2); face = Math.abs(dx) > Math.abs(dy) ? 2 : 3; }
  return { x, y, z, face };
}
// ---------- per chunk painting ----------
const CW = C * 16, CH = C * 8, OVM = 24; // chunk canvas size; overview top margin (1/4 px)
export const chunkOrigin = ch => [(ch.cx - ch.cy - 1) * C * 8, (ch.cx + ch.cy) * C * 4 - (ch.hm || 0)];
function chunkMargin(ch) { if (ch.hm === undefined) { let m = 0; for (let j = 0; j <= 1; j++) for (let i = 0; i <= 1; i++) m = Math.max(m, hcache(ch.cx + i, ch.cy + j).mx); ch.hm = Math.ceil(m) + 2; ch.hmax = m; } return ch.hm; }
function samples(ch) {
  if (ch.g) return ch.g;
  const n = C4 * C4, lf = new Float32Array(n), fd = new Float32Array(n), lk = new Float32Array(n), rv = new Float32Array(n), bi = new Float32Array(n), fl = new Float32Array(n), ds = new Float32Array(n), sw = new Float32Array(n), tu = new Float32Array(n), gv = new Float32Array(n);
  for (let j = 0; j < C4; j++) for (let i = 0; i < C4; i++) { const x = ch.x0 + (i + .5) / 4, y = ch.y0 + (j + .5) / 4, k = j * C4 + i; lf[k] = M.lfV(x, y); fd[k] = M.fdV(x, y); lk[k] = M.lakeV(x, y); rv[k] = M.isWater(x, y) ? 9 : M.riverD(x, y) - .55; bi[k] = M.birchV(x, y); fl[k] = M.flowerV(x, y); ds[k] = M.desertV(x, y); sw[k] = M.swampV(x, y); tu[k] = M.tundraV(x, y); gv[k] = M.groveV(x, y); }
  return ch.g = { lf, fd, lk, rv, bi, fl, ds, sw, tu, gv };
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
const SAND = [[214, 196, 146], [226, 210, 160], [236, 224, 180]], WETSAND = [[178, 160, 116], [196, 178, 132]], ROCK = [[112, 104, 94], [132, 122, 108], [152, 142, 126], [96, 88, 80]];
function pix(ch, gx, gy, P, x, y, face, z) {
  const g = ch.g, i = Math.min(C4 - 1, Math.floor((x - ch.x0) * 4)), j = Math.min(C4 - 1, Math.floor((y - ch.y0) * 4)), k = j * C4 + i, h = M.ih(gx, gy), h2 = M.ih(gx * 7 + 3, gy * 5 + 1);
  const lk = g.lk[k], lf = g.lf[k], fd = g.fd[k];
  const ov = M.overAt(x, y);
  if (ov && ov.k === "b") { // bridge: plank deck, dark posts on the sides
    if (face > 1) return (Math.floor((ov.d ? x : y) * 3) % 3 === 0) ? [70, 48, 30] : [104, 74, 46];
    const along = ov.d ? x : y, across = ov.d ? y : x, fa = ((across % 1) + 1) % 1;
    if (fa < .13 || fa > .87) return [92, 64, 40];
    let c = (((along * 3.2) % 1 + 1) % 1) < .16 ? [96, 68, 42] : h < .5 ? [168, 124, 78] : [150, 108, 66]; if (P.snow && h2 < .6) c = [232, 238, 244]; return c;
  }
  if (face > 1) { // cliff face: layered rock
    const hh = hR(x, y); if (hh - z < 1.3) return P.snow ? P.g[2] : (hh < 3 ? SAND[0] : P.g[0]);
    let c = ROCK[((Math.floor(z / 3) + (h < .2 ? 1 : 0)) & 1) + (h2 < .3 ? 2 : 0)]; if (h2 > .93) c = ROCK[3];
    const sh = face === 2 ? .72 : .98; return [c[0] * sh, c[1] * sh, c[2] * sh];
  }
  const ht = z;
  if (ov && ov.k === "f") { let c = h < .33 ? [146, 138, 124] : h < .66 ? [170, 160, 142] : [124, 116, 104]; if (h2 < .1) c = [196, 188, 170]; if (P.snow && h2 < .5) c = P.g[2]; return c; }
  const rl = M.isRoad(x, y); if (rl) { const fx = ((x % 1) + 1) % 1, fy = ((y % 1) + 1) % 1, edge = Math.min(fx, fy, 1 - fx, 1 - fy); if (edge > .06 || M.isRoad(x + (fx < .5 ? -1 : 1), y) || M.isRoad(x, y + (fy < .5 ? -1 : 1))) { if (rl === 2 && !P.snow) { const u = x * 3.2 + (Math.floor(y * 3.2) & 1) * .5, v = y * 3.2, gu = u - Math.floor(u), gv = v - Math.floor(v); if (gu < .14 || gv < .16) return [96, 90, 82]; const r = M.ih(Math.floor(u) * 13 + 7, Math.floor(v) * 11 + 3), q = 150 + r * 34 - (gu > .8 || gv > .8 ? 18 : 0); return [q, q * .96, q * .9]; } let c = h < .3 ? [140, 128, 108] : h < .7 ? [162, 150, 128] : [122, 110, 94]; if (h2 < .08) c = [196, 186, 164]; if (P.snow && h2 < .7) c = P.g[1]; return c; } }
  if (lk > .7) { const dp = M.clamp((lk - .7) / .08, 0, 1); let c = P.water[dp > .5 ? 0 : 1]; if (h2 < .06) c = P.water[2]; if (!P.snow && ((((x * 3 + y * 2) % 1) + 1) % 1 < .08)) c = P.water[2]; return c; }
  if (g.rv[k] < 2.2) { // the stream and its pebbly banks
    if (M.isRiver(x, y)) { let c = P.snow ? [176, 200, 216] : [70, 128, 160]; if (h2 < .1 || (((x + y * 1.7) * 2.5) % 1 + 1) % 1 < .12) c = P.snow ? [214, 228, 238] : [130, 180, 200]; return c; }
    if (g.rv[k] < .9 && !P.snow) { let c = h < .5 ? P.dirt[1] : [150, 142, 128]; if (h2 < .2) c = [178, 172, 160]; return c; }
  }
  if (g.ds[k] > 0 && lk < .6) { // desert: dunes
    if (P.snow) return h2 < .5 ? P.g[2] : P.g[1];
    const rp = Math.sin((x - y) * 1.15 + Math.sin(y * .35) * 2.2 + g.ds[k] * 6); let c = SAND[(h * 2.4) | 0]; if (rp > .72) c = [240, 228, 186]; else if (rp < -.78) c = [196, 172, 124]; if (h2 < .03) c = [168, 146, 108]; return c;
  }
  if (g.sw[k] > 0 && lk < .68) { // swamp: mud, moss and shallow pools
    const pool = M.vn(x * .8 + 300, y * .8 - 40, 3.4) + (h2 - .5) * .12;
    let c = h < .35 ? [78, 86, 48] : h < .7 ? [92, 98, 56] : [66, 76, 44]; if (lf > .55) c = mix(c, [84, 112, 52], .45); if (h2 < .05) c = [52, 58, 36];
    if (pool > .64) { c = h2 < .08 ? [132, 156, 140] : pool > .72 ? [48, 66, 62] : [64, 88, 78]; if (P.snow) c = pool > .72 ? [176, 200, 212] : [204, 220, 230]; }
    else if (P.snow) c = mix(c, [232, 238, 244], h2 < .4 ? .8 : .55);
    return c;
  }
  if (lk > .6 && ht < 2.6) { // beach
    if (P.snow) return h2 < .5 ? P.g[2] : P.g[1];
    let c = lk > .675 ? WETSAND[h < .5 ? 0 : 1] : SAND[(h * 2.4) | 0]; if (h2 < .04) c = [236, 232, 220]; if (h2 > .985 && lk < .67) c = [196, 120, 110];
    return c;
  }
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
  // slope light: ground facing the upper left is brighter
  const sl = (hR(x + .25, y) - hR(x - .25, y)) + (hR(x, y + .25) - hR(x, y - .25));
  let t = lf * 2.1 + h * 1.4 - .35 + M.clamp(sl * .38, -1.6, 1.3); if (fd > .6) t -= .7; if (gx % 2 === gy % 2 && h2 < .5) t += .4; if (w > .18) t -= .6;
  const bv = g.bi[k], fv = g.fl[k], alp = ht >= 20 && ht < 38;
  if (bv > .45 && ht < 15) t += .45;                  // birch grove: lighter, sunnier grass
  if (fv > .45 && ht < 15) t += .3;
  let c = pick(P.g, t); if (h2 < .03) c = P.g[0];
  if (g.gv[k] > 0 && !P.snow) { c = mix(c, h < .5 ? [190, 138, 48] : [168, 122, 40], .6); if (h2 > .93) c = h < .5 ? [200, 76, 32] : [226, 160, 44]; else if (h2 < .05) c = [130, 74, 30]; }
  if (g.tu[k] > 0) { const sh = M.clamp(-sl * .05, 0, .3); c = h2 < .12 ? [168, 188, 204] : h < .22 ? [212, 226, 238] : [240, 245, 251]; if (!P.snow && h2 > .9 && lf > .45) c = h < .5 ? [118, 130, 96] : [98, 112, 84]; if (M.vn(x * .6 + 900, y * .6, 4) > .7 && h2 < .5) c = [190, 214, 232]; c = mix(c, [168, 186, 210], sh); return c; }
  if (alp && !P.snow) c = mix(c, [150, 162, 80], .35); // mountain meadow
  if (!P.snow && w < .15) {
    if (fv > .45 && ht < 15) { const dens = (fv - .45) * (season === "autumn" ? .25 : season === "spring" ? 1.1 : 1); if (h2 > 1 - dens * .5) { const kind = Math.floor(M.vn(x * 1.3 + 50, y * 1.3, 2.5) * 5) % 4; c = [[214, 58, 48], [80, 110, 220], [244, 242, 230], [240, 206, 64]][kind]; if (M.ih(gx + 1, gy) < .3) c = mix(c, [0, 0, 0], .2); } }
    else if (alp && h2 > .985) c = h < .5 ? [70, 100, 210] : [240, 240, 232];
    else if (bv > .45 && ht < 15 && season === "spring" && h2 > .985) c = [246, 246, 236];
  }
  if (sl < -4.2 && !P.snow) c = mix(c, h < .6 ? mix(P.g[0], [20, 30, 16], .3) : ROCK[0], M.clamp((-sl - 4.2) / 4, 0, .7));
  if (sl < -1 && ((ht + .6) % 6) > 5.2 && h2 < .7) c = mix(c, [0, 0, 0], .18);
  if (ht > 27 && !P.snow) { const r = (ht - 27) / 12 + (h - .5) * .5 + (lf - .5); if (r > .7) c = ROCK[(h2 * 3) | 0]; else if (r > .35 && h2 < .3) c = mix(c, ROCK[1], .55); }
  if (ht > 38 + (h - .5) * 4) c = h2 < .15 || sl < -2 ? [206, 216, 228] : [238, 243, 250];
  if (h2 > .9965 && !P.snow && fd < .55 && w < .1 && ht < 22) c = P.flo[(h * 4 * 977 | 0) % P.flo.length];
  return c;
}
function paintRect(ch, pxa, pya, pxb, pyb) {
  const [X0, Y0] = chunkOrigin(ch), Hh = CH + ch.hm; pxa = Math.max(0, pxa); pya = Math.max(0, pya); pxb = Math.min(CW, pxb); pyb = Math.min(Hh, pyb);
  const w = pxb - pxa, h = pyb - pya; if (w <= 0 || h <= 0) return;
  const P = PAL[season], ctx = ch.gc.getContext("2d"), img = ctx.getImageData(pxa, pya, w, h), d = img.data;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const q = (pya + j) * CW + pxa + i, f = ch.hf[q]; if (!f) continue; const pos = ch.hp[q], x = ch.x0 + ((pos & 255) + .5) / 8, y = ch.y0 + ((pos >> 8) + .5) / 8; const c = pix(ch, X0 + pxa + i, Y0 + pya + j, P, x, y, f, ch.hz[q]); const o = (j * w + i) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; }
  ctx.putImageData(img, pxa, pya); ch.ovG = (ch.ovG || 0) + 1;
}
// Baking a chunk's ground is expensive (a ray-march + a colour per pixel), so it runs as a resumable job:
// a few rows per frame within a time budget, never freezing the view.
function bakeSome(ch, until) {
  let j = ch.job;
  if (!j) {
    samples(ch); chunkMargin(ch);
    j = ch.job = { st: ch.hf ? 1 : 0, py: 0, n: CW * (CH + ch.hm) };
    if (!ch.hf) { j.hp = new Uint16Array(j.n); j.hf = new Uint8Array(j.n); j.hz = new Uint8Array(j.n); }
  }
  const Hh = CH + ch.hm, [X0, Y0] = chunkOrigin(ch);
  if (j.st === 0) {
    // Every pixel of one screen column looks along the same line on the ground, shifted by 1/8 tile per row.
    // So terrain heights along that line are sampled once per column and the ray march only reads the array.
    const MT = Math.ceil((ch.hmax / 8 + .05) * 8), tmax = MT / 8, L = Hh + MT + 1;
    if (!j.col) { j.col = new Float32Array(CW * L); j.px = 0; }
    while (j.px < CW) {
      const px = j.px++, a = (X0 + px + .5) / 8, b = (Y0 + .5) / 4, x0 = (a + b) / 2, y0 = (b - a) / 2, o = px * L;
      for (let k = 0; k < L; k++) j.col[o + k] = hR(x0 + k * .125, y0 + k * .125);
      if ((px & 15) === 15 && performance.now() > until) return false;
    }
    while (j.py < Hh) {
      const py = j.py++;
      for (let px = 0; px < CW; px++) {
        const o = px * L + py; let m = MT; while (m > 0 && m > j.col[o + m]) m--;
        const a = (X0 + px + .5) / 8, b = (Y0 + py + .5) / 4;
        const r = rayFinish((a + b) / 2, (b - a) / 2, m / 8, tmax); if (Math.floor(r.x / C) !== ch.cx || Math.floor(r.y / C) !== ch.cy) continue;
        const q = py * CW + px; j.hf[q] = r.face; j.hz[q] = Math.min(255, Math.round(r.z)); j.hp[q] = (Math.min(255, Math.floor((r.y - ch.y0) * 8)) << 8) | Math.min(255, Math.floor((r.x - ch.x0) * 8));
      }
      if ((py & 3) === 3 && performance.now() > until) return false;
    }
    ch.hp = j.hp; ch.hf = j.hf; ch.hz = j.hz; j.hp = j.hf = j.hz = j.col = null; j.st = 1; j.py = 0;
  }
  if (j.st === 1) {
    if (!ch.hf) { ch.job = null; return false; }
    if (!j.img) { j.img = new ImageData(CW, Hh); j.wp = []; j.season = season; }
    if (j.season !== season) { j.img = new ImageData(CW, Hh); j.wp = []; j.season = season; j.py = 0; }
    const P = PAL[season], d = j.img.data;
    while (j.py < Hh) {
      const py = j.py++;
      for (let px = 0; px < CW; px++) {
        const q = py * CW + px, f = ch.hf[q]; if (!f) continue; const pos = ch.hp[q], x = ch.x0 + ((pos & 255) + .5) / 8, y = ch.y0 + ((pos >> 8) + .5) / 8;
        const c = pix(ch, X0 + px, Y0 + py, P, x, y, f, ch.hz[q]); const o = q * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
        if ((c === P.water[0] || c === P.water[1]) && (px * 7 + py * 13) % 5 === 0) j.wp.push(px, py);
      }
      if ((py & 3) === 3 && performance.now() > until) return false;
    }
    if (!ch.gc) { ch.gc = document.createElement("canvas"); ch.gc.width = CW; ch.gc.height = Hh; }
    const ctx = ch.gc.getContext("2d"); ctx.putImageData(j.img, 0, 0); ch.waterPx = j.wp; ch.bakedSeason = season; ch.ovG = (ch.ovG || 0) + 1;
    details(ch, ctx, P);
    paintFog(ch, 0, 0, CW, Hh);
    ch.job = null; return true;
  }
  ch.job = null; return true;
}
function bake(ch) { bakeSome(ch, Infinity); }
// Quick 1/4-resolution version of a chunk's ground (1/16 of the work). Shown while the full one is still baking,
// and used as is for the far-out overview. Hidden tiles stay transparent.
function quickSome(ch, until) {
  let j = ch.qj;
  if (!j || j.season !== season) { samples(ch); chunkMargin(ch); const w = CW / 4, h = Math.ceil((CH + ch.hm) / 4); j = ch.qj = { py: 0, w, h, img: new ImageData(w, h), season }; }
  const [X0, Y0] = chunkOrigin(ch), P = PAL[season], d = j.img.data, tmax = ch.hmax / 8 + .05;
  while (j.py < j.h) {
    const py = j.py++;
    for (let px = 0; px < j.w; px++) {
      const gx = X0 + px * 4 + 2, gy = Y0 + py * 4 + 2, r = rayHit(gx, gy, tmax);
      if (Math.floor(r.x / C) !== ch.cx || Math.floor(r.y / C) !== ch.cy || M.hidden(W, r.x, r.y)) continue;
      const c = pix(ch, gx, gy, P, r.x, r.y, r.face, Math.min(255, Math.round(r.z))), o = (py * j.w + px) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
    if (performance.now() > until) return false;
  }
  if (!ch.lq || ch.lq.height !== j.h) { ch.lq = document.createElement("canvas"); ch.lq.width = j.w; ch.lq.height = j.h; }
  ch.lq.getContext("2d").putImageData(j.img, 0, 0); ch.lqSeason = season; ch.qj = null; ch.ovG = (ch.ovG || 0) + 1; return true;
}
function details(ch, ctx, P) {
  const [X0, Y0] = chunkOrigin(ch);
  for (let y = ch.y0 + .5; y < ch.y0 + C; y += .9) for (let x = ch.x0 + .5; x < ch.x0 + C; x += .9) {
    const r = M.ih(Math.floor(x * 17), Math.floor(y * 13)); if (r > .07) continue;
    const jx = x + M.ih(Math.floor(x * 3), Math.floor(y)) * .8, jy = y + M.ih(Math.floor(x), Math.floor(y * 3)) * .8;
    if (Math.floor(jx / C) !== ch.cx || Math.floor(jy / C) !== ch.cy) continue;
    if (M.wearAt(W, jx, jy) > .3 || M.lakeV(jx, jy) > .64 || M.occAt(W, jx, jy)) continue;
    if (M.steep(jx, jy, jx + .5, jy) || M.steep(jx, jy, jx, jy + .5) || M.lakeV(jx, jy) > .6) continue;
    const px = Math.round(sx(jx, jy) - X0), py = Math.round(gyH(jx, jy) - Y0);
    if (r < .03) { ctx.fillStyle = P.snow ? "#c9d2dc" : "#7e7a72"; ctx.fillRect(px, py, 2, 1); ctx.fillStyle = "#a8a49a"; ctx.fillRect(px, py - 1, 1, 1); }
    else if (r < .05 && !P.snow) { ctx.fillStyle = "#e8dcc4"; ctx.fillRect(px, py - 1, 1, 2); ctx.fillStyle = "#c04a30"; ctx.fillRect(px - 1, py - 2, 3, 1); }
  }
}
function fogT(tx, ty) { const ch = W.chunks.get(M.ckey(Math.floor(tx / C), Math.floor(ty / C))); if (!ch) return 1; return ch.fog[(ty - ch.y0) * C + (tx - ch.x0)]; }
function paintFog(ch, pxa, pya, pxb, pyb) {
  if (!ch.hf) return;
  if (!ch.fc) { if (!ch.fog.some(v => v)) { ch.fogClear = true; return; } ch.fc = document.createElement("canvas"); ch.fc.width = CW; ch.fc.height = CH + ch.hm; }
  const Hh = CH + ch.hm, [X0, Y0] = chunkOrigin(ch); pxa = Math.max(0, pxa); pya = Math.max(0, pya); pxb = Math.min(CW, pxb); pyb = Math.min(Hh, pyb);
  const w = pxb - pxa, h = pyb - pya; if (w <= 0 || h <= 0) return;
  const ctx = ch.fc.getContext("2d"), img = ctx.createImageData(w, h), d = img.data;
  const cache = new Map(), fv = (tx, ty) => { const k = tx * 100003 + ty; let v = cache.get(k); if (v === undefined) { v = fogT(tx, ty); cache.set(k, v); } return v; };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const q = (pya + j) * CW + pxa + i; if (!ch.hf[q]) continue;
    const gx = X0 + pxa + i, gy = Y0 + pya + j, pos = ch.hp[q], x = ch.x0 + ((pos & 255) + .5) / 8, y = ch.y0 + ((pos >> 8) + .5) / 8;
    const fx = x - .5, fy = y - .5, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const f = (fv(ix, iy) * (1 - tx) + fv(ix + 1, iy) * tx) * (1 - ty) + (fv(ix, iy + 1) * (1 - tx) + fv(ix + 1, iy + 1) * tx) * ty + (M.ih(gx * 3, gy * 7) - .5) * .35;
    if (f < .55) continue;
    const po = (((gy & 127) * FP) + (gx & 127)) * 3, o = (j * w + i) * 4, e = f < .68 ? 18 : 0;
    d[o] = fogPat[po] + e; d[o + 1] = fogPat[po + 1] + e; d[o + 2] = fogPat[po + 2] + e; d[o + 3] = 255;
  }
  ctx.clearRect(pxa, pya, w, h); ctx.putImageData(img, pxa, pya); ch.ovG = (ch.ovG || 0) + 1;
  if (!ch.fog.some(v => v)) {
    let n = true; for (let j = -1; j <= 1 && n; j++) for (let i = -1; i <= 1; i++) { const q = W.chunks.get(M.ckey(ch.cx + i, ch.cy + j)); if (!q || q.fog.some(v => v)) { n = false; break; } }
    if (n) { ch.fc = null; ch.fogClear = true; }
  }
}
function worldRectPx(x0, y0, x1, y1) { const hm = Math.max(hR(x0, y0), hR(x1, y1), hR(x0, y1), hR(x1, y0), hR((x0 + x1) / 2, (y0 + y1) / 2)) + 4; return [Math.floor(sx(x0, y1)) - 2, Math.floor(sy(x0, y0) - hm) - 2, Math.ceil(sx(x1, y0)) + 2, Math.ceil(sy(x1, y1)) + 2]; }
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
      ch.gc = o.gc; ch.fc = o.fc; ch.ov2 = o.ov2; ch.ov4 = o.ov4; ch.g = o.g; ch.waterPx = o.waterPx; ch.bakedSeason = o.bakedSeason; ch.fogClear = o.fogClear; ch.ovG = (ch.ovG || 0) + 1; ch.hm = o.hm; ch.hmax = o.hmax; ch.hp = o.hp; ch.hf = o.hf; ch.hz = o.hz;
      // repaint what differs
      for (let k = 0; k < C4 * C4; k++) if (((o.wear[k] / WK * 14) | 0) !== ((ch.wear[k] / WK * 14) | 0)) nw.dirtyGround.push(ch, k);
      let fd = false; for (let k = 0; k < C * C; k++) if (o.fog[k] !== ch.fog[k]) { fd = true; break; }
      if (fd) { if (!ch.fc && ch.fog.some(v => v)) ch.fogClear = false; paintFog(ch, 0, 0, CW, CH + (ch.hm || 0)); }
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
    else if (e.k === "road") for (const k of e.tiles) { const [x, y] = k.split(":").map(Number); repaintWorldRect(x - .6, y - .6, x + 1.6, y + 1.6); }
    else if (e.k === "over") {
      for (let cy = Math.floor((e.y0 - 1) / C); cy <= Math.floor((e.y1 + 1) / C); cy++) for (let cx = Math.floor((e.x0 - 1) / C); cx <= Math.floor((e.x1 + 1) / C); cx++) {
        HC.delete(cx + "," + cy); hcK = NaN; const ch = W.chunks.get(M.ckey(cx, cy)); if (ch) { ch.g = null; ch.hf = null; ch.hm = undefined; ch.job = null; ch.qj = null; ch.lq = null; ch.lqSeason = null; ch.bakedSeason = null; ch.gc = null; ch.fc = null; ch.ov2 = null; ch.ov4 = null; }
      }
    }
    else if (e.k === "bell") { floats.push({ x: e.b.x + 3.4, y: e.b.y + .9, t: "ding dong", c: "#f0c860", a: 0 }); }
  }
}
// ---------- overview tiles (1/4 scale) ----------
let _ovt = null; function ovTmp(w, h) { if (!_ovt || _ovt.width !== w || _ovt.height < h) { _ovt = document.createElement("canvas"); _ovt.width = w; _ovt.height = h + 8; } return _ovt; }
function buildOverview(ch, f) {
  // simplified pre-rendered tile (1/f resolution) used when zoomed out: ground + trees + rocks + buildings, fog on top
  const key = "ov" + f, m = OVM * 4 / f; let o = ch[key];
  if (!o) { o = ch[key] = document.createElement("canvas"); o.width = CW / f; o.height = Math.ceil((CH + ch.hm) / f) + m; }
  const c = o.getContext("2d"), [X0, Y0] = chunkOrigin(ch);
  c.clearRect(0, 0, o.width, o.height); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high";
  const full = ch.gc && ch.bakedSeason === season;
  if (full) c.drawImage(ch.gc, 0, m, CW / f, (CH + ch.hm) / f); else if (ch.lq) { c.imageSmoothingEnabled = f > 2; c.drawImage(ch.lq, 0, m, CW / f, ch.lq.height * 4 / f); c.imageSmoothingEnabled = true; }
  const ents = [];
  for (const t of ch.trees) { if (t.gone || M.hidden(W, t.x, t.y)) continue; const a = t.felled ? (t.sapling ? SP.bld.sapling[(t.t === "oak" || t.t === "birch" ? 2 : 0) + 1] : t.cleared ? null : SP.stump) : treeSprite(t); if (a) ents.push([t.x + t.y, a, t.x, t.y, 0]); }
  for (const r of ch.rocks) if (r.stone > 0 && !M.hidden(W, r.x, r.y)) ents.push([r.x + r.y, (r.big ? SP.bigRock : SP.rock)[Math.floor(r.v * 3) % 3], r.x, r.y, 0]);
  for (const b of W.S.b) { if (Math.floor((b.x + b.a / 2) / C) !== ch.cx || Math.floor((b.y + b.b / 2) / C) !== ch.cy) continue; const s = bSprite(b); if (!s) continue; ents.push([b.x + b.y + b.a / 2 + b.b / 2, s, b.x, b.y, 1, b]); }
  { const WS = wonderSprites(season); for (const w of W.S.wonders || []) if (Math.floor(w.x / C) === ch.cx && Math.floor(w.y / C) === ch.cy && WS[w.k]) ents.push([w.x + w.y, WS[w.k], w.x, w.y, 0]); }
  ents.sort((a, b) => a[0] - b[0]); c.imageSmoothingQuality = "low";
  for (const [, s, x, y, isB, b] of ents) {
    const px = (sx(x, y) - X0 - s.ax) / f, py = ((isB ? sy(x, y) - bH(b) : gyH(x, y)) - Y0 - s.ay) / f + m;
    c.drawImage(s.canvas, px, py, s.w / f, s.h / f);
  }
  if (full && ch.fc) { const t = ovTmp(o.width, o.height), tc = t.getContext("2d"); tc.clearRect(0, 0, t.width, t.height); tc.imageSmoothingEnabled = true; tc.drawImage(ch.fc, 0, m, CW / f, (CH + ch.hm) / f); tc.globalCompositeOperation = "source-atop"; tc.fillStyle = "rgb(31,39,42)"; tc.fillRect(0, 0, t.width, t.height); tc.globalCompositeOperation = "source-over"; c.drawImage(t, 0, 0); }
  ch[key + "G"] = ch.ovG || 0; ch[key + "At"] = performance.now();
}
// ---------- sprites for things ----------
function treeSprite(t) { if (t.t === "fspruce") { const WS = buildSprites("winter"); return WS.spruce[Math.floor(t.v * 3) * 3 + (t.s < .95 ? 0 : t.s < 1.2 ? 1 : 2)]; } if (t.t === "willow") return SP.willow[Math.floor(t.v * 3) * 3 + (t.s < .95 ? 0 : t.s < 1.15 ? 1 : 2)]; if (t.t === "maple") return SP.maple[Math.floor(t.v * 3) * 3 + (t.s < .95 ? 0 : t.s < 1.2 ? 1 : 2)]; if (t.t === "larch") return SP.larch[Math.floor(t.v * 3) * 3 + (t.s < .95 ? 0 : t.s < 1.2 ? 1 : 2)]; if (t.t === "dwarf") return SP.dwarf[Math.floor(t.v * 3) * 3 + (t.s < .95 ? 0 : t.s < 1.15 ? 1 : 2)]; const g = Math.floor(t.v * 3) * 3 + (t.s < .95 ? 0 : t.s < 1.2 ? 1 : 2); if (t.t === "oak") return SP.oak[g]; if (t.t === "birch") return SP.birch[g & 1]; return SP.spruce[t.t === "spruceS" ? Math.floor(t.v * 3) * 3 : g]; }
const bH = b => hR(b.x + b.a / 2, b.y + b.b / 2);
function bSprite(b) { const B = SP.bld; if (b.type === "apiary") return B.skeps; if (b.type === "fold") return B.shed; if (B[b.type]) return B[b.type]; if (b.type === "camp" || b.type === "outpost") return B.tent; if (b.type === "well") return B.well; if (b.type === "bench") return B.bench; if (b.type === "torch") return B.torch; return null; }
// ---------- frame ----------
export const view = { cam: { x: 0, y: 0 }, zoom: 3, hover: null, ghost: null, sel: 0, hourOverride: null, seasonOverride: null, weatherOverride: null };
let cv, ctx, Vw = 300, Vh = 200, k = 1, R = 3, vx0 = 0, vy0 = 0, T = 0, hits = [], vig = null, parts = [], floats = [], says = new Map();
export function init(canvas) { cv = canvas; ctx = cv.getContext("2d"); }
export function resize() {
  const r = cv.getBoundingClientRect(); const Z = view.zoom, u = (view.ui || 1) / (r.width / (cv.clientWidth || r.width) || 1); R = (Z >= 1 ? Z : 1) / u; k = Z >= 1 ? 1 : Z; // u: interface scale (CSS px are u screen px)
  Vw = Math.max(60, Math.floor(r.width / R)); Vh = Math.max(60, Math.floor(r.height / R)); cv.width = Vw; cv.height = Vh;
  const g = ctx.createRadialGradient(Vw / 2, Vh / 2, Math.min(Vw, Vh) * .3, Vw / 2, Vh / 2, Math.hypot(Vw, Vh) * .58); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.45)");
  vig = document.createElement("canvas"); vig.width = Vw; vig.height = Vh; const x = vig.getContext("2d"); x.fillStyle = g; x.fillRect(0, 0, Vw, Vh);
}
const STOPS = [[0, [56, 70, 128]], [5.2, [70, 84, 140]], [6.4, [255, 176, 140]], [8, [255, 238, 220]], [10, [255, 255, 255]], [15, [255, 252, 240]], [17.2, [255, 222, 170]], [18.4, [255, 160, 120]], [19.6, [100, 96, 150]], [21, [58, 72, 128]], [24, [56, 70, 128]]];
function tint(h) { for (let i = 0; i < STOPS.length - 1; i++) { const a = STOPS[i], b = STOPS[i + 1]; if (h >= a[0] && h <= b[0]) { const t = (h - a[0]) / (b[0] - a[0]); return [0, 1, 2].map(q => a[1][q] + (b[1][q] - a[1][q]) * t); } } return [255, 255, 255]; }
export function nightOf(h) { const t = tint(h); return M.clamp((1 - (t[0] + t[1] + t[2]) / 765) / .45, 0, 1); }
const rain = Array.from({ length: 160 }, () => ({ x: Math.random(), y: Math.random(), s: .7 + Math.random() * .6 }));
function px(c, x, y, w, h, col, a) { c.fillStyle = col; if (a !== undefined) c.globalAlpha = a; c.fillRect(x, y, w, h); if (a !== undefined) c.globalAlpha = 1; }
export function screenOf(x, y) { const q = k * cv.clientWidth / Vw; return [(sx(x, y) - vx0) * q, (gyH(x, y) - vy0) * q]; }
export function frame(now, rdt) {
  T = now / 1000; if (!W) return;
  const S = W.S, clk = M.clockOf(S), hour = view.hourOverride ?? clk.hour, sea = view.seasonOverride || M.seasonOf(clk.month);
  if (sea !== season || !SP) setSeason(sea);
  consume(); W.events.length = 0;
  const Z = view.zoom, over = Z < 1, OF = Z < .5 ? 4 : 2;
  vx0 = Math.round(view.cam.x - Vw / k / 2); vy0 = Math.round(view.cam.y - Vh / k / 2);
  const VWa = Vw / k, VHa = Vh / k;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
  const pat = fogPattern(ctx); pat.setTransform(new DOMMatrix([k, 0, 0, k, -vx0 * k % (FP * k), -vy0 * k % (FP * k)]));
  ctx.fillStyle = over ? "rgb(31,39,42)" : pat; ctx.fillRect(0, 0, Vw, Vh);
  ctx.setTransform(k, 0, 0, k, 0, 0); ctx.imageSmoothingEnabled = k < 1; ctx.imageSmoothingQuality = over ? "low" : "high";
  // visible tile range
  const inv = (gx, gy) => { const a = gx / 8, b = gy / 4; return [(a + b) / 2, (b - a) / 2]; };
  const cs = [inv(vx0, vy0), inv(vx0 + VWa, vy0), inv(vx0, vy0 + VHa), inv(vx0 + VWa, vy0 + VHa + 60)];
  const tx0 = Math.min(...cs.map(c => c[0])) - 2, tx1 = Math.max(...cs.map(c => c[0])) + 2, ty0 = Math.min(...cs.map(c => c[1])) - 2, ty1 = Math.max(...cs.map(c => c[1])) + 2;
  const vis = [];
  for (let cy = Math.floor(ty0 / C); cy <= Math.floor(ty1 / C); cy++) for (let cx = Math.floor(tx0 / C); cx <= Math.floor(tx1 / C); cx++) {
    const ch = W.chunks.get(M.ckey(cx, cy)); if (!ch) continue; const [X0, Y0] = chunkOrigin(ch);
    chunkMargin(ch); if (X0 - vx0 > VWa || Y0 - vy0 > VHa + 40 || X0 + CW - vx0 < 0 || Y0 + CH + ch.hm - vy0 < -OVM * 4) continue; vis.push(ch);
  }
  // bake on a time budget so zooming out never freezes the frame
  const tb = performance.now(), budget = (view.warm && tb < view.warm) ? 40 : over ? 8 : 10;
  vis.sort((a, b) => Math.hypot(chunkOrigin(a)[0] + CW / 2 - view.cam.x, chunkOrigin(a)[1] + CH / 2 - view.cam.y) - Math.hypot(chunkOrigin(b)[0] + CW / 2 - view.cam.x, chunkOrigin(b)[1] + CH / 2 - view.cam.y));
  for (const ch of vis) { ch.allFog = ch.fog.every(v => v); }
  for (const ch of vis) { if (performance.now() - tb > budget) break; if (ch.bakedSeason !== season && ch.lqSeason !== season && !ch.allFog) quickSome(ch, tb + budget); }
  if (Z >= .5) for (const ch of vis) { if (performance.now() - tb > budget) break; if (ch.bakedSeason !== season && !ch.allFog) bakeSome(ch, tb + budget); }
  hits = [];
  if (over) {
    const key = "ov" + OF;
    for (const ch of vis) { if (performance.now() - tb > budget + 4) break; if (!(ch.gc && ch.bakedSeason === season) && !(ch.lq && ch.lqSeason === season)) continue; const o = ch[key]; if (!o || (ch[key + "G"] !== (ch.ovG || 0) && performance.now() - (ch[key + "At"] || 0) > 1500)) buildOverview(ch, OF); }
    vis.sort((a, b) => (a.cx + a.cy) - (b.cx + b.cy));
    const m = OVM * 4;
    for (const ch of vis) {
      if (ch.allFog) continue; const [X0, Y0] = chunkOrigin(ch), o = ch[key] || ch["ov" + (OF === 4 ? 2 : 4)];
      if (o) { const f = o === ch.ov2 ? 2 : 4; ctx.drawImage(o, X0 - vx0, Y0 - vy0 - m, CW, o.height * f); }
      else if (ch.lq) { ctx.drawImage(ch.lq, X0 - vx0, Y0 - vy0, CW, ch.lq.height * 4); }
    }
    const ps = Z < .5 ? [4, 6] : [3, 5];
    for (const p of S.people) if (!p.asleep && !p.inside) { const x = Math.round(sx(p.x, p.y) - vx0 - ps[0] / 2), y = Math.round(gyH(p.x, p.y) - vy0 - ps[1]); ctx.fillStyle = "#3a2a1c"; ctx.fillRect(x - 1, y - 1, ps[0] + 2, ps[1] + 2); ctx.fillStyle = p.pioneer || p.state === "pioneer" ? "#ffd27a" : "#f4e6c0"; ctx.fillRect(x, y, ps[0], ps[1]); }
  } else {
    for (const ch of vis) { if (ch.allFog) continue; const [X0, Y0] = chunkOrigin(ch); if (ch.gc && (ch.bakedSeason === season || !ch.lq)) ctx.drawImage(ch.gc, X0 - vx0, Y0 - vy0); else if (ch.lq) { const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false; ctx.drawImage(ch.lq, X0 - vx0, Y0 - vy0, CW, ch.lq.height * 4); ctx.imageSmoothingEnabled = sm; } }
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
  const n = nightOf(hour); if (n > .2 && Z >= .5) drawGlow(n, hour);
  if (wk === "fog") { ctx.fillStyle = "rgba(200,206,210,.18)"; ctx.fillRect(0, 0, Vw, Vh); }
  drawWeather(wk, rdt); ctx.drawImage(vig, 0, 0);
  if (Z >= 2 && !over) drawTexts(rdt);
}
function spr(list, s, wx, wy, depth, info, VWa, VHa, zz) {
  if (!s) return; const x = sx(wx, wy) - s.ax - vx0, y = sy(wx, wy) - (zz ?? hR(wx, wy)) - s.ay - vy0;
  if (x > VWa || y > VHa || x + s.w < 0 || y + s.h < 0) return;
  list.push({ depth, draw: () => ctx.drawImage(s.canvas, x, y), box: info ? [x, y, x + s.w, y + s.h, info] : null });
}
function drawEntities(vis, hour, VWa, VHa) {
  const S = W.S, ents = [], P = PAL[season], hv = view.hover;
  for (const ch of vis) {
    for (const t of ch.trees) {
      const x0 = sx(t.x, t.y) - vx0, y0 = gyH(t.x, t.y) - vy0; if (x0 < -24 || x0 > VWa + 24 || y0 < -8 || y0 > VHa + 50) continue; if (M.hidden(W, t.x, t.y)) continue;
      if (t.gone) continue;
      if (t.felled) {
        if (t.sapling) { const g = M.clamp(1 - (t.regrow || 0) / 1200, 0, .999), s2 = SP.bld.sapling[(t.t === "oak" || t.t === "birch" ? 2 : 0) + (g > .5 ? 1 : 0)]; spr(ents, s2, t.x, t.y, t.x + t.y, { t: "Young tree", d: "Planted by the forester. Growing." }, VWa, VHa); continue; }
        if (!t.cleared || !M.occAt(W, t.x, t.y)) spr(ents, SP.stump, t.x, t.y, t.x + t.y, t.cleared ? null : { t: "Stump", d: t.cleared ? "Cleared." : "Rots away in time. Only a forester plants new trees." }, VWa, VHa); continue; }
      const a = treeSprite(t), x = x0 - a.ax, y = y0 - a.ay, near = hv && Math.abs(hv.vx - x0) < 12 && hv.vy > y && hv.vy < y0 + 2;
      ents.push({ depth: t.x + t.y, draw: () => ctx.drawImage(a.canvas, x, y), box: near ? [x0 - 6, y, x0 + 6, y0 + 2, { t: { oak: "Oak", birch: "Birch", dwarf: "Dwarf pine", willow: "Bog willow", maple: "Maple", larch: "Golden larch", fspruce: "Frost spruce" }[t.t] || "Spruce", d: t.t === "dwarf" ? "Kosodrevina. Low, tough, smells of resin." : t.logs + " loads of wood left." }] : null });
    }
    for (const b of ch.bushes) { if (b.gone || M.hidden(W, b.x, b.y)) continue; if (b.mush) { const has = b.berries > 0 && !P.snow; spr(ents, (has ? SP.mush : SP.mushBare)[Math.floor(b.v * 3) % 3], b.x, b.y, b.x + b.y, { t: "Mushrooms", d: has ? "Boletes and chanterelles. Mind the red one." : "Picked clean. More will grow." }, VWa, VHa); continue; } if (b.bog) { const has = b.berries > 0 && !P.snow; spr(ents, (has ? SP.reed : SP.reedBare)[Math.floor(b.v * 3) % 3], b.x, b.y, b.x + b.y, { t: "Bog reeds", d: has ? "Cranberries hide among the reeds." : "No berries right now." }, VWa, VHa); continue; } const has = b.berries > 0 && P.berry; spr(ents, (has ? SP.bush : SP.bushBare)[Math.floor(b.v * 3) % 3], b.x, b.y, b.x + b.y, { t: "Berry bush", d: has ? "Ripe berries to pick." : "No berries right now." }, VWa, VHa); }
    for (const r of ch.rocks) { if (r.stone <= 0 || M.hidden(W, r.x, r.y)) continue; spr(ents, (r.big ? SP.bigRock : SP.rock)[Math.floor(r.v * 3) % 3], r.x, r.y, r.x + r.y, { t: r.big ? "Stone outcrop" : "Rock", d: r.stone + " loads of stone left." }, VWa, VHa); }
  }
  const R0 = S.res, tier = v => v >= 300 ? 2 : v >= 60 ? 1 : 0;
  for (const b of S.b) {
    const T = M.TYPES[b.type], info = { t: T.name + (b.done ? "" : " (being built)"), d: b.done ? T.d : "Building site: " + Math.round(b.prog * 100) + "% done." + (b.by === "mayor" ? " Ordered by the Mayor." : " The villagers' own idea."), b: b.id };
    if (b.type === "field") {
      if (b.done) { info.d = ["Plowed, waiting to be sown.", "Sown. Small sprouts.", "Growing.", "Ripe! Ready to harvest."][b.stage] + " Crop: " + M.CROPS[b.crop].name + (b.auto ? " (villagers' choice)." : " (Mayor's choice)."); if (b.stage >= 1) spr(ents, SP.bld.scarecrow, b.x + .7, b.y + .7, b.x + b.y + 1.4, null, VWa, VHa); }
      const [x0, y0] = [sx(b.x + b.a / 2, b.y + b.b / 2) - vx0, gyH(b.x + b.a / 2, b.y + b.b / 2) - vy0]; hitsPush([x0 - 24, y0 - 10, x0 + 24, y0 + 10, info]); continue;
    }
    if (b.type === "camp" || b.type === "outpost") {
      spr(ents, SP.bld.tent, b.x + .2, b.y - .3, b.x + b.y + 2.6, info, VWa, VHa);
      const f = { x: b.x + 1.6, y: b.y + 2.3 }, fx = Math.round(sx(f.x, f.y) - vx0), fy = Math.round(gyH(f.x, f.y) - vy0);
      ents.push({ depth: f.x + f.y, draw: () => drawFire(fx, fy, hour), box: [fx - 7, fy - 10, fx + 7, fy + 4, { t: "Firepit", d: "The heart of the village. People gather here at night." }] });
      if (Math.random() < .08) parts.push({ x: sx(f.x, f.y), y: gyH(f.x, f.y) - 6, a: 0, l: 3 + Math.random() * 2, vx: (Math.random() - .3) * 3 });
      if (b.type === "outpost") continue;
      const st = { x: b.x - .7, y: b.y + 2.4 }, inf = { t: "Stockpile", d: "Wood " + R0.wood + " · Stone " + R0.stone + " · Food " + R0.food };
      if (R0.wood > 0) spr(ents, SP.wood[tier(R0.wood)], st.x, st.y, st.x + st.y, inf, VWa, VHa);
      if (R0.stone > 0) spr(ents, SP.stone[tier(R0.stone)], st.x + 1.2, st.y + .9, st.x + st.y + 2.1, inf, VWa, VHa);
      if (R0.food > 0) spr(ents, SP.food[tier(R0.food)], st.x - .5, st.y - 1.1, st.x + st.y - 1.6, inf, VWa, VHa);
      continue;
    }
    if (b.type === "bridge" || b.type === "fill") { if (!b.done) { const ws = { x: b.x + b.a / 2, y: b.y + b.b / 2 }, X = Math.round(sx(ws.x, ws.y) - vx0), Y = Math.round(gyH(ws.x, ws.y) - vy0); ents.push({ depth: ws.x + ws.y, draw: () => siteMarks(b), box: [X - 16, Y - 10, X + 16, Y + 6, info] }); } else { const X = Math.round(sx(b.x + b.a / 2, b.y + b.b / 2) - vx0), Y = Math.round(gyH(b.x + b.a / 2, b.y + b.b / 2) - vy0); hitsPush([X - 10, Y - 6, X + 10, Y + 4, info]); } continue; }
    if (b.type === "fold") drawFold(ents, b, info);
    const s = bSprite(b); if (!s) continue;
    const ox = b.type === "well" ? -.2 : 0, fo = b.type === "fold" ? .15 : 0, X = sx(b.x + ox + fo, b.y + ox + fo) - s.ax - vx0, Y = sy(b.x + ox + fo, b.y + ox + fo) - bH(b) - s.ay - vy0;
    if (X > VWa || Y > VHa || X + s.w < 0 || Y + s.h < 0) continue;
    const depth = b.type === "fold" ? b.x + b.y + 3.2 : b.x + b.a + b.y + b.b - .5;
    if (b.upTo) { info.t = M.TYPES[b.upTo].name + " (rebuilding)"; info.d = "The villagers are turning this " + M.TYPES[b.type].name + " into a " + M.TYPES[b.upTo].name + ": " + Math.round(b.prog * 100) + "%."; ents.push({ depth: depth + 1, draw: () => { ctx.drawImage(s.canvas, X, Y); scaffold(b); }, box: [X, Y, X + s.w, Y + s.h, info] }); continue; }
    if (b.done) {
      if (b.type === "chapel") { const t = SP.bld.belltower, tx = b.x + b.a - 1.4, ty = b.y + 1, z = bH(b); spr(ents, t, tx, ty, b.x + b.a + b.y + b.b - .4, info, VWa, VHa, z); }
      if (b.type === "tavern") spr(ents, SP.bld.sign, b.x + b.a + .2, b.y + b.b - .2, b.x + b.a + b.y + b.b + .1, info, VWa, VHa, bH(b));
      if (b.type === "mill") { const z = bH(b), hx = sx(b.x, b.y) - s.ax + s.hub[0] - vx0, hy = sy(b.x, b.y) - z - s.ay + s.hub[1] - vy0, fast = (b.grind || 0) > W.S.tick; ents.push({ depth: depth + .05, draw: () => drawSails(hx, hy, fast) }); }
      if (b.type === "apiary" && season !== "winter") { const cx = sx(b.x + 1, b.y + .5) - vx0, cy = gyH(b.x + 1, b.y + .5) - vy0 - 8; ents.push({ depth: depth + .1, draw: () => bees(cx, cy) }); }
      ents.push({ depth, draw: () => ctx.drawImage(s.canvas, X, Y), box: [X, Y, X + s.w, Y + s.h, info] });
      if (b.type === "torch") ents.push({ depth: depth + .01, draw: () => flame(X + s.flame[0], Y + s.flame[1], hour) });
    } else {
      const p = Math.max(.12, b.prog), cut = Math.floor(s.h * (1 - p));
      ents.push({ depth, draw: () => { ctx.drawImage(s.canvas, 0, cut, s.w, s.h - cut, X, Y + cut, s.w, s.h - cut); scaffold(b); }, box: [X, Y, X + s.w, Y + s.h, info] });
    }
    const prop = { wcut: [SP.wood[1], 2.5, .7], forage: [SP.food[1], 2.4, 1.2], fisher: [SP.bld.rack, 2.6, .9], quarry: [SP.stone[2], 2.5, .9], store: [SP.wood[tier(R0.wood)], 3.4, 1.4] }[b.type];
    if (prop && b.done) spr(ents, prop[0], b.x + prop[1], b.y + prop[2], b.x + prop[1] + b.y + prop[2], info, VWa, VHa, bH(b));
  }
  { const WS = wonderSprites(season);
    for (const w of S.wonders) { const s = WS[w.k], d = M.WONDERS[w.k]; if (!s) continue; spr(ents, s, w.x, w.y, w.x + w.y, { t: d.name, d: d.d + " Found by " + w.by + "." }, VWa, VHa); }
    const T = S.trek; if (T) { const lead = S.people.find(q => q.id === T.members[0]);
      if (lead && !M.hidden(W, lead.x, lead.y) && (T.rest > 0 || hour >= 21.5 || hour < 5.3)) { const f = { x: lead.x + 1.2, y: lead.y + .9 }, fx = Math.round(sx(f.x, f.y) - vx0), fy = Math.round(gyH(f.x, f.y) - vy0);
        ents.push({ depth: f.x + f.y, draw: () => drawFire(fx, fy, hour), box: [fx - 7, fy - 10, fx + 7, fy + 4, { t: "Campfire", d: "The " + T.name + " is resting here." }] }); if (Math.random() < .08) parts.push({ x: sx(f.x, f.y), y: gyH(f.x, f.y) - 6, a: 0, l: 3 + Math.random() * 2, vx: (Math.random() - .3) * 3 }); } } }
  for (const b of S.b) if (b.type === "harbor" && b.pdx !== undefined) { const cx = b.x + b.a / 2, cy = b.y + b.b / 2; if (Math.abs(sx(cx, cy) - vx0 - VWa / 2) < VWa / 2 + 90 && Math.abs(gyH(cx, cy) - vy0 - VHa / 2) < VHa / 2 + 90) ents.push({ depth: -1e5, draw: () => drawPier(b) }); }
  { const BS = boatSprites();
    for (const bt of S.boats) { const hb = S.b.find(q => q.id === bt.hb); if (!hb || M.hidden(W, bt.x, bt.y)) continue; const s = Math.cos(bt.hd) < 0 ? BS.l : BS.r, wx = bt.x + Math.sin(T * 1.3 + bt.id) * .0, bob = Math.round(Math.sin(T * 1.7 + bt.id) * .6);
      const crew = S.people.filter(q => bt.crew.includes(q.id)).map(q => q.name).join(", ");
      const x = Math.round(sx(bt.x, bt.y) - vx0 - s.ax), y = Math.round(gyH(bt.x, bt.y) - vy0 - s.ay) + bob; if (x > VWa || y > VHa || x + s.w < 0 || y + s.h < 0) continue;
      const moving = bt.st !== "dock" && bt.rest <= 0, cxs = Math.round(sx(bt.x, bt.y) - vx0), cys = Math.round(gyH(bt.x, bt.y) - vy0);
      ents.push({ depth: bt.x + bt.y + .3, draw: () => { ctx.globalAlpha = .22; ctx.fillStyle = "#e8f4f8"; ctx.fillRect(cxs - 11, cys + 1, 22, 1); if (moving) { ctx.fillRect(cxs - (Math.cos(bt.hd) < 0 ? -8 : 14), cys + 2, 6, 1); } ctx.globalAlpha = 1; ctx.drawImage(s.canvas, x, y); },
        box: [x, y, x + s.w, y + s.h, { t: "Boat", d: bt.st === "dock" ? "Moored at the pier, waiting for the next trip." : (crew ? crew + " are " : "") + (bt.rest > 0 ? "fishing and looking around." : bt.st === "back" ? "sailing home." : "sailing to unexplored waters.") }] }); } }
  // wagon + ox
  const wg = S.wagon, ws = wg.alongY ? SP.wagonM : SP.wagon;
  spr(ents, ws, wg.alongY ? wg.x - .65 : wg.x - 1.2, wg.alongY ? wg.y - 1.2 : wg.y - .65, wg.x + wg.y + .8, { t: "Wagon", d: S.phase === "choose" ? "Everything the settlers own. Waiting for the Mayor's decision." : "It carried the first settlers and all their tools." }, VWa, VHa);
  { const o = S.ox, x = Math.round(sx(o.x, o.y) - vx0), y = Math.round(gyH(o.x, o.y) - vy0), fl = S.phase === "travel" ? (wg.hx - wg.hy >= 0 ? 1 : -1) : 1, fr = S.phase === "travel" ? Math.floor(T * 5) % 2 : 0; ents.push({ depth: o.x + o.y, draw: () => drawOx(x, y, fl, fr), box: [x - 5, y - 7, x + 6, y + 1, { t: "Ox", d: "Pulled the wagon all the way here. Now it grazes." }] }); }
  for (const p of S.people) {
    if (p.asleep || p.inside) continue; const x = Math.round(sx(p.x, p.y) - vx0), y = Math.round(gyH(p.x, p.y) - vy0); if (x < -6 || x > VWa + 6 || y < -4 || y > VHa + 10) continue;
    if (M.hidden(W, p.x, p.y)) continue;
    const fr = p.moving ? Math.floor(T * 6 + p.id) % 2 : 0;
    ents.push({ depth: p.x + p.y + .2, draw: () => drawPerson(x, y, p, fr), box: [x - 3, y - 9, x + 4, y + 1, { t: p.name, d: (p.act || "") + ". " + p.trait[0].toUpperCase() + p.trait.slice(1) + "." }], p });
  }
  const dg = S.dog; if (dg && !M.hidden(W, dg.x, dg.y)) { const x = Math.round(sx(dg.x, dg.y) - vx0), y = Math.round(gyH(dg.x, dg.y) - vy0); ents.push({ depth: dg.x + dg.y + .15, draw: () => drawDog(x, y, dg), box: [x - 4, y - 5, x + 4, y + 1, { t: dg.name, d: dg.sleep ? "Sleeping by the camp. Twitching paws, chasing dream rabbits." : "The village dog. Follows " + ((S.people.find(p => p.id === dg.owner) || {}).name || "everyone") + " everywhere." }] }); }
  ents.sort((a, b) => a.depth - b.depth);
  for (const e of ents) { e.draw(); if (e.box) hitsPush(e.box); }
  textAnchors = ents.filter(e => e.p).map(e => [e.p, e.box]);
}
let textAnchors = [];
function hitsPush(b) { hits.push(b); }
function siteMarks(b) {
  ctx.fillStyle = "#8a6038";
  for (let j = 0; j < b.b; j++) for (let i = 0; i < b.a; i++) { const x = b.x + i + .5, y = b.y + j + .5, X = Math.round(sx(x, y) - vx0), Y = Math.round(gyH(x, y) - vy0); if ((i + j) % 2 === 0 || b.prog * b.a * b.b > i + j * b.a) { ctx.fillRect(X - 5, Y - 1, 10, 2); ctx.fillStyle = "#5a3c24"; ctx.fillRect(X - 1, Y - 6, 1, 6); ctx.fillStyle = "#8a6038"; } }
}
function drawFold(ents, b, info) {
  const z = bH(b), P = [[b.x, b.y], [b.x + b.a, b.y], [b.x + b.a, b.y + b.b], [b.x, b.y + b.b]];
  const side = (p, q, depth, gate) => ents.push({ depth, draw: () => {
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.round(L / .9);
    let prev = null; for (let i = 0; i <= n; i++) { const t = i / n, x = p[0] + (q[0] - p[0]) * t, y = p[1] + (q[1] - p[1]) * t, X = Math.round(sx(x, y) - vx0), Y = Math.round(sy(x, y) - z - vy0);
      if (gate && t > .4 && t < .62) { prev = null; continue; }
      ctx.fillStyle = "#5a3c24"; ctx.fillRect(X, Y - 5, 1, 5);
      if (prev) { ctx.fillStyle = "#8a6038"; for (const hh of [4, 2]) { const L2 = Math.max(Math.abs(X - prev[0]), Math.abs(Y - prev[1])); for (let s = 0; s <= L2; s++) ctx.fillRect(Math.round(prev[0] + (X - prev[0]) * s / L2), Math.round(prev[1] + (Y - prev[1]) * s / L2) - hh, 1, 1); } }
      prev = [X, Y]; } } });
  side(P[0], P[1], b.x + b.y, false); side(P[3], P[0], b.x + b.y, false);
  side(P[1], P[2], b.x + b.a + b.y + b.b, false); side(P[2], P[3], b.x + b.a + b.y + b.b, true);
  for (const sh of W.S.sheep) { if (sh.f !== b.id) continue; const x = Math.round(sx(sh.x, sh.y) - vx0), y = Math.round(gyH(sh.x, sh.y) - vy0); ents.push({ depth: sh.x + sh.y + .1, draw: () => drawSheep(x, y, sh), box: [x - 4, y - 5, x + 5, y + 1, { t: "Sheep", d: "Wool, milk and very strong opinions about grass." }] }); }
}
function drawSheep(x, y, s) {
  px(ctx, x - 3, y, 7, 1, "#000", .2); const d = s.fx || 1, graze = !s.moving && Math.floor(T + s.x) % 3 === 0, hx = d > 0 ? x + 2 : x - 3, hy = graze ? y - 1 : y - 3;
  px(ctx, x - 3, y - 4, 6, 3, "#ecebe2"); px(ctx, x - 3, y - 4, 6, 1, "#fbfaf4"); px(ctx, x - 3, y - 2, 6, 1, "#c8c6bb");
  px(ctx, hx, hy, 2, 2, "#40372f"); px(ctx, x - 2, y - 1, 1, 1, "#3a322c"); px(ctx, x + 1, y - 1, 1, 1, "#3a322c");
}
function bees(cx, cy) { ctx.fillStyle = "#f0d040"; for (let i = 0; i < 6; i++) { const a = T * (1.3 + i * .21) + i * 2.1, r = 5 + (i % 3) * 3; ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a * 1.3) * r * .5), 1, 1); } }
function drawSails(hx, hy, fast) {
  const R = 20, ang = T * (fast ? 1.6 : .5);
  for (let q = 0; q < 4; q++) { const th = ang + q * Math.PI / 2, dy = R * Math.cos(th) / 8.94, dz = R * Math.sin(th), ex = -8 * dy, ey = 4 * dy - dz, L = Math.hypot(ex, ey) || 1, ux = ex / L, uy = ey / L, nx = -uy, ny = ux;
    for (let i = 3; i < L; i++) { const x = hx + ux * i, y = hy + uy * i; ctx.fillStyle = "#6e4c30"; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); if (i > 5 && i % 3 !== 0) { ctx.fillStyle = "#e6dcc2"; ctx.fillRect(Math.round(x + nx * 2), Math.round(y + ny * 2), 1, 1); ctx.fillRect(Math.round(x + nx * 3), Math.round(y + ny * 3), 1, 1); ctx.fillStyle = "#b8ac8e"; ctx.fillRect(Math.round(x + nx), Math.round(y + ny), 1, 1); } } }
  ctx.fillStyle = "#3a2a1c"; ctx.fillRect(Math.round(hx) - 1, Math.round(hy) - 1, 3, 3);
}
function scaffold(b) {
  ctx.fillStyle = "#8a6038";
  const pts = [[b.x, b.y + b.b], [b.x + b.a, b.y + b.b], [b.x + b.a, b.y], [b.x, b.y]];
  const z = bH(b);
  for (const [x, y] of pts) { const X = Math.round(sx(x, y) - vx0), Y = Math.round(sy(x, y) - z - vy0); ctx.fillRect(X, Y - 16, 1, 16); }
  for (const h of [6, 12]) for (let i = 0; i < 3; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; const A = [sx(x0, y0) - vx0, sy(x0, y0) - z - vy0 - h], B = [sx(x1, y1) - vx0, sy(x1, y1) - z - vy0 - h], L = Math.max(Math.abs(B[0] - A[0]), Math.abs(B[1] - A[1])); for (let s = 0; s <= L; s++) ctx.fillRect(Math.round(A[0] + (B[0] - A[0]) * s / L), Math.round(A[1] + (B[1] - A[1]) * s / L), 1, 1); }
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
  if (p.state === "patrol") { px(ctx, x + 2, y - 5 + bob, 1, 2, "#3a2c22"); px(ctx, x + 2, y - 3 + bob, 2, 2, "#ffd27a"); px(ctx, x + 2, y - 3 + bob, 1, 1, "#fff4c0"); }
  if (p.pack && !p.carry) { px(ctx, x - 3, y - 7 + bob, 3, 3, "#7a5634"); px(ctx, x - 3, y - 7 + bob, 3, 1, "#a07848"); }
  if (p.carry) { const t = p.carry.type; px(ctx, x - 2, y - 8 + bob, 4, 2, t === "wood" ? "#9a6a3a" : t === "stone" ? "#9a9890" : "#b03a30"); px(ctx, x - 2, y - 8 + bob, 4, 1, t === "wood" ? "#c89a60" : t === "stone" ? "#c8c6c0" : "#7050a0"); }
}
function drawDog(x, y, d) {
  px(ctx, x - 3, y, 7, 1, "#000", .2);
  const f = d.fx || 1, body = "#a0683a", dark = "#6e4426", fr = d.moving ? Math.floor(T * 10) % 2 : 0;
  if (d.sleep) { px(ctx, x - 3, y - 2, 6, 2, body); px(ctx, f > 0 ? x + 2 : x - 4, y - 3, 2, 2, body); px(ctx, f > 0 ? x + 3 : x - 4, y - 3, 1, 1, dark); return; }
  px(ctx, x - 3, y - 4, 6, 2, body); px(ctx, x - 3, y - 4, 6, 1, "#b8804c");
  px(ctx, x - 3 + (fr ? 1 : 0), y - 2, 1, 2, dark); px(ctx, x + 1 + (fr ? 0 : 1), y - 2, 1, 2, dark);
  const hx = f > 0 ? x + 3 : x - 5; px(ctx, hx, y - 6, 2, 2, body); px(ctx, f > 0 ? hx + 1 : hx, y - 7, 1, 1, dark); px(ctx, f > 0 ? hx + 2 : hx - 1, y - 5, 1, 1, "#2a1a10");
  const wag = Math.floor(T * (d.moving ? 12 : 5)) % 2, tx = f > 0 ? x - 4 : x + 3; px(ctx, tx, y - 5 - wag, 1, 2, dark);
  if (d.mode === "sniff" && !d.moving) px(ctx, f > 0 ? hx + 2 : hx - 1, y - 4, 1, 1, "#2a1a10");
}
function drawOx(x, y, fl, fr) {
  px(ctx, x - 5, y, 11, 1, "#000", .22); const b = "#7a5034", d = "#5a3a24", h = fl > 0 ? x + 4 : x - 6;
  px(ctx, x - 4, y - 5, 8, 4, b); px(ctx, x - 4, y - 5, 8, 1, "#94643f"); px(ctx, x - 4, y - 2, 8, 1, d);
  px(ctx, x - 3, y - 1 + fr, 1, 1, d); px(ctx, x + 2, y - fr, 1, 1, d); px(ctx, x - 2, y - 1, 1, 1, d); px(ctx, x + 3, y - 1, 1, 1, d);
  px(ctx, h, y - 5, 3, 3, "#6a4430"); px(ctx, h, y - 6, 1, 1, "#e8dcc0"); px(ctx, h + 2, y - 6, 1, 1, "#e8dcc0"); px(ctx, fl > 0 ? h + 2 : h, y - 3, 1, 1, "#2a1a10");
}
function drawPier(b) {
  const dx = b.pdx, dy = b.pdy, pk = b.ppk || 0, cx = b.x + b.a / 2, cy = b.y + b.b / 2, ext = (dx ? b.a : b.b) / 2, e0 = ext - .1, d = M.dockOf(b), e1 = Math.hypot(d.x - cx, d.y - cy) + 1.2, px_ = -dy, py_ = dx;
  const P = (s, w) => { const wx = cx + dx * s + px_ * w, wy = cy + dy * s + py_ * w; return [sx(wx, wy) - vx0, gyH(wx, wy) - vy0 - (M.isWater(wx, wy) ? 1 : 0)]; };
  for (let s = e0; s < e1; s += .5) {
    const A = P(s, -.6), B = P(s + .5, -.6), C2 = P(s + .5, .6), D = P(s, .6), odd = Math.floor((s - e0) / .5) % 2;
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.moveTo(A[0], A[1] + 3); ctx.lineTo(B[0], B[1] + 3); ctx.lineTo(C2[0], C2[1] + 3); ctx.lineTo(D[0], D[1] + 3); ctx.fill();
    ctx.fillStyle = odd ? "#9c7242" : "#b08450"; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(C2[0], C2[1]); ctx.lineTo(D[0], D[1]); ctx.closePath(); ctx.fill();
  }
  for (let s = e0 + .5; s < e1; s += 2) for (const w of [-.6, .6]) { const q = P(s, w); px(ctx, Math.round(q[0]) - 1, Math.round(q[1]) - 2, 2, 5, "#4a3320"); px(ctx, Math.round(q[0]) - 1, Math.round(q[1]) - 2, 2, 1, "#6e4e30"); }
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
  for (const p of S.people) if (p.state === "patrol" && !p.inside) glow(sx(p.x, p.y) + 3, gyH(p.x, p.y) - 4, 18, .5 * n);
  for (const b of S.b) {
    if (!b.done) continue;
    const z = bH(b);
    if (b.type === "camp" || b.type === "outpost") { const f = { x: b.x + 1.6, y: b.y + 2.3 }; glow(sx(f.x, f.y), gyH(f.x, f.y) - 3, 40 * (1 + Math.sin(T * 7) * .06), .55 * n); if (lit(b, hour)) glow(sx(b.x + 2.8, b.y + 1), sy(b.x + 2.8, b.y + 1) - z - 4, 12, .45 * n); }
    else if (b.type === "torch") glow(sx(b.x, b.y), sy(b.x, b.y) - z - 14, 22, .5 * n);
    else if (lit(b, hour)) { const s = bSprite(b); if (s && s.wins) for (const w of s.wins) glow(sx(b.x, b.y) - s.ax + w[0], sy(b.x, b.y) - z - s.ay + w[1], 9, .5 * n); }
  }
  ctx.globalCompositeOperation = "source-over";
  for (const b of S.b) { if (b.type === "camp" || b.type === "outpost" || !lit(b, hour)) continue; const s = bSprite(b); if (!s) continue; const z = bH(b); ctx.fillStyle = "rgba(255,214,120," + n + ")"; for (const w of s.wins) ctx.fillRect(Math.round((sx(b.x, b.y) - s.ax + w[0] - vx0) * k) - 1, Math.round((sy(b.x, b.y) - z - s.ay + w[1] - vy0) * k) - 1, 2, 2); }
}
// a home's windows glow when someone is up inside: in the morning one by one as people wake, in the evening until the last one goes to bed
function lit(b, hour) {
  if (!b.done) return false;
  if (b.type === "tavern" || b.type === "chapel") return W.S.people.some(p => p.inside && (p.state === "inn" || p.state === "church") && Math.hypot(p.x - b.x - b.a / 2, p.y - b.y - b.b) < 3);
  if (!M.TYPES[b.type].beds) return false;
  let any = false;
  for (const p of W.S.people) { if (p.home !== b.id) continue; if (p.state === "morning") return true; if (hour >= 17.5 && hour < M.sleepAt(p) && p.state !== "sleep") any = true; }
  return any;
}
function drawWeather(wk, dt) {
  if (wk !== "rain" && wk !== "snow") return;
  for (const d of rain) { if (wk === "rain") { d.y += dt * 1.5 * d.s; d.x -= dt * .12; } else { d.y += dt * .22 * d.s; d.x += Math.sin(T * 1.5 + d.s * 9) * dt * .04; } if (d.y > 1.05) { d.y = -.05; d.x = Math.random(); } if (d.x < -.05) d.x = 1.05;
    const x = Math.round(d.x * Vw), y = Math.round(d.y * Vh); if (wk === "rain") { ctx.fillStyle = "rgba(170,200,236,.7)"; ctx.fillRect(x, y, 1, 3); } else { ctx.fillStyle = "rgba(250,252,255,.95)"; ctx.fillRect(x, y, 1, 1); } }
}
const SAY = ["Smells like rain.", "Good soil here.", "Listen, an eagle.", "I miss bread.", "Nice view.", "My back hurts.", "Who took my axe?", "Lovely day.", "The Mayor is watching.", "Warm fire tonight?"];
function drawTexts(dt) {
  ctx.font = "7px ui-monospace,Menlo,Consolas,monospace"; ctx.textBaseline = "top";
  for (const b of W.S.b) if (b.type === "tavern" && lit(b, 22) && Math.random() < dt * .6) floats.push({ x: b.x + 1 + Math.random() * 2, y: b.y + .5, t: Math.random() < .5 ? "♪" : "♫", c: "#f0c860", a: 0 });
  for (const f of floats) { f.a += dt; ctx.globalAlpha = Math.max(0, 1 - f.a / 2.2); ctx.fillStyle = f.c; ctx.fillText(f.t, Math.round(sx(f.x, f.y) - vx0 - 8), Math.round(gyH(f.x, f.y) - vy0 - 14 - f.a * 6)); } ctx.globalAlpha = 1; floats = floats.filter(f => f.a < 2.2);
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
  if (g.kind === "trek") {
    const x = sx(g.x, g.y) - vx0, y = gyH(g.x, g.y) - vy0, r = 8;
    ctx.globalAlpha = .16; ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, r * 11.3, r * 5.66, 0, 0, 6.29); ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = col;
    for (let a = 0; a < 6.28; a += .04) { if (Math.floor(a * 8 + T * 2) % 2 === 0) continue; ctx.fillRect(Math.round(x + Math.cos(a) * r * 11.3) - 1, Math.round(y + Math.sin(a) * r * 5.66), 2, 1); }
    px(ctx, x, y - 16, 1, 16, "#5a3a24"); px(ctx, x + 1, y - 16, 6, 3, "#d8503c"); px(ctx, x + 1, y - 13, 4, 1, "#d8503c"); return;
  }
  if (g.kind === "settle") {
    const x = sx(g.x, g.y) - vx0, y = gyH(g.x, g.y) - vy0, r = 4.3;
    ctx.globalAlpha = .18; ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, r * 11.3, r * 5.66, 0, 0, 6.29); ctx.fill(); ctx.globalAlpha = 1;
    for (let a = 0; a < 6.28; a += .05) { if (Math.floor(a * 8 + T * 2) % 2 === 0) continue; ctx.fillRect(Math.round(x + Math.cos(a) * r * 11.3) - 1, Math.round(y + Math.sin(a) * r * 5.66), 2, 1); }
    px(ctx, x, y - 14, 1, 14, "#5a3a24"); px(ctx, x + 1, y - 14, 5, 3, col); return;
  }
  const T0 = M.TYPES[g.type], x0 = g.x, y0 = g.y, a = g.a || T0.a, b = g.b || T0.b;
  const P = [[x0, y0], [x0 + a, y0], [x0 + a, y0 + b], [x0, y0 + b]].map(([x, y]) => [sx(x, y) - vx0, gyH(x, y) - vy0]);
  ctx.globalAlpha = .28; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for (const q of P) ctx.lineTo(q[0], q[1]); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke();
  const s = bSprite({ type: g.type }); if (s) { ctx.globalAlpha = .55; ctx.drawImage(s.canvas, sx(x0, y0) - s.ax - vx0, sy(x0, y0) - hR(x0 + a / 2, y0 + b / 2) - s.ay - vy0); ctx.globalAlpha = 1; }
}
// ---------- coordinates ----------
export function toWorld(clientX, clientY) {
  const r = cv.getBoundingClientRect(), cxp = (clientX - r.left) / r.width * Vw, cyp = (clientY - r.top) / r.height * Vh;
  const ax = cxp / k + vx0, ay = cyp / k + vy0, r0 = rayHit(Math.floor(ax), Math.floor(ay), 7); return { x: r0.x, y: r0.y, vx: ax - vx0, vy: ay - vy0 };
}
export function hitAt(vx, vy) { for (let i = hits.length - 1; i >= 0; i--) { const b = hits[i]; if (vx >= b[0] && vx <= b[2] && vy >= b[1] && vy <= b[3]) return b[4]; } return null; }
export function artPerCss() { return Vw / k / cv.getBoundingClientRect().width; }
export function exploredBounds() {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const ch of W.chunks.values()) for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) { if (ch.fog[j * C + i]) continue; const x = ch.x0 + i, y = ch.y0 + j, X = sx(x, y), Y = sy(x, y); if (X - 8 < x0) x0 = X - 8; if (X + 8 > x1) x1 = X + 8; if (Y < y0) y0 = Y; if (Y + 8 > y1) y1 = Y + 8; }
  return { x0, y0, x1, y1 };
}
export function cssSize() { const r = cv.getBoundingClientRect(); return { w: r.width, h: r.height }; }
// ---------- UI helpers: building thumbnails and the minimap ----------
export function thumb(type, size = 44) {
  if (!SP) setSeason(season);
  const c = document.createElement("canvas"); c.width = size; c.height = size; const x = c.getContext("2d"); x.imageSmoothingEnabled = false;
  if (type === "field") { x.fillStyle = "#6a4a30"; x.beginPath(); x.moveTo(size / 2, size * .3); x.lineTo(size * .95, size * .55); x.lineTo(size / 2, size * .8); x.lineTo(size * .05, size * .55); x.closePath(); x.fill(); x.strokeStyle = "#d6aa40"; for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(size * (.2 + i * .1), size * (.6 - i * .05)); x.lineTo(size * (.4 + i * .1), size * (.7 - i * .05)); x.stroke(); } return c; }
  if (type === "bridge" || type === "fill") { const f = type === "fill"; x.fillStyle = f ? "#2e5a7a" : "#3a6a8a"; x.fillRect(0, size * .55, size, size * .3); x.fillStyle = f ? "#a89c84" : "#a8743e"; if (f) { x.beginPath(); x.moveTo(size * .1, size * .7); x.lineTo(size * .5, size * .45); x.lineTo(size * .9, size * .7); x.lineTo(size * .5, size * .85); x.fill(); } else { x.fillRect(size * .08, size * .5, size * .84, size * .12); x.fillStyle = "#5a3c24"; for (let i = 0; i < 5; i++) x.fillRect(size * (.1 + i * .2), size * .38, 2, size * .4); } return c; }
  const s = bSprite({ type }); if (!s) return c;
  const k = Math.max(1, Math.floor(Math.min(size / s.w, size / s.h) * 10) / 10), w = s.w * k, h = s.h * k;
  x.drawImage(s.canvas, (size - w) / 2, (size - h) / 2 + 2, w, h); return c;
}
let mmBase = null, mmSig = "", mmWin = null;
function mmColor(x, y) {
  const P = PAL[season], e = M.elev(x, y);
  if (e < M.SEA) return P.water[e < M.SEA - .03 ? 0 : 1];
  const h = M.heightAt(x, y), lk = M.lakeV(x, y);
  if (lk > .6 && h < 2.6) return P.snow ? P.g[2] : [214, 196, 146];
  if (M.desertV(x, y) > 0) return P.snow ? P.g[2] : [228, 196, 124];
  if (M.swampV(x, y) > 0) return P.snow ? P.g[2] : [74, 84, 50];
  if (M.tundraV(x, y) > 0) return [236, 242, 248];
  if (M.groveV(x, y) > 0 && !P.snow) return [204, 138, 46];
  if (h > 38) return [238, 243, 250];
  if (h > 30) return [140, 132, 118];
  return P.g[1 + ((M.fdV(x, y) < .55) ? 1 : 0)];
}
let mmAt = 0;
export function minimap(cv2, focusX, focusY) {
  if (!W) return; const S = W.S;
  // window: around everything explored, at least 64 tiles
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const ch of W.chunks.values()) for (let j = 0; j < C; j += 2) for (let i = 0; i < C; i += 2) if (!ch.fog[j * C + i]) { const x = ch.x0 + i, y = ch.y0 + j; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  if (x0 > x1) return;
  const L = Math.max(48, x1 - x0 + 6, y1 - y0 + 6), ox = Math.floor((x0 + x1) / 2 - L / 2), oy = Math.floor((y0 + y1) / 2 - L / 2);
  if (cv2.width !== L * 2 || cv2.height !== L) { cv2.width = L * 2; cv2.height = L; mmSig = ""; }
  const c = cv2.getContext("2d");
  let revealed = 0; for (const ch of W.chunks.values()) for (let i = 0; i < ch.fog.length; i += 7) if (!ch.fog[i]) revealed++;
  const sig = [L, ox, oy, revealed, season, S.b.length, S.b.filter(b => b.done).length].join();
  if (!mmBase || (sig !== mmSig && (performance.now() - mmAt > 6000 || mmBase.width !== L * 2))) {
    mmSig = sig; mmAt = performance.now(); mmBase = document.createElement("canvas"); mmBase.width = L * 2; mmBase.height = L; const b = mmBase.getContext("2d"), img = b.createImageData(L * 2, L), d = img.data;
    for (let ry = 0; ry < L; ry++) for (let rx = 0; rx < L; rx++) {
      const x = ox + rx, y = oy + ry; if (M.hidden(W, x + .5, y + .5)) continue;
      const col = mmColor(x + .5, y + .5), u = rx - ry + L - 1, v = (rx + ry) >> 1; if (v >= L) continue;
      for (const uu of [u, u + 1]) { const o = (v * L * 2 + uu) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255; }
    }
    b.putImageData(img, 0, 0);
    b.fillStyle = "#1c4a1c"; for (const ch of W.chunks.values()) for (const t of ch.trees) { if (t.felled || M.hidden(W, t.x, t.y)) continue; const rx = t.x - ox, ry = t.y - oy; if (rx < 0 || ry < 0 || rx >= L || ry >= L) continue; if ((t.i & 1) === 0) b.fillRect(Math.floor(rx - ry + L - 1), Math.floor((rx + ry) / 2), 1, 1); }
    for (const bb of S.b) { b.fillStyle = bb.type === "field" ? "#d8b040" : bb.done ? "#f0c860" : "#b08850"; const rx = bb.x - ox, ry = bb.y - oy; for (let j = 0; j < bb.b; j++) for (let i = 0; i < bb.a; i++) b.fillRect(Math.floor(rx + i - ry - j + L - 1), Math.floor((rx + i + ry + j) / 2), 2, 1); }
  }
  c.clearRect(0, 0, cv2.width, cv2.height); c.drawImage(mmBase, 0, 0);
  c.fillStyle = "#ffffff"; for (const p of S.people) { if (p.asleep) continue; const rx = p.x - ox, ry = p.y - oy; c.fillRect(Math.floor(rx - ry + L - 1), Math.floor((rx + ry) / 2), 1, 1); }
  // camera view
  const inv = (gx, gy) => { const a = gx / 8, b = gy / 4; return [(a + b) / 2 - ox, (b - a) / 2 - oy]; }, vwA = Vw / k, vhA = Vh / k;
  const cs = [inv(vx0, vy0), inv(vx0 + vwA, vy0), inv(vx0 + vwA, vy0 + vhA), inv(vx0, vy0 + vhA)].map(([rx, ry]) => [rx - ry + L - 1, (rx + ry) / 2]);
  c.strokeStyle = "rgba(255,255,255,.85)"; c.lineWidth = 1; c.beginPath(); c.moveTo(cs[0][0], cs[0][1]); for (const q of cs) c.lineTo(q[0], q[1]); c.closePath(); c.stroke();
  mmWin = { L, ox, oy };
}
// ---------- the big world map ----------
let wmBase = null, wmSig = "", wmAt = 0; export let wmWin = null;
export function worldMap(cv2, force) {
  if (!W) return false; const S = W.S;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, revealed = 0;
  for (const ch of W.chunks.values()) for (let j = 0; j < C; j += 2) for (let i = 0; i < C; i += 2) if (!ch.fog[j * C + i]) { revealed++; const x = ch.x0 + i, y = ch.y0 + j; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  if (x0 > x1) return false;
  const L = Math.max(64, x1 - x0 + 10, y1 - y0 + 10) | 0, ox = Math.floor((x0 + x1) / 2 - L / 2), oy = Math.floor((y0 + y1) / 2 - L / 2), sc = L <= 160 ? 3 : L <= 300 ? 2 : 1, st = L > 260 ? 2 : 1;
  const sig = [L, ox, oy, revealed, season].join();
  if (!wmBase || force || (sig !== wmSig && performance.now() - wmAt > 3000)) {
    wmSig = sig; wmAt = performance.now(); wmBase = document.createElement("canvas"); wmBase.width = L * 2; wmBase.height = L;
    const b = wmBase.getContext("2d"), img = b.createImageData(L * 2, L), d = img.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = 14; d[i + 1] = 22; d[i + 2] = 32; d[i + 3] = 255; }
    for (let ry = 0; ry < L; ry += st) for (let rx = 0; rx < L; rx += st) {
      const x = ox + rx + st / 2, y = oy + ry + st / 2; if (M.hidden(W, x, y)) continue;
      const col = mmColor(x, y), u = rx - ry + L - 1, v = (rx + ry) >> 1; if (v >= L) continue;
      for (let dv = 0; dv < st && v + dv < L; dv++) for (let du = 0; du < 2 * st; du++) { const uu = u + du - (st - 1); if (uu < 0 || uu >= L * 2) continue; const o = ((v + dv) * L * 2 + uu) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; }
    }
    b.putImageData(img, 0, 0);
  }
  cv2.width = L * 2 * sc; cv2.height = L * sc; const c = cv2.getContext("2d"); c.imageSmoothingEnabled = false; c.drawImage(wmBase, 0, 0, cv2.width, cv2.height);
  const P = (x, y) => [((x - ox) - (y - oy) + L - 1) * sc + sc, ((x - ox) + (y - oy)) / 2 * sc];
  const fz = Math.max(1, cv2.width / Math.max(300, cv2.clientWidth || cv2.width)); c.textAlign = "center"; c.lineJoin = "round";
  const label = (t, x, y, col, size) => { c.font = "700 " + Math.round(size * fz * .85) + "px 'Trebuchet MS',sans-serif"; c.lineWidth = 3 * fz; c.strokeStyle = "rgba(10,14,20,.9)"; c.strokeText(t, x, y); c.fillStyle = col; c.fillText(t, x, y); };
  const star = (x, y, r) => { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * .45 : r; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } c.closePath(); c.fillStyle = "#ffd24a"; c.fill(); c.lineWidth = 1.5; c.strokeStyle = "#3a2a10"; c.stroke(); };
  for (const w of S.wonders || []) { const [x, y] = P(w.x, w.y); star(x, y, (6 + sc) * fz * .8); label(M.WONDERS[w.k].name, x, y - (9 + sc) * fz * .8, "#fff0b0", 9 + sc * 1.5); }
  for (const t of S.towns || []) { const [x, y] = P(t.x, t.y); c.beginPath(); c.arc(x, y, (3 + sc) * fz * .8, 0, 6.3); c.fillStyle = "#f0c860"; c.fill(); c.lineWidth = 1.5 * fz; c.strokeStyle = "#2a1a0a"; c.stroke(); label(t.name, x, y - (7 + sc) * fz * .8, "#ffffff", 10 + sc * 1.5); }
  for (const b of S.b) if (b.type === "harbor" && b.done) { const [x, y] = P(b.x + 1.5, b.y + 1); c.fillStyle = "#5cb0e8"; c.fillRect(x - 3, y - 3, 6, 6); c.strokeStyle = "#0a2038"; c.lineWidth = 1.5; c.strokeRect(x - 3, y - 3, 6, 6); }
  for (const bt of S.boats || []) if (bt.st !== "dock") { const [x, y] = P(bt.x, bt.y); c.beginPath(); c.moveTo(x, y - 5); c.lineTo(x + 4, y + 3); c.lineTo(x - 4, y + 3); c.closePath(); c.fillStyle = "#fff"; c.fill(); c.lineWidth = 1.5; c.strokeStyle = "#0a2038"; c.stroke(); }
  if (S.trek) { const lead = S.people.find(q => q.id === S.trek.members[0]); if (lead) { const [x, y] = P(lead.x, lead.y); c.beginPath(); c.arc(x, y, 3 + sc / 2, 0, 6.3); c.fillStyle = "#ff5a44"; c.fill(); c.lineWidth = 1.5; c.strokeStyle = "#2a0a08"; c.stroke(); label("Expedition", x, y - 7 - sc, "#ffb0a0", 9 + sc); } }
  wmWin = { L, ox, oy, sc }; return true;
}
export function wmToWorld(u, v) { if (!wmWin) return null; const { L, ox, oy, sc } = wmWin, a = (u / sc - 1 - (L - 1)) / 2, vv = v / sc; return { x: ox + vv + a, y: oy + vv - a }; }
export function minimapToWorld(u, v) { if (!mmWin) return null; const { L, ox, oy } = mmWin, a = (u - (L - 1)) / 2; return { x: ox + v + a, y: oy + v - a }; }
