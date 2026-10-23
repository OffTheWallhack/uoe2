// ============================================================
// Usage of Empires II — simulation core (shared by browser and server)
// Pure JavaScript, no DOM. Deterministic: same state + same ticks = same result.
// World: endless grid of tiles, generated in chunks of 32x32 tiles from a seed.
// One tick = 0.25 s of real time. The village lives in real time.
// ============================================================
export const C = 32, C4 = C * 4, DT = 0.25, WK = 65535 / 1.4;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function ih(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
let SX = 0, SY = 0;
export function vn(x, y, s) {
  const xi = Math.floor(x / s), yi = Math.floor(y / s), xf = x / s - xi, yf = y / s - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = ih(xi + SX, yi + SY), b = ih(xi + 1 + SX, yi + SY), c = ih(xi + SX, yi + 1 + SY), d = ih(xi + 1 + SX, yi + 1 + SY);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function mkRng(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// ---------- terrain (pure functions of the seed) ----------
export const lakeV = (x, y) => vn(x + 1000, y, 22) * .65 + vn(x, y + 900, 7) * .35 - Math.max(0, 1 - Math.hypot(x, y) / 24) * .5;
export const isWater = (x, y) => lakeV(x, y) > .7;
export const fdV = (x, y) => vn(x + 200, y + 200, 11) * .65 + vn(x, y + 77, 4) * .35 - Math.max(0, 1 - Math.hypot(x, y) / 10) * .45;
export const lfV = (x, y) => vn(x + 40, y + 40, 5) * .6 + vn(x, y, 1.7) * .4;
export const rockV = (x, y) => vn(x + 500, y - 300, 10) * .75 + vn(x, y, 3) * .25 - Math.max(0, 1 - Math.hypot(x, y) / 12) * .5;
// ---------- buildings catalog ----------
export const TYPES = {
  camp:   { name: "Wagon Camp", a: 3, b: 3, cost: {}, beds: 5, drop: ["wood", "stone", "food"], time: 0, d: "A tent by the wagon. The first home of the village." },
  pit:    { name: "Pit House", a: 2, b: 2, cost: { wood: 15 }, beds: 2, time: 480, d: "A sunken hut under a thatched roof. Home for two." },
  hut:    { name: "Hut", a: 3, b: 3, cost: { wood: 30, stone: 5 }, beds: 3, time: 900, d: "Wattle walls, thatch roof. Home for three.", unlock: "harvest" },
  store:  { name: "Storehouse", a: 3, b: 2, cost: { wood: 40 }, drop: ["wood", "stone", "food"], time: 900, d: "Villagers bring everything here instead of walking back to camp." },
  wcut:   { name: "Woodcutter's Hut", a: 2, b: 2, cost: { wood: 20 }, drop: ["wood"], time: 600, d: "Woodcutters drop their logs here, close to the forest." },
  forage: { name: "Forager's Hut", a: 2, b: 2, cost: { wood: 20 }, drop: ["food"], time: 600, d: "Baskets of berries and mushrooms. Foragers drop food here." },
  fisher: { name: "Fisher's Hut", a: 2, b: 2, cost: { wood: 20 }, drop: ["food"], time: 600, water: true, d: "Nets and a drying rack. Must stand by the water." },
  quarry: { name: "Quarry", a: 2, b: 2, cost: { wood: 25 }, drop: ["stone"], time: 720, rocks: true, d: "Stone is broken and stacked here.", unlock: "pop7" },
  field:  { name: "Field", a: 6, b: 5, cost: { wood: 10 }, time: 240, field: true, d: "Villagers plow, sow and harvest. The Mayor picks the crop." },
  well:   { name: "Well", a: 1, b: 1, cost: { stone: 15 }, time: 600, d: "Fresh water. Villagers like to chat here.", unlock: "pop10" },
  torch:  { name: "Torch Post", a: 1, b: 1, cost: { wood: 3 }, time: 30, deco: true, light: true, d: "A torch on a post. Burns from dusk until dawn." },
  bench:  { name: "Bench", a: 1, b: 1, cost: { wood: 5 }, time: 40, deco: true, d: "A place to sit. Villagers rest here.", unlock: "path" },
};
export const BUILD_MENU = ["pit", "hut", "store", "wcut", "forage", "fisher", "quarry", "field", "well", "torch", "bench"];
export const UNLOCK_TEXT = { harvest: "Unlocks after the first harvest", pop7: "Unlocks at 7 villagers", pop10: "Unlocks at 10 villagers", path: "Unlocks with the first footpath" };
export const CROPS = { wheat: { name: "Wheat", yield: 30 }, barley: { name: "Barley", yield: 28 }, cabbage: { name: "Cabbage", yield: 34 }, flax: { name: "Flax", yield: 24 } };
const NAMES = ["Branko", "Dusa", "Milan", "Olga", "Ratibor", "Svetla", "Zdeno", "Kveta", "Bohuslav", "Lubica", "Ctibor", "Milica", "Bohdan", "Mila", "Radko", "Vesna", "Dobroslav", "Luba", "Stano", "Zora", "Jarek", "Dana", "Ivo", "Hela", "Miro", "Nada", "Tomas", "Rada", "Vlk", "Bela", "Ondro", "Lada", "Kubo", "Sona", "Pavol", "Jela"];
const TRAITS = ["early riser", "storyteller", "stubborn", "dreamer", "hard worker", "gossip", "careful", "cheerful", "night owl", "quiet", "curious", "grumpy but kind"];
// ---------- world runtime ----------
// W = { S: serializable state, chunks: Map, occ: Map, ... }
export function createWorld(seed, t0) {
  const S = {
    v: 1, seed, tick: 0, t0, tz: "Europe/Bratislava", rng: (seed ^ 0x9e3779b9) >>> 0, rev: 0,
    phase: "choose", res: { food: 20, wood: 10, stone: 0 }, ms: {}, log: [], people: [], b: [], nextId: 1,
    wagon: null, ox: null, rally: null, hungry: false, eatT: 0, planT: 40, roleT: 0, arriveT: 120, weather: { kind: "clear", temp: null, at: 0 },
    chunks: {},
  };
  const W = wrap(S);
  const R = mkRng(seed + 7);
  // the old cart track the wagon came along
  const ang = Math.PI * (.75 + R() * .5), ex = Math.cos(ang) * 46, ey = Math.sin(ang) * 46;
  S.entry = { x: ex, y: ey };
  S.wagon = { x: 0, y: 0, path: null, d: 0, alongY: Math.abs(ey) > Math.abs(ex), hx: -ex, hy: -ey };
  S.ox = { x: 1.8, y: 0 };
  for (let i = 0; i < 5; i++) S.people.push(newPerson(W, Math.cos(i * 1.3) * 1.6 - 1.2, Math.sin(i * 1.3) * 1.1 + 1.4));
  for (const p of S.people) { p.state = "wait"; p.act = "Waiting by the wagon"; }
  reveal(W, 0, 0, 14);
  for (const q of W.trail) if (Math.hypot(q.x, q.y) < 40) reveal(W, q.x, q.y, 4);
  addLog(W, "A wagon with five settlers has arrived in the valley.");
  return W;
}
function rnd(W) { let s = W.S.rng = (W.S.rng + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
function newPerson(W, x, y) {
  const S = W.S, used = new Set(S.people.map(p => p.name));
  let name = NAMES[(rnd(W) * NAMES.length) | 0], k = 0; while (used.has(name) && k++ < 60) name = NAMES[(rnd(W) * NAMES.length) | 0];
  if (used.has(name)) { let i = 2; while (used.has(name + " " + ["", "", "II", "III", "IV", "V", "VI"][i] ) && i < 6) i++; name = name + " " + ["", "", "II", "III", "IV", "V", "VI"][i]; }
  return { id: S.nextId++, name, trait: TRAITS[(rnd(W) * TRAITS.length) | 0], look: [(rnd(W) * 8) | 0, (rnd(W) * 8) | 0, (rnd(W) * 5) | 0],
    x, y, hx: 1, hy: 0, ax: 1, ay: 0, state: "idle", role: "wood", job: null, obj: null, tx: x, ty: y, t: 1 + rnd(W) * 2, carry: null, home: 0, sit: false, asleep: false, steerT: 0, revT: 0, moving: false, act: "" };
}
export function wrap(S) {
  SX = (mkRng(S.seed)() * 20000) | 0; SY = (mkRng(S.seed + 1)() * 20000) | 0;
  const W = { S, chunks: new Map(), occ: new Map(), events: [], trail: [], dirtyGround: [], dirtyFog: [], newChunks: [] };
  // trail from the entry point to the start clearing
  const R = mkRng(S.seed + 3), ex = S.entry ? S.entry.x : 0, ey = S.entry ? S.entry.y : 0;
  if (S.entry) { const L = Math.hypot(ex, ey), nx = ey / L, ny = -ex / L; for (let t = 0; t <= 1; t += .4 / L) { const o = Math.sin(t * Math.PI) * Math.sin(t * 7 + S.seed % 7) * 2.4; W.trail.push({ x: ex * (1 - t) + nx * o, y: ey * (1 - t) + ny * o }); } }
  // rebuild occupancy
  for (const b of S.b) occupy(W, b, true);
  return W;
}
// ---------- chunks ----------
export const ckey = (cx, cy) => cx + "," + cy;
export function chunkAt(W, x, y, create) { const cx = Math.floor(x / C), cy = Math.floor(y / C); return getChunk(W, cx, cy, create); }
export function getChunk(W, cx, cy, create) {
  const k = ckey(cx, cy); let ch = W.chunks.get(k);
  if (!ch && create) { ch = genChunk(W, cx, cy); W.chunks.set(k, ch); W.newChunks.push(ch); }
  return ch;
}
function genChunk(W, cx, cy) {
  const S = W.S, ch = { cx, cy, k: ckey(cx, cy), x0: cx * C, y0: cy * C, trees: [], rocks: [], bushes: [], shore: [], wear: new Uint16Array(C4 * C4), fog: new Uint8Array(C * C).fill(1) };
  const trail = W.trail.filter(p => p.x > ch.x0 - 2 && p.x < ch.x0 + C + 2 && p.y > ch.y0 - 2 && p.y < ch.y0 + C + 2);
  const nearTrail = (x, y, r) => trail.some(p => Math.abs(p.x - x) < r && Math.abs(p.y - y) < r && Math.hypot(p.x - x, p.y - y) < r);
  for (let y = ch.y0 + .4; y < ch.y0 + C; y += .75) for (let x = ch.x0 + .4; x < ch.x0 + C; x += .75) {
    const jx = x + (ih(Math.floor(x * 9) + SX, Math.floor(y * 7)) - .5) * .7, jy = y + (ih(Math.floor(x * 5), Math.floor(y * 3) + SY) - .5) * .7;
    if (jx < ch.x0 || jy < ch.y0 || jx >= ch.x0 + C || jy >= ch.y0 + C) continue;
    if (lakeV(jx, jy) > .62 || nearTrail(jx, jy, 1.2) || Math.hypot(jx, jy) < 4.5) continue;
    const r = ih(Math.floor(jx * 13) + SX, Math.floor(jy * 11) + SY), v = ih(Math.floor(x * 3) + SY, Math.floor(y * 3)), fd = fdV(jx, jy), rk = rockV(jx, jy);
    if (rk > .72) { if (r < .14) ch.rocks.push({ x: jx, y: jy, v, big: r < .08, stone: r < .08 ? 6 : 2 }); continue; }
    if (fd > .62 && r < .55) ch.trees.push({ x: jx, y: jy, t: r < .34 ? "spruce" : "spruceS", s: .8 + ih(Math.floor(x), Math.floor(y)) * .6, v, logs: 3, felled: false, regrow: 0, cleared: false });
    else if (fd > .52 && r < .1) ch.trees.push({ x: jx, y: jy, t: "oak", s: .9 + ih(Math.floor(x), Math.floor(y)) * .4, v, logs: 3, felled: false, regrow: 0, cleared: false });
    else if (fd < .52 && r < .014) ch.trees.push({ x: jx, y: jy, t: r < .007 ? "birch" : "oak", s: .8 + ih(Math.floor(x), Math.floor(y)) * .4, v, logs: 3, felled: false, regrow: 0, cleared: false });
    else if (r > .994) ch.rocks.push({ x: jx, y: jy, v, big: false, stone: 2 });
    else if (r > .972 && fd > .38 && fd < .75) ch.bushes.push({ x: jx, y: jy, v, berries: 3, regrow: 0 });
  }
  ch.trees.forEach((t, i) => { t.i = i; t._k = ch.k; }); ch.rocks.forEach((t, i) => { t.i = i; t._k = ch.k; }); ch.bushes.forEach((t, i) => { t.i = i; t._k = ch.k; });
  for (let y = ch.y0; y < ch.y0 + C; y++) for (let x = ch.x0; x < ch.x0 + C; x++) {
    if (isWater(x + .5, y + .5)) continue;
    if (isWater(x + 1.5, y + .5) || isWater(x - .5, y + .5) || isWater(x + .5, y + 1.5) || isWater(x + .5, y - .5)) if (ih(x + SX, y) < .5) ch.shore.push({ x: x + .5, y: y + .5, i: ch.shore.length, _k: ch.k });
  }
  for (const p of trail) stampChunk(ch, p.x, p.y, .75, .62);
  // apply saved overrides
  const o = W.S.chunks[ch.k];
  if (o) applyOverrides(ch, o);
  return ch;
}
function stampChunk(ch, x, y, r, w) {
  const gx = (x - ch.x0) * 4, gy = (y - ch.y0) * 4, R = Math.ceil(r * 4);
  for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
    const cx = Math.floor(gx) + i, cy = Math.floor(gy) + j; if (cx < 0 || cy < 0 || cx >= C4 || cy >= C4) continue;
    const d = Math.hypot(cx + .5 - gx, cy + .5 - gy) / 4, v = 1 - d / r; if (v > 0) { const k = cy * C4 + cx; ch.wear[k] = Math.max(ch.wear[k], Math.round(v * w * WK)); }
  }
}
// ---------- wear (footpaths) ----------
export function wearAt(W, x, y) { const ch = chunkAt(W, x, y, false); if (!ch) return 0; const i = Math.floor((x - ch.x0) * 4), j = Math.floor((y - ch.y0) * 4); return (ch.wear[j * C4 + i] || 0) / WK; }
export function addWear(W, x, y, amt) {
  const gx = x * 4, gy = y * 4; let formed = false;
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
    const sx = Math.floor(gx) + i, sy = Math.floor(gy) + j, d = Math.hypot(sx + .5 - gx, sy + .5 - gy) / 4, v = 1 - d / .55; if (v <= 0) continue;
    const ch = getChunk(W, Math.floor(sx / C4), Math.floor(sy / C4), true), li = sx - ch.cx * C4, lj = sy - ch.cy * C4, k = lj * C4 + li;
    const o = ch.wear[k] / WK, n = Math.min(1.4, o + amt * v); ch.wear[k] = Math.round(n * WK);
    if (Math.floor(o * 14) !== Math.floor(n * 14)) W.dirtyGround.push(ch, k);
    if (o < .8 && n >= .8) formed = true;
  }
  return formed;
}
// ---------- fog ----------
export function hidden(W, x, y) { const ch = chunkAt(W, x, y, false); if (!ch) return true; return ch.fog[(Math.floor(y) - ch.y0) * C + (Math.floor(x) - ch.x0)] === 1; }
export function reveal(W, cx, cy, r) {
  let ch0 = false;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    if (Math.hypot(x + .5 - cx, y + .5 - cy) > r) continue;
    const ch = chunkAt(W, x, y, true), k = (y - ch.y0) * C + (x - ch.x0);
    if (ch.fog[k]) { ch.fog[k] = 0; ch0 = true; ch.fogDirty = true; }
  }
  if (ch0) { // keep a ring of generated chunks around everything explored
    const a = Math.floor((cx - r) / C) - 1, b = Math.floor((cx + r) / C) + 1, c = Math.floor((cy - r) / C) - 1, d = Math.floor((cy + r) / C) + 1;
    for (let j = c; j <= d; j++) for (let i = a; i <= b; i++) getChunk(W, i, j, true);
    W.dirtyFog.push([cx, cy, r]);
  }
  return ch0;
}
// ---------- occupancy ----------
const tkey = (x, y) => x + ":" + y;
function occupy(W, b, on) { for (let y = Math.floor(b.y); y < Math.ceil(b.y + b.b); y++) for (let x = Math.floor(b.x); x < Math.ceil(b.x + b.a); x++) { if (on) W.occ.set(tkey(x, y), b); else W.occ.delete(tkey(x, y)); } }
export const occAt = (W, x, y) => W.occ.get(tkey(Math.floor(x), Math.floor(y)));
export function canPlace(W, type, x, y, mayor) {
  const T = TYPES[type], S = W.S; if (!T) return "Unknown building.";
  if (mayor && T.unlock && !S.ms[T.unlock]) return UNLOCK_TEXT[T.unlock] + ".";
  x = Math.round(x); y = Math.round(y);
  const m = T.deco ? 0 : 1;
  for (let j = y - m; j < y + T.b + m; j++) for (let i = x - m; i < x + T.a + m; i++) { if (W.occ.has(tkey(i, j))) return "Something is already standing there."; }
  for (let j = y; j < y + T.b; j++) for (let i = x; i < x + T.a; i++) {
    if (hidden(W, i + .5, j + .5)) return "That land is still unexplored.";
    if (isWater(i + .5, j + .5) || lakeV(i + .5, j + .5) > .66) return "Too wet to build here.";
    const ch = chunkAt(W, i, j, false); if (ch && ch.rocks.some(r => r.stone > 0 && r.x >= i && r.x < i + 1 && r.y >= j && r.y < j + 1)) return "Rocks are in the way.";
  }
  if (T.water) { let ok = false; for (let j = y - 2; j < y + T.b + 2 && !ok; j++) for (let i = x - 2; i < x + T.a + 2; i++) if (isWater(i + .5, j + .5)) { ok = true; break; } if (!ok) return "It must stand right by the water."; }
  if (S.phase !== "settled") return "Settle first.";
  return null;
}
function treesIn(W, x, y, a, b, fn) { for (let cy = Math.floor(y / C); cy <= Math.floor((y + b) / C); cy++) for (let cx = Math.floor(x / C); cx <= Math.floor((x + a) / C); cx++) { const ch = getChunk(W, cx, cy, true); for (const t of ch.trees) if (t.x >= x - .3 && t.x < x + a + .3 && t.y >= y - .3 && t.y < y + b + .3) fn(t, ch); } }
function bushesIn(W, x, y, a, b, fn) { for (let cy = Math.floor(y / C); cy <= Math.floor((y + b) / C); cy++) for (let cx = Math.floor(x / C); cx <= Math.floor((x + a) / C); cx++) { const ch = getChunk(W, cx, cy, true); for (const t of ch.bushes) if (t.x >= x - .3 && t.x < x + a + .3 && t.y >= y - .3 && t.y < y + b + .3) fn(t, ch); } }
export function addBuilding(W, type, x, y, by) {
  const T = TYPES[type], S = W.S; x = Math.round(x); y = Math.round(y);
  const b = { id: S.nextId++, type, x, y, a: T.a, b: T.b, done: T.time === 0, prog: 0, need: { ...T.cost }, by, at: S.tick };
  if (T.field) { b.crop = "wheat"; b.auto = true; b.stage = 0; b.work = 0; b.grow = 0; b.left = 0; }
  S.b.push(b); occupy(W, b, true);
  let n = 0; treesIn(W, x, y, T.a, T.b, (t, ch) => { if (!t.felled) { t.felled = true; t.cleared = true; t.logs = 0; n++; markChunk(W, ch); } else t.cleared = true; });
  bushesIn(W, x, y, T.a, T.b, (t, ch) => { t.gone = true; markChunk(W, ch); });
  if (n) S.res.wood += n;
  W.events.push({ k: "build", b });
  return b;
}
function markChunk(W, ch) { ch.ovDirty = true; ch.touched = true; }
// ---------- time ----------
const fmtCache = new Map();
export function clockOf(S, tick) {
  const ms = S.t0 + (tick ?? S.tick) * 250, key = Math.floor(ms / 60000);
  let c = fmtCache.get(key);
  if (!c) {
    let h = 12, m = 0, mon = 6;
    try { const parts = new Intl.DateTimeFormat("en-GB", { timeZone: S.tz, hour: "numeric", minute: "numeric", month: "numeric", hourCycle: "h23" }).formatToParts(new Date(ms)); for (const p of parts) { if (p.type === "hour") h = +p.value; if (p.type === "minute") m = +p.value; if (p.type === "month") mon = +p.value; } } catch (e) { const d = new Date(ms); h = d.getHours(); m = d.getMinutes(); mon = d.getMonth() + 1; }
    c = { hour: h + m / 60, month: mon }; if (fmtCache.size > 4000) fmtCache.clear(); fmtCache.set(key, c);
  }
  const sec = (ms % 60000) / 60000 / 60;
  return { hour: c.hour + sec, month: c.month };
}
export const seasonOf = month => month <= 2 || month === 12 ? "winter" : month <= 5 ? "spring" : month <= 8 ? "summer" : "autumn";
export function addLog(W, t) { const S = W.S; S.log.unshift({ tk: S.tick, t }); if (S.log.length > 40) S.log.length = 40; W.events.push({ k: "log", t }); }
function milestone(W, id, title, txt) { const S = W.S; if (S.ms[id]) return; S.ms[id] = S.tick; addLog(W, "Milestone: " + title + ". " + txt); W.events.push({ k: "milestone", title, txt }); }
// ---------- helpers ----------
export const capOf = W => 200 + 300 * W.S.b.filter(b => b.done && b.type === "store").length;
export const camp = W => W.S.b.find(b => b.type === "camp");
export function bedsTotal(W) { let n = 0; for (const b of W.S.b) if (b.done && TYPES[b.type].beds) n += TYPES[b.type].beds; return n; }
function homeFor(W) { const used = {}; for (const p of W.S.people) used[p.home] = (used[p.home] || 0) + 1; for (const b of W.S.b) { const T = TYPES[b.type]; if (b.done && T.beds && (used[b.id] || 0) < T.beds) return b.id; } return 0; }
const center = b => ({ x: b.x + b.a / 2, y: b.y + b.b / 2 });
export const doorOf = b => ({ x: b.x + b.a / 2, y: b.y + b.b + .45 });
function nearestDrop(W, kind, x, y) {
  let best = null, bd = 1e9;
  for (const b of W.S.b) { const T = TYPES[b.type]; if (!b.done || !T.drop || !T.drop.includes(kind)) continue; const d = doorOf(b), dd = Math.hypot(d.x - x, d.y - y); if (dd < bd) { bd = dd; best = b; } }
  return best;
}
function forEachNear(W, x, y, r, list, fn) {
  for (let cy = Math.floor((y - r) / C); cy <= Math.floor((y + r) / C); cy++) for (let cx = Math.floor((x - r) / C); cx <= Math.floor((x + r) / C); cx++) {
    const ch = getChunk(W, cx, cy, false); if (!ch) continue; for (const o of ch[list]) fn(o, ch);
  }
}
function pickNear(W, x, y, r, list, ok, k) {
  const c = [];
  forEachNear(W, x, y, r, list, (o, ch) => { if (!ok(o) || hidden(W, o.x, o.y)) return; const d = Math.hypot(o.x - x, o.y - y); if (d <= r) c.push([d, o, ch]); });
  c.sort((a, b) => a[0] - b[0]); if (!c.length) return null;
  const e = c[Math.min(c.length - 1, (rnd(W) * Math.min(k, c.length)) | 0)]; return { o: e[1], ch: e[2] };
}
const ref = (list, ch, o) => ({ l: list, c: ch.k, i: o.i });
function deref(W, r) { if (!r) return null; if (r.b) return W.S.b.find(b => b.id === r.b) || null; const ch = W.chunks.get(r.c); return ch ? ch[r.l][r.i] : null; }
const busy = new Map(); // runtime reservation counts, rebuilt each step
const bkey = r => r ? (r.b ? "b" + r.b : r.l + r.c + ":" + r.i) : "";
// ---------- villager brain ----------
function night(h) { return h >= 21.5 || h < 6; }
function deep(h) { return h >= 23 || h < 5.5; }
export function rallyStr(S) { if (!S.rally) return 0; const t = S.rally.t; return t < 60 ? 1 : Math.max(0, 1 - (t - 60) / 60); }
function assignRoles(W) {
  const S = W.S, n = S.people.length, sites = S.b.filter(b => !b.done).length;
  const fields = S.b.filter(b => b.done && TYPES[b.type].field).length;
  const want = { build: sites ? Math.min(n, Math.max(1, Math.round(n * .3)) + (S.b.some(b => !b.done && b.by === "mayor") ? 1 : 0)) : 0 };
  const rest = n - want.build;
  const foodShare = S.res.food < n * 6 ? .5 : .35;
  want.food = Math.max(1, Math.round(rest * foodShare)); want.stone = S.ms.settled && n >= 5 ? Math.max(0, Math.round(rest * .12)) : 0;
  want.scout = n >= 4 ? 1 : 0; want.wood = Math.max(0, rest - want.food - want.stone - want.scout);
  if (fields && want.food < fields) { want.food = Math.min(rest, fields); want.wood = Math.max(0, rest - want.food - want.stone - want.scout); }
  const have = {}; for (const k in want) have[k] = 0;
  const free = [];
  for (const p of S.people) { if (want[p.role] !== undefined && have[p.role] < want[p.role]) have[p.role]++; else free.push(p); }
  for (const p of free) { for (const k of ["build", "food", "wood", "stone", "scout"]) if (have[k] < want[k]) { p.role = k; have[k]++; break; } }
}
function pickJob(W, p, H) {
  const S = W.S, cm = camp(W), home = cm ? center(cm) : { x: 0, y: 0 }, rs = rallyStr(S), sea = seasonOf(clockOf(S).month);
  let role = p.role;
  if (S.rally && rs > .3 && rnd(W) < rs) role = S.rally.type;
  const cap = capOf(W);
  if (role !== "build" && role !== "scout" && S.res[role] >= cap) { const alt = ["food", "wood", "stone"].filter(k => S.res[k] < cap * .8); role = alt.length && rnd(W) < .5 ? alt[(rnd(W) * alt.length) | 0] : "rest"; }
  let job = null, obj = null, tx = 0, ty = 0;
  const free = r => !busy.get(bkey(r));
  if (role === "build") {
    const sites = S.b.filter(b => !b.done).sort((a, b) => (a.by === "mayor" ? 0 : 1) - (b.by === "mayor" ? 0 : 1) || a.at - b.at);
    for (const s of sites) {
      const needK = ["wood", "stone"].find(k => (s.need[k] || 0) > 0);
      if (needK && S.res[needK] > 0) { const st = nearestDrop(W, needK, s.x, s.y); if (st) { const d = doorOf(st); job = "fetch"; obj = { b: s.id }; p.fetchK = needK; p.fetchFrom = st.id; tx = d.x; ty = d.y; break; } }
      if (!needK) { const c = center(s); job = "construct"; obj = { b: s.id }; tx = c.x + (rnd(W) - .5) * s.a; ty = s.y + s.b + .3; break; }
    }
    if (!job) role = sites.some(s => (s.need.stone || 0) > 0 && !S.res.stone) ? "stone" : "wood";
  }
  if (!job && role === "food") {
    const f = S.b.filter(b => b.done && b.type === "field" && (b.stage === 0 || b.stage === 3));
    if (f.length) { const fb = f[(rnd(W) * f.length) | 0]; job = fb.stage === 0 ? "sow" : "harvest"; obj = { b: fb.id }; tx = fb.x + .5 + rnd(W) * (fb.a - 1); ty = fb.y + .5 + rnd(W) * (fb.b - 1); }
    else {
      const drop = nearestDrop(W, "food", p.x, p.y) || cm, dc = drop ? doorOf(drop) : home;
      const bush = sea !== "winter" ? pickNear(W, dc.x, dc.y, 28, "bushes", o => !o.gone && o.berries > 0 && free({ l: "bushes", c: ckeyOf(o), i: o.i }), 3) : null;
      const sh = pickNear(W, dc.x, dc.y, 32, "shore", o => free({ l: "shore", c: ckeyOf(o), i: o.i }), 3);
      const pick = bush && sh ? (Math.hypot(bush.o.x - dc.x, bush.o.y - dc.y) < Math.hypot(sh.o.x - dc.x, sh.o.y - dc.y) + 6 ? bush : sh) : (bush || sh);
      if (pick) { const isSh = pick === sh; job = isSh ? "fish" : "berries"; obj = ref(isSh ? "shore" : "bushes", pick.ch, pick.o); tx = pick.o.x + (isSh ? 0 : .5); ty = pick.o.y + (isSh ? 0 : .5); }
    }
  }
  if (!job && role === "stone") {
    const drop = nearestDrop(W, "stone", p.x, p.y) || cm, dc = drop ? doorOf(drop) : home;
    const r = pickNear(W, dc.x, dc.y, 34, "rocks", o => o.stone > 0 && free({ l: "rocks", c: ckeyOf(o), i: o.i }), 2);
    if (r) { job = "stone"; obj = ref("rocks", r.ch, r.o); tx = r.o.x + .6; ty = r.o.y + .6; } else role = "wood";
  }
  if (!job && role === "wood") {
    const drop = nearestDrop(W, "wood", p.x, p.y) || cm, dc = drop ? doorOf(drop) : home;
    const t = pickNear(W, dc.x, dc.y, 30, "trees", o => !o.felled && free({ l: "trees", c: ckeyOf(o), i: o.i }), 4);
    if (t) { job = "wood"; obj = ref("trees", t.ch, t.o); tx = t.o.x + .5; ty = t.o.y + .5; }
  }
  if (!job && role === "scout") {
    const a = rnd(W) * Math.PI * 2;
    for (let d = 4; d < 90; d++) { const x = home.x + Math.cos(a) * d, y = home.y + Math.sin(a) * d; if (isWater(x, y)) continue; if (hidden(W, x, y)) { job = "scout"; tx = x; ty = y; break; } }
  }
  if (!job) {
    const benches = S.b.filter(b => b.done && b.type === "bench");
    if (benches.length && rnd(W) < .4) { const bb = benches[(rnd(W) * benches.length) | 0]; job = "rest"; tx = bb.x + .5; ty = bb.y + 1.1; p.benchSit = true; }
    else { const a = rnd(W) * 6.3, d = 1.5 + rnd(W) * 2.5; job = "rest"; tx = home.x + Math.cos(a) * d; ty = home.y + Math.sin(a) * d + 2; p.benchSit = false; }
  }
  p.job = job; p.obj = obj; if (obj) busy.set(bkey(obj), 1); p.tx = tx; p.ty = ty; p.state = "go";
  p.act = { fetch: "Fetching materials for a building", construct: "Building", sow: "Plowing and sowing the field", harvest: "Harvesting", wood: "Going to chop wood", stone: "Going to break stone", berries: "Going to pick berries", fish: "Going fishing", scout: "Exploring the land", rest: "Taking a break" }[job];
}
function ckeyOf(o) { return o._k || ""; }
function think(W, p, H) {
  const S = W.S, cm = camp(W);
  if (night(H) && p.state !== "toStore" && p.state !== "deliver") {
    p.obj = null;
    const hb = S.b.find(b => b.id === p.home) || cm, hc = hb ? doorOf(hb) : { x: 0, y: 0 };
    if (deep(H)) { if (p.state !== "bed" && p.state !== "sleep") { p.state = "bed"; p.tx = hc.x; p.ty = hc.y; p.act = "Going home to sleep"; } return; }
    if (p.state !== "fire" && p.state !== "sit") { const f = cm ? center(cm) : { x: 0, y: 0 }, a = (p.id % 8) / 8 * 6.28 + .4; p.state = "fire"; p.tx = f.x + 2.2 + Math.cos(a) * 1.4; p.ty = f.y + 2.4 + Math.sin(a) * 1.1; p.act = "Going to the fire"; }
    return;
  }
  if (["sit", "sleep", "bed", "fire"].includes(p.state)) { p.sit = false; p.asleep = false; p.state = "idle"; }
  if (p.carry) {
    if (p.carry.to) { const s = S.b.find(b => b.id === p.carry.to); if (s && !s.done) { const c = center(s); p.state = "deliver"; p.tx = c.x; p.ty = s.y + s.b + .4; p.act = "Carrying " + p.carry.type + " to a building site"; return; } p.carry.to = 0; }
    const d = nearestDrop(W, p.carry.type, p.x, p.y) || cm; if (d) { const q = doorOf(d); p.state = "toStore"; p.tx = q.x; p.ty = q.y; p.act = "Carrying " + p.carry.amt + " " + p.carry.type + " home"; return; }
  }
  pickJob(W, p, H);
}
const WORK = { wood: 18, stone: 24, berries: 12, fish: 25, scout: .5, rest: 8, construct: 6, sow: 12, harvest: 10, fetch: 1 };
function walk(W, p, spd) {
  const dt = DT, dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
  if (d < .25) return true;
  p.steerT -= dt;
  if (p.steerT <= 0) {
    p.steerT = .5; const base = Math.atan2(dy, dx); let best = -1e9, ba = base;
    for (const off of [-.9, -.45, 0, .45, .9]) {
      const a = base + off, qx = p.x + Math.cos(a) * .9, qy = p.y + Math.sin(a) * .9;
      let sc = Math.cos(off) + (d > 2 ? Math.min(1, wearAt(W, qx, qy)) * .85 : 0); if (isWater(qx, qy)) sc -= 10;
      const o = occAt(W, qx, qy); if (o && !TYPES[o.type].field && d > 2) sc -= 2;
      if (sc > best) { best = sc; ba = a; }
    }
    p.ax = Math.cos(ba); p.ay = Math.sin(ba);
  }
  p.hx += (p.ax - p.hx) * .7; p.hy += (p.ay - p.hy) * .7; const hl = Math.hypot(p.hx, p.hy) || 1;
  const m = Math.min(d, spd * dt); p.x += p.hx / hl * m; p.y += p.hy / hl * m; p.moving = true;
  return false;
}
function updatePerson(W, p, H) {
  const S = W.S, cm = camp(W);
  p.moving = false;
  const spd = (S.hungry ? .8 : 1.1) * (1 + rallyStr(S) * .25);
  if (S.phase === "choose") { p.t -= DT; if (p.t < 0) { p.t = 3 + rnd(W) * 5; const a = rnd(W) * 6.3; p.tx = S.wagon.x - 1 + Math.cos(a) * 2; p.ty = S.wagon.y + 1.2 + Math.sin(a) * 1.4; } walk(W, p, .6); return; }
  if (S.phase === "travel") { const q = pathAt(S, S.wagon.d - 1.4 - (p.id % 5) * .9); p.tx = q.x + (p.id % 2 ? .7 : -.7); p.ty = q.y + (p.id % 2 ? -.5 : .5); walk(W, p, 1.6); if (p.moving) addWear(W, p.x, p.y, .012 * DT); return; }
  p.revT -= DT; if (p.revT <= 0) { p.revT = .75; reveal(W, p.x, p.y, 3.4); }
  switch (p.state) {
    case "arrive": if (walk(W, p, spd)) { p.state = "idle"; p.t = 1; } break;
    case "idle": case "wait": p.t -= DT; if (p.t <= 0) think(W, p, H); break;
    case "go": {
      const near = p.job !== "rest" && p.job !== "scout" && p.job !== "construct" && p.job !== "sow" && p.job !== "harvest" && Math.hypot(p.tx - p.x, p.ty - p.y) < .6;
      if (walk(W, p, spd) || near) {
        if (p.job === "fetch") { const s = deref(W, p.obj), k = p.fetchK; if (s && !s.done && (s.need[k] || 0) > 0 && S.res[k] > 0) { const n = Math.min(5, s.need[k], S.res[k]); S.res[k] -= n; s.need[k] -= n; p.carry = { type: k, amt: n, to: s.id }; } p.obj = null; p.state = "idle"; p.t = .3; break; }
        p.state = "work"; p.t = WORK[p.job] * (S.hungry ? 1.3 : 1) * (1 - rallyStr(S) * .2);
        p.act = { wood: "Chopping wood", stone: "Breaking stone", berries: "Picking berries", fish: "Fishing", scout: "Looking around", rest: "Resting", construct: "Building", sow: "Plowing and sowing", harvest: "Harvesting" }[p.job];
        if (p.job === "rest") p.sit = p.benchSit || rnd(W) < .3;
      }
      if (night(H)) think(W, p, H);
      break;
    }
    case "work": p.t -= DT; if (p.job === "construct") { const s = deref(W, p.obj); if (s && !s.done) { s.prog += DT / TYPES[s.type].time * (1 + rallyStr(S) * .3); if (s.prog >= 1) finishBuilding(W, s); } else p.t = 0; }
      if (p.t <= 0) { p.sit = false; finishWork(W, p); } break;
    case "deliver": if (walk(W, p, spd * .9)) { const s = S.b.find(b => b.id === p.carry.to); if (!s || s.done) { S.res[p.carry.type] += p.carry.amt; } p.carry = null; p.state = "idle"; p.t = .3; } break;
    case "toStore": if (walk(W, p, spd * .9)) {
      S.res[p.carry.type] = Math.min(capOf(W), S.res[p.carry.type] + p.carry.amt); W.events.push({ k: "gain", type: p.carry.type, amt: p.carry.amt, x: p.x, y: p.y });
      p.carry = null; p.state = "idle"; p.t = .6 + rnd(W) * 1.5 * (1 - rallyStr(S)); p.act = "Back home";
      if (S.res.wood >= 50) milestone(W, "wood50", "A Fine Woodpile", "Fifty logs stacked up.");
    } break;
    case "fire": case "bed": if (walk(W, p, spd)) { if (p.state === "fire") { p.state = "sit"; p.sit = true; p.act = "Sitting by the fire"; } else { p.state = "sleep"; p.asleep = true; p.act = "Sleeping"; } } if (!night(H)) think(W, p, H); break;
    case "sit": case "sleep": if (!night(H) || (p.state === "sit" && deep(H))) think(W, p, H); break;
  }
  if (p.moving) { const f = addWear(W, p.x, p.y, .034 * DT); if (f && cm && Math.hypot(p.x - cm.x - 1.5, p.y - cm.y - 1.5) > 8) milestone(W, "path", "First Footpath", "Your villagers walked their first path into the grass. The Bench is unlocked."); }
}
function finishWork(W, p) {
  const S = W.S, j = p.job, o = deref(W, p.obj); p.obj = null;
  if (j === "wood" && o && !o.felled) { o.logs--; p.carry = { type: "wood", amt: 2 }; if (o.logs <= 0) { o.felled = true; o.regrow = 3600; const ch = W.chunks.get(o._k); if (ch) ch.ovDirty = true; } }
  else if (j === "stone" && o && o.stone > 0) { o.stone--; p.carry = { type: "stone", amt: 1 }; if (o.stone <= 0) { const ch = W.chunks.get(o._k); if (ch) ch.ovDirty = true; } }
  else if (j === "berries" && o && o.berries > 0) { o.berries--; p.carry = { type: "food", amt: 2 }; if (o.berries <= 0) o.regrow = 600; }
  else if (j === "fish") { p.carry = { type: "food", amt: 3 }; }
  else if (j === "sow" && o && o.stage === 0) { o.work += 1; if (o.work >= 3) { o.stage = 1; o.work = 0; o.grow = 0; W.events.push({ k: "field", b: o }); } }
  else if (j === "harvest" && o && o.stage === 3) { const n = Math.min(3, o.left); o.left -= n; p.carry = { type: "food", amt: n }; if (o.left <= 0) { o.stage = 0; o.work = 0; W.events.push({ k: "field", b: o }); milestone(W, "harvest", "First Harvest", "The first field is harvested. The Hut is unlocked."); if (o.auto) {} } }
  else if (j === "scout") { p.state = "idle"; p.t = .5; return; }
  p.state = "idle"; p.t = .2;
}
function finishBuilding(W, s) {
  const S = W.S; s.done = true; s.prog = 1; delete s.need;
  addLog(W, (s.by === "mayor" ? "The Mayor's " : "A new ") + TYPES[s.type].name + " is finished.");
  W.events.push({ k: "built", b: s });
  const cm = camp(W), beds = TYPES[s.type].beds || 0;
  if (beds) { let cnt = 0; for (const p of S.people) if (cnt < beds && (!p.home || (cm && p.home === cm.id))) { p.home = s.id; cnt++; } }
}
// ---------- village planner: the villagers decide what to build ----------
function findSite(W, type, ax, ay, rmin, rmax) {
  const T = TYPES[type]; let best = null;
  for (let r = rmin; r <= rmax; r += 1) {
    const n = Math.max(8, Math.round(r * 3));
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2 + r * .37, x = Math.round(ax + Math.cos(a) * r - T.a / 2), y = Math.round(ay + Math.sin(a) * r - T.b / 2);
      if (canPlace(W, type, x, y, false)) continue;
      let trees = 0; treesIn(W, x, y, T.a, T.b, t => { if (!t.felled) trees++; });
      const sc = r + trees * .8 + (rnd(W) * .5);
      if (!best || sc < best.sc) best = { x, y, sc };
    }
    if (best && r > rmin + 3) break;
  }
  return best;
}
function plan(W) {
  const S = W.S, cm = camp(W); if (!cm) return;
  const c = center(cm), n = S.people.length, has = t => S.b.some(b => b.type === t), cnt = t => S.b.filter(b => b.type === t).length;
  if (S.b.filter(b => !b.done && b.by === "ai").length >= 1) return;
  const afford = t => { const k = TYPES[t].cost; return (S.res.wood >= (k.wood || 0) * .6) && (S.res.stone >= (k.stone || 0) * .6); };
  const free = bedsTotal(W) - n;
  let want = null, anchor = c, r0 = 4, r1 = 14;
  if (free <= 1) { want = S.ms.harvest && S.res.stone >= 3 ? "hut" : "pit"; r0 = 5; r1 = 16; }
  else if (!has("field") && n >= 5) { want = "field"; r0 = 6; r1 = 16; }
  else if (!has("wcut")) { want = "wcut"; const t = pickNear(W, c.x, c.y, 26, "trees", o => !o.felled, 1); if (t) { anchor = t.o; r0 = 2; r1 = 8; } }
  else if (!has("forage") && n >= 6) { want = "forage"; const t = pickNear(W, c.x, c.y, 26, "bushes", o => !o.gone, 1); if (t) { anchor = t.o; r0 = 2; r1 = 8; } else want = null; }
  if (!want && !has("fisher") && n >= 6) { const t = pickNear(W, c.x, c.y, 30, "shore", () => true, 1); if (t) { want = "fisher"; anchor = t.o; r0 = 1; r1 = 6; } }
  if (!want && n >= 7 && !has("store")) { want = "store"; r0 = 7; r1 = 16; }
  if (!want && S.ms.pop7 && !has("quarry")) { const t = pickNear(W, c.x, c.y, 34, "rocks", o => o.stone > 0, 1); if (t) { want = "quarry"; anchor = t.o; r0 = 2; r1 = 7; } }
  if (!want && S.ms.pop10 && !has("well")) { want = "well"; r0 = 3; r1 = 8; }
  if (!want && cnt("field") * 5 < n - 2) { want = "field"; r0 = 6; r1 = 22; }
  if (!want || !afford(want)) return;
  const site = findSite(W, want, anchor.x, anchor.y, r0, r1);
  if (!site) return;
  addBuilding(W, want, site.x, site.y, "ai");
  addLog(W, "The villagers started building a " + TYPES[want].name + ".");
}
// ---------- the whole world, one tick ----------
export function pathAt(S, d) { const P = S.wagon.path; if (!P) return { x: S.wagon.x, y: S.wagon.y }; const i = clamp(Math.floor(d / .25), 0, P.length - 1); return P[i]; }
export function step(W) {
  const S = W.S; S.tick++;
  const { hour: H, month } = clockOf(S);
  busy.clear(); for (const p of S.people) if (p.obj) busy.set(bkey(p.obj), 1);
  if (S.phase === "travel") {
    const P = S.wagon.path; S.wagon.d += DT * 1.3; const i = Math.floor(S.wagon.d / .25);
    if (i >= P.length - 1) { S.wagon.x = P[P.length - 1].x; S.wagon.y = P[P.length - 1].y; arrive(W); }
    else {
      const a = P[i], b = P[Math.min(P.length - 1, i + 1)], t = S.wagon.d / .25 - i; S.wagon.x = a.x + (b.x - a.x) * t; S.wagon.y = a.y + (b.y - a.y) * t;
      const hx = b.x - a.x, hy = b.y - a.y; if (Math.abs(hx) + Math.abs(hy) > 0) { S.wagon.alongY = Math.abs(hy) > Math.abs(hx); S.wagon.hx = hx; S.wagon.hy = hy; }
      const L = Math.hypot(S.wagon.hx, S.wagon.hy) || 1, nx = -S.wagon.hy / L, ny = S.wagon.hx / L;
      addWear(W, S.wagon.x + nx * .4, S.wagon.y + ny * .4, .06 * DT); addWear(W, S.wagon.x - nx * .4, S.wagon.y - ny * .4, .06 * DT);
      S.ox.x = S.wagon.x + S.wagon.hx / L * 1.9; S.ox.y = S.wagon.y + S.wagon.hy / L * 1.9;
      if (S.tick % 4 === 0) reveal(W, S.wagon.x, S.wagon.y, 6);
    }
  }
  if (S.phase === "settled") {
    const sea = seasonOf(month);
    if (S.tick % 20 === 0) {
      for (const ch of W.chunks.values()) {
        const wr = ch.wear; for (let k = 0; k < wr.length; k++) { const o = wr[k]; if (o) { const n = o > 9 ? o - 9 : 0; wr[k] = n; if (((o / WK * 14) | 0) !== ((n / WK * 14) | 0)) W.dirtyGround.push(ch, k); } }
        for (const t of ch.trees) if (t.felled && !t.cleared && t.regrow > 0) { t.regrow -= 5; if (t.regrow <= 0) { t.felled = false; t.logs = 3; ch.ovDirty = true; } }
        for (const b of ch.bushes) if (b.regrow > 0) { b.regrow -= 5; if (b.regrow <= 0) b.berries = 3; }
      }
      // fields grow (not in winter)
      for (const f of S.b) if (f.done && f.type === "field" && (f.stage === 1 || f.stage === 2)) {
        f.grow += sea === "winter" ? 0 : sea === "autumn" ? 3.5 : 5; const st = f.grow >= 5000 ? 3 : f.grow >= 2000 ? 2 : 1;
        if (st !== f.stage) { f.stage = st; if (st === 3) { f.left = CROPS[f.crop].yield; } W.events.push({ k: "field", b: f }); }
      }
    }
    S.eatT += DT; if (S.eatT > 100) { S.eatT = 0; const need = S.people.length; if (S.res.food >= need) { S.res.food -= need; S.hungry = false; } else { S.res.food = 0; if (!S.hungry) addLog(W, "Food is running low. Everyone works a little slower."); S.hungry = true; } }
    if (S.rally) { S.rally.t += DT; if (S.rally.t > 120) { addLog(W, "The rally is over. Everyone goes back to their own work."); S.rally = null; } }
    S.roleT -= DT; if (S.roleT <= 0) { S.roleT = 20; assignRoles(W); }
    S.planT -= DT; if (S.planT <= 0) { S.planT = 90; plan(W); }
    // newcomers
    S.arriveT -= DT;
    if (S.arriveT <= 0) {
      S.arriveT = 60; const n = S.people.length;
      if (bedsTotal(W) > n && S.res.food >= 12 + n * 2 && !night(H)) {
        const e = W.trail.find(q => !hidden(W, q.x, q.y)) || { x: 0, y: 0 }, p = newPerson(W, e.x, e.y), cm = camp(W), c = cm ? doorOf(cm) : { x: 0, y: 0 };
        p.state = "arrive"; p.tx = c.x; p.ty = c.y; p.act = "Arriving in the village"; p.home = homeFor(W); p.role = "wood";
        S.people.push(p); S.arriveT = 600 + n * 120;
        addLog(W, p.name + " (" + p.trait + ") arrived and wants to live here.");
        W.events.push({ k: "arrive", p });
        if (S.people.length >= 7) milestone(W, "pop7", "Seven Souls", "The village grows. The Quarry is unlocked.");
        if (S.people.length >= 10) milestone(W, "pop10", "Ten Villagers", "A real village now. The Well is unlocked.");
      }
    }
    if (!S.ms.tarn && S.tick % 40 === 0) for (const ch of W.chunks.values()) if (ch.shore.some(s => !hidden(W, s.x, s.y))) { milestone(W, "tarn", "Found the Water", "Clear water nearby. Fish!"); break; }
  }
  for (const p of S.people) updatePerson(W, p, H);
}
function arrive(W) {
  const S = W.S, t = S.target; S.phase = "settled";
  const cm = addBuilding(W, "camp", t.x - 1.5, t.y - 1.5, "ai"); cm.done = true;
  S.wagon.x = cm.x + 4.2; S.wagon.y = cm.y + 1.0; S.wagon.alongY = false; S.wagon.path = null; S.ox.x = S.wagon.x + 2.3; S.ox.y = S.wagon.y + .8;
  for (const ch of W.chunks.values()) { for (const tr of ch.trees) if (Math.hypot(tr.x - t.x, tr.y - t.y) < 4.6 && !tr.felled) { tr.felled = true; tr.cleared = true; ch.ovDirty = true; } for (const r of ch.rocks) if (Math.hypot(r.x - t.x, r.y - t.y) < 3.5) r.stone = 0; for (const b of ch.bushes) if (Math.hypot(b.x - t.x, b.y - t.y) < 3.5) b.gone = true; }
  reveal(W, t.x, t.y, 13);
  for (const p of S.people) { p.state = "idle"; p.t = 1 + rnd(W) * 2; p.home = cm.id; p.act = "Setting up camp"; }
  assignRoles(W);
  milestone(W, "settled", "Settled", "The fire is lit. Your village is born.");
}
// ---------- Mayor actions ----------
export function judgeSettle(W, x, y) {
  if (hidden(W, x, y)) return "That land is still unexplored.";
  if (lakeV(x, y) > .6) return "Too close to the water.";
  return null;
}
function routeTo(a, b) {
  const pts = [a], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
  let wet = -1; for (let t = 0; t <= 1; t += .3 / L) if (lakeV(a.x + dx * t, a.y + dy * t) > .62) { wet = t; break; }
  if (wet >= 0) { const nx = -dy / L, ny = dx / L; for (let o = 3; o < 40; o += 1.5) { let okp = null; for (const sg of [1, -1]) { const w = { x: a.x + dx * .5 + nx * o * sg, y: a.y + dy * .5 + ny * o * sg }; let dry = true; for (const [p, q] of [[a, w], [w, b]]) { const l = Math.hypot(q.x - p.x, q.y - p.y); for (let t = 0; t <= 1; t += .3 / l) if (lakeV(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t) > .62) { dry = false; break; } } if (dry) { okp = w; break; } } if (okp) { pts.push(okp); break; } } }
  pts.push(b);
  const out = []; for (let i = 0; i < pts.length - 1; i++) { const p = pts[i], q = pts[i + 1], l = Math.hypot(q.x - p.x, q.y - p.y); for (let t = 0; t < l; t += .25) out.push({ x: p.x + (q.x - p.x) * t / l, y: p.y + (q.y - p.y) * t / l }); }
  out.push(b); return out;
}
export function act(W, a) {
  const S = W.S;
  if (a.k === "settle") {
    if (S.phase !== "choose") return "Already settled.";
    const why = judgeSettle(W, a.x, a.y); if (why) return why;
    S.phase = "travel"; S.target = { x: a.x, y: a.y };
    S.wagon.path = routeTo({ x: S.wagon.x, y: S.wagon.y }, { x: a.x + 2.7, y: a.y - .5 }); S.wagon.d = 0;
    for (const p of S.people) { p.state = "follow"; p.act = "Walking beside the wagon"; }
    addLog(W, "The Mayor chose a place to settle. The wagon rolls on."); S.rev++; return null;
  }
  if (a.k === "place") {
    const why = canPlace(W, a.type, a.x, a.y, true); if (why) return why;
    addBuilding(W, a.type, a.x, a.y, "mayor"); addLog(W, "The Mayor ordered a " + TYPES[a.type].name + "."); S.roleT = 0; S.rev++; return null;
  }
  if (a.k === "cancel") {
    const b = S.b.find(q => q.id === a.id); if (!b || b.done || b.type === "camp") return "Can't cancel that.";
    const T = TYPES[b.type]; for (const k in T.cost) S.res[k] += (T.cost[k] - (b.need[k] || 0));
    occupy(W, b, false); S.b.splice(S.b.indexOf(b), 1); for (const p of S.people) if (p.obj && p.obj.b === b.id) { p.obj = null; p.state = "idle"; p.t = .5; }
    addLog(W, "The Mayor cancelled a " + T.name + "."); W.events.push({ k: "removed", b }); S.rev++; return null;
  }
  if (a.k === "crop") {
    const b = S.b.find(q => q.id === a.id); if (!b || b.type !== "field" || !CROPS[a.crop]) return "Not a field.";
    b.crop = a.crop; b.auto = false; addLog(W, "The Mayor wants " + CROPS[a.crop].name.toLowerCase() + " on a field."); W.events.push({ k: "field", b }); S.rev++; return null;
  }
  if (a.k === "rally") {
    if (S.phase !== "settled" || !["wood", "food", "stone", "build"].includes(a.type)) return "Not now.";
    S.rally = { type: a.type, t: 0 }; addLog(W, "The Mayor called: all hands on " + a.type + "!");
    milestone(W, "rally", "First Rally", "Your people answered the call.");
    for (const p of S.people) if (p.state === "idle" || (p.state === "go" && p.job === "rest") || (p.state === "work" && p.job === "rest")) { p.obj = null; p.sit = false; p.state = "idle"; p.t = rnd(W) * .6; }
    S.rev++; return null;
  }
  return "Unknown action.";
}
// ---------- save / load ----------
function b64(u8) { let s = ""; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return typeof btoa === "function" ? btoa(s) : Buffer.from(s, "binary").toString("base64"); }
function unb64(s) { const bin = typeof atob === "function" ? atob(s) : Buffer.from(s, "base64").toString("binary"); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
function varint(arr, v) { while (v >= 128) { arr.push((v & 127) | 128); v = Math.floor(v / 128); } arr.push(v); }
function rle(u8) { const out = []; let i = 0; while (i < u8.length) { const v = u8[i]; let n = 1; while (i + n < u8.length && u8[i + n] === v && n < 255) n++; out.push(n, v); i += n; } return b64(Uint8Array.from(out)); }
function unrle(s, len) { const a = unb64(s), u = new Uint8Array(len); let o = 0; for (let i = 0; i < a.length; i += 2) { u.fill(a[i + 1], o, o + a[i]); o += a[i]; } return u; }
export function serialize(W) {
  const S = W.S, chunks = {};
  for (const ch of W.chunks.values()) {
    const o = {}; let any = false;
    const wb = []; let last = -1; for (let i = 0; i < ch.wear.length; i++) { const v = ch.wear[i]; if (!v) continue; varint(wb, i - last - 1); varint(wb, v); last = i; }
    if (wb.length) { o.w = b64(Uint8Array.from(wb)); any = true; }
    if (ch.fog.some(v => v === 0)) { o.f = rle(ch.fog); any = true; } else { o.f = 0; any = true; }
    const tf = []; ch.trees.forEach(t => { if (t.felled || t.logs < 3) tf.push([t.i, t.felled ? 1 : 0, t.logs, Math.round(t.regrow), t.cleared ? 1 : 0]); }); if (tf.length) { o.t = tf; any = true; }
    const rs = []; ch.rocks.forEach(r => { const full = r.big ? 6 : 2; if (r.stone !== full) rs.push([r.i, r.stone]); }); if (rs.length) { o.r = rs; any = true; }
    const bs = []; ch.bushes.forEach(b => { if (b.gone || b.berries < 3) bs.push([b.i, b.gone ? 1 : 0, b.berries, Math.round(b.regrow)]); }); if (bs.length) { o.b = bs; any = true; }
    if (any) chunks[ch.k] = o;
  }
  const out = JSON.parse(JSON.stringify({ ...S, chunks }));
  for (const p of out.people) { delete p.moving; }
  return out;
}
function applyOverrides(ch, o) {
  if (o.w) { ch.wear.fill(0); const a = unb64(o.w); let p = 0, idx = -1; const rd = () => { let v = 0, sh = 0, b; do { b = a[p++]; v += (b & 127) * 2 ** sh; sh += 7; } while (b & 128); return v; }; while (p < a.length) { idx += rd() + 1; ch.wear[idx] = rd(); } }
  if (o.f) ch.fog = unrle(o.f, C * C);
  if (o.t) for (const [i, f, l, r, c] of o.t) { const t = ch.trees[i]; if (t) { t.felled = !!f; t.logs = l; t.regrow = r; t.cleared = !!c; } }
  if (o.r) for (const [i, s] of o.r) { if (ch.rocks[i]) ch.rocks[i].stone = s; }
  if (o.b) for (const [i, g, be, r] of o.b) { const b = ch.bushes[i]; if (b) { b.gone = !!g; b.berries = be; b.regrow = r; } }
}
export function load(json) {
  const S = typeof json === "string" ? JSON.parse(json) : json;
  const W = wrap(S);
  // regenerate all chunks that were known (overrides applied in genChunk)
  for (const k of Object.keys(S.chunks)) { const [cx, cy] = k.split(",").map(Number); getChunk(W, cx, cy, true); }
  // ring of chunks around explored ones
  for (const ch of [...W.chunks.values()]) if (ch.fog.some(v => v === 0)) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) getChunk(W, ch.cx + i, ch.cy + j, true);
  return W;
}
// advance to a target tick (bounded)
export function advance(W, toTick, maxSteps) {
  let n = 0; const lim = maxSteps || 1e9;
  while (W.S.tick < toTick && n < lim) { step(W); n++; }
  if (W.S.tick < toTick) { W.S.slept = (W.S.slept || 0) + (toTick - W.S.tick); W.S.t0 += (toTick - W.S.tick) * 250; /* skip the rest: the world rested */ }
  return n;
}
export const tickNow = (S, now) => Math.floor((now - S.t0) / 250);
