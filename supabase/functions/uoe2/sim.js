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
// Elevation: a big lake / sea lies in one direction from the start, highlands in the other.
// In the demo world everything is close together; in the full game the scales grow.
export const SEA = .40;
let DX = 1, DY = 0;
// Things the villagers change in the land itself: bridges and gravel fill over water, gravel roads.
const OVER = new Map(), ROAD = new Set();
export const okey = (x, y) => Math.floor(x) + ":" + Math.floor(y);
export const overAt = (x, y) => OVER.size ? OVER.get(okey(x, y)) : undefined;
export const isRoad = (x, y) => ROAD.size > 0 && ROAD.has(okey(x, y));
export function elev(x, y) {
  let e = vn(x + 3000, y - 1000, 48) * .5 + vn(x, y, 14) * .3 + vn(x + 77, y + 33, 5) * .2;
  const d = x * DX + y * DY;
  e += -Math.max(0, d - 20) * .013 + Math.max(0, -d - 18) * .01;
  const w = clamp(1 - Math.hypot(x, y) / 20, 0, 1), ws = w * w * (3 - 2 * w);
  return e * (1 - ws) + (SEA + .052) * ws; // the start valley: low, dry and gentle
}
export const cliffV = (x, y) => vn(x - 500, y + 800, 18);
// ---------- biomes ----------
// The demo world puts one of each biome close to the start; in the full game they come from noise at large scales.
export const DEMO = true;
const ax = (x, y) => [x * DX + y * DY, -x * DY + y * DX]; // u: towards the sea, v: across
export const fromAx = (u, v) => ({ x: u * DX - v * DY, y: u * DY + v * DX });
const anchor = (x, y, u0, v0, r) => { const [u, v] = ax(x, y); return Math.max(0, 1 - Math.hypot(u - u0, v - v0) / r); };
// birch grove
export const birchV = (x, y) => Math.max(vn(x + 9100, y + 300, 22) - .2, DEMO ? anchor(x, y, 4, -17, 11) * 1.1 : 0);
// flower meadow
export const flowerV = (x, y) => Math.max(vn(x - 8000, y + 4000, 18) - .22, DEMO ? anchor(x, y, -9, 5, 8) * 1.1 : 0);
// the stream: from the highlands down to the lake
export function riverD(x, y) { const [u, v] = ax(x, y); if (u < -70) return 99; const vc = 11 + Math.sin(u * .11) * 3.5 + (vn(u * .4 + 500, 7, 5) - .5) * 5; return Math.abs(v - vc); }
const riverW = (x, y) => { const u = x * DX + y * DY; return .55 + clamp((u - 4) * .025, 0, .8); };
export const isRiver = (x, y) => riverD(x, y) < riverW(x, y) && elev(x, y) >= SEA && !(OVER.size && OVER.has(okey(x, y)));
// alpine band: dwarf pine (kosodrevina) and mountain meadow
export const alpineV = h => h >= 20 && h < 38;
// ground height in screen pixels (0 = water level). Cliffy areas get sharp terraces.
export function heightAt(x, y) {
  if (OVER.size) { const o = OVER.get(okey(x, y)); if (o) return o.k === "f" ? 2 : o.z; }
  const e = elev(x, y); if (e < SEA) return 0;
  const sharp = clamp((cliffV(x, y) - .47) / .18, 0, 1) * clamp(Math.hypot(x, y) / 14 - .5, 0, 1);
  const v = (e - SEA) * 80 + sharp * 5, q = v / 6, fl = Math.floor(q), f = q - fl, w = .5 - .48 * sharp, s = clamp((f - (.5 - w)) / (2 * w), 0, 1);
  return (fl + s * s * (3 - 2 * s)) * 6;
}
export const lakeV = (x, y) => { if (OVER.size) { const o = OVER.get(okey(x, y)); if (o && o.k === "f") return .58; } return .7 + (SEA - elev(x, y)) * 2; };
export const isWater = (x, y) => { if (OVER.size) { const o = OVER.get(okey(x, y)); if (o && o.k === "f") return false; } return elev(x, y) < SEA; };
export const wet = (x, y) => (OVER.size && OVER.has(okey(x, y))) ? false : (elev(x, y) < SEA || riverD(x, y) < riverW(x, y));
export const steep = (x0, y0, x1, y1) => Math.abs(heightAt(x1, y1) - heightAt(x0, y0)) > 3.6;
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
  bridge: { name: "Bridge", a: 1, b: 1, cost: { wood: 4 }, perTile: true, time: 150, special: true, d: "Planks across the water. Villagers cross with dry feet. 4 wood per tile." },
  fill:   { name: "Gravel Fill", a: 2, b: 2, cost: { stone: 16 }, time: 360, special: true, d: "Stone and gravel dumped into shallow water. New land by the shore." },
  longhouse: { name: "Longhouse", a: 6, b: 3, cost: { wood: 120, stone: 20 }, beds: 8, time: 1800, d: "A great hall under one long roof. Home for eight.", unlock: "pop15" },
  mill:   { name: "Windmill", a: 3, b: 3, cost: { wood: 80, stone: 30 }, drop: ["food"], time: 1500, d: "Harvests are ground here. Every sack of grain gives half again as much food.", unlock: "harvest" },
  tavern: { name: "Tavern", a: 4, b: 3, cost: { wood: 70, stone: 10 }, time: 1500, d: "Ale, songs and stories. Evenings are spent here instead of by the fire.", unlock: "pop10" },
  chapel: { name: "Chapel", a: 4, b: 3, cost: { wood: 60, stone: 40 }, time: 1800, d: "A small chapel with a bell. It rings every evening; on Sunday mornings everyone gathers here.", unlock: "pop12" },
  tower:  { name: "Watchtower", a: 2, b: 2, cost: { wood: 40, stone: 10 }, time: 900, reveal: 20, d: "From the top you see far. Reveals the land all around." },
  fold:   { name: "Sheepfold", a: 4, b: 4, cost: { wood: 50 }, time: 900, d: "A fenced pasture with sheep. A shepherd brings milk and cheese.", unlock: "pop8" },
  apiary: { name: "Apiary", a: 2, b: 1, cost: { wood: 20 }, time: 400, d: "Straw beehives. Near flowers they give more honey.", unlock: "flowers" },
};
export const BUILD_MENU = ["pit", "hut", "longhouse", "store", "wcut", "forage", "fisher", "quarry", "field", "mill", "fold", "apiary", "well", "tavern", "chapel", "tower", "bridge", "fill", "torch", "bench"];
export const UNLOCK_TEXT = { harvest: "Unlocks after the first harvest", pop7: "Unlocks at 7 villagers", pop8: "Unlocks at 8 villagers", pop10: "Unlocks at 10 villagers", pop12: "Unlocks at 12 villagers", pop15: "Unlocks at 15 villagers", path: "Unlocks with the first footpath", flowers: "Unlocks when the villagers find a flower meadow" };
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
    chunks: {}, over: {}, road: [], wade: {}, sheep: [],
  };
  const W = wrap(S);
  const R = mkRng(seed + 7);
  // the old cart track the wagon came along
  const sa = mkRng(seed + 11)() * Math.PI * 2, ang = sa + Math.PI / 2 * (R() < .5 ? 1 : -1) + (R() - .5) * .5, ex = Math.cos(ang) * 46, ey = Math.sin(ang) * 46;
  S.entry = { x: ex, y: ey };
  S.wagon = { x: 0, y: 0, path: null, d: 0, alongY: Math.abs(ey) > Math.abs(ex), hx: -ex, hy: -ey };
  S.ox = { x: 1.8, y: 0 };
  for (let i = 0; i < 5; i++) S.people.push(newPerson(W, Math.cos(i * 1.3) * 1.6 - 1.2, Math.sin(i * 1.3) * 1.1 + 1.4));
  for (const p of S.people) { p.state = "wait"; p.act = "Waiting by the wagon"; }
  S.dog = { x: -1.5, y: 2.2, tx: -1.5, ty: 2.2, t: 1, owner: S.people[0].id, name: "Dunčo", fx: 1 };
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
  const sa = mkRng(S.seed + 11)() * Math.PI * 2; DX = Math.cos(sa); DY = Math.sin(sa);
  const W = { S, chunks: new Map(), occ: new Map(), events: [], trail: [], dirtyGround: [], dirtyFog: [], newChunks: [] };
  // trail from the entry point to the start clearing
  const R = mkRng(S.seed + 3), ex = S.entry ? S.entry.x : 0, ey = S.entry ? S.entry.y : 0;
  if (S.entry) { const L = Math.hypot(ex, ey), nx = ey / L, ny = -ex / L; for (let t = 0; t <= 1; t += .4 / L) { const o = Math.sin(t * Math.PI) * Math.sin(t * 7 + S.seed % 7) * 2.4; W.trail.push({ x: ex * (1 - t) + nx * o, y: ey * (1 - t) + ny * o }); } }
  // rebuild occupancy and the changed land
  OVER.clear(); ROAD.clear(); S.over = S.over || {}; S.road = S.road || []; S.wade = S.wade || {}; S.sheep = S.sheep || [];
  for (const k in S.over) OVER.set(k, S.over[k]); for (const k of S.road) ROAD.add(k);
  for (const b of S.b) occupy(W, b, true);
  if (!S.dog && S.people.length) S.dog = { x: S.people[0].x + 1, y: S.people[0].y, tx: S.people[0].x, ty: S.people[0].y, t: 1, owner: S.people[0].id, name: "Dunčo", fx: 1 };
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
    const r = ih(Math.floor(jx * 13) + SX, Math.floor(jy * 11) + SY), v = ih(Math.floor(x * 3) + SY, Math.floor(y * 3)), hz = heightAt(jx, jy), fd = fdV(jx, jy) - (hz > 30 ? (hz - 30) * .03 : 0), rk = rockV(jx, jy) + (hz > 24 ? (hz - 24) * .006 : 0);
    if (steep(jx - .3, jy - .3, jx + .3, jy + .3) || steep(jx + .3, jy - .3, jx - .3, jy + .3)) continue;
    if (rk > .72) { if (r < .14) ch.rocks.push({ x: jx, y: jy, v, big: r < .08, stone: r < .08 ? 6 : 2 }); continue; }
    if (riverD(jx, jy) < riverW(jx, jy) + .8) continue;
    if (alpineV(hz)) { // dwarf pine patches, a few spruces, blueberries
      const dw = vn(jx + 600, jy, 4);
      if (dw > .6 && r < .6) ch.trees.push({ x: jx, y: jy, t: "dwarf", s: .8 + ih(Math.floor(x), Math.floor(y)) * .5, v, logs: 1, felled: false, regrow: 0, cleared: false });
      else if (r < .04 && hz < 28) ch.trees.push({ x: jx, y: jy, t: "spruceS", s: .8, v, logs: 3, felled: false, regrow: 0, cleared: false });
      else if (r > .975) ch.bushes.push({ x: jx, y: jy, v, berries: 3, regrow: 0 });
      continue;
    }
    const bv = birchV(jx, jy);
    if (bv > .45 && hz < 15) { // birch grove: light woods with mushrooms
      if (r < .2 + bv * .15) ch.trees.push({ x: jx, y: jy, t: "birch", s: .8 + ih(Math.floor(x), Math.floor(y)) * .6, v, logs: 2, felled: false, regrow: 0, cleared: false });
      else if (r > .955) ch.bushes.push({ x: jx, y: jy, v, berries: 3, regrow: 0, mush: true });
      continue;
    }
    if (flowerV(jx, jy) > .45 && hz < 15) { if (r < .006) ch.trees.push({ x: jx, y: jy, t: "oak", s: 1.1, v, logs: 3, felled: false, regrow: 0, cleared: false }); continue; }
    if (fd > .62 && r < .55) ch.trees.push({ x: jx, y: jy, t: r < .34 ? "spruce" : "spruceS", s: .8 + ih(Math.floor(x), Math.floor(y)) * .6, v, logs: 3, felled: false, regrow: 0, cleared: false });
    else if (fd > .52 && r < .1 && hz < 26) ch.trees.push({ x: jx, y: jy, t: "oak", s: .9 + ih(Math.floor(x), Math.floor(y)) * .4, v, logs: 3, felled: false, regrow: 0, cleared: false });
    else if (fd < .52 && r < .014 && hz < 26) ch.trees.push({ x: jx, y: jy, t: r < .007 ? "birch" : "oak", s: .8 + ih(Math.floor(x), Math.floor(y)) * .4, v, logs: 3, felled: false, regrow: 0, cleared: false });
    else if (r > .994) ch.rocks.push({ x: jx, y: jy, v, big: false, stone: 2 });
    else if (r > .972 && fd > .38 && fd < .75) ch.bushes.push({ x: jx, y: jy, v, berries: 3, regrow: 0 });
  }
  ch.trees.forEach((t, i) => { t.i = i; t._k = ch.k; }); ch.rocks.forEach((t, i) => { t.i = i; t._k = ch.k; }); ch.bushes.forEach((t, i) => { t.i = i; t._k = ch.k; });
  for (let y = ch.y0; y < ch.y0 + C; y++) for (let x = ch.x0; x < ch.x0 + C; x++) {
    if (isWater(x + .5, y + .5)) continue;
    const rd = riverD(x + .5, y + .5), rw = riverW(x + .5, y + .5);
    if (rd >= rw && rd < rw + 1.1 && ih(x + SY, y + SX) < .35) { ch.shore.push({ x: x + .5, y: y + .5, i: ch.shore.length, _k: ch.k }); continue; }
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
    if (steep(i, j, i + 1, j) || steep(i, j, i, j + 1) || steep(i, j, i + 1, j + 1)) return "Too steep to build here.";
    if (riverD(i + .5, j + .5) < riverW(i + .5, j + .5) + .6) return "That is the stream.";
    const ch = chunkAt(W, i, j, false); if (ch && ch.rocks.some(r => r.stone > 0 && r.x >= i && r.x < i + 1 && r.y >= j && r.y < j + 1)) return "Rocks are in the way.";
  }
  if (T.water) { let ok = false; for (let j = y - 2; j < y + T.b + 2 && !ok; j++) for (let i = x - 2; i < x + T.a + 2; i++) if (isWater(i + .5, j + .5) || isRiver(i + .5, j + .5)) { ok = true; break; } if (!ok) return "It must stand right by the water."; }
  if (S.phase !== "settled") return "Settle first.";
  return null;
}
// where a building would stand if the Mayor taps (x, y); bridges and fill have their own rules
export function bridgeSpan(W, x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), wt = (i, j) => wet(i + .5, j + .5) && !W.occ.has(tkey(i, j));
  if (!wt(ix, iy)) return { err: "Tap on the water where the bridge should go." };
  let best = null;
  for (const [dx, dy] of [[1, 0], [0, 1]]) {
    let s = 0, e = 0; while (s < 10 && wt(ix - (s + 1) * dx, iy - (s + 1) * dy)) s++; while (e < 10 && wt(ix + (e + 1) * dx, iy + (e + 1) * dy)) e++;
    const len = s + e + 1; if (len > 9) continue;
    const ax = ix - (s + 1) * dx, ay = iy - (s + 1) * dy, bx = ix + (e + 1) * dx, by = iy + (e + 1) * dy;
    if (wet(ax + .5, ay + .5) || wet(bx + .5, by + .5) || hidden(W, ax + .5, ay + .5) || hidden(W, bx + .5, by + .5)) continue;
    const h1 = heightAt(ax + .5, ay + .5), h2 = heightAt(bx + .5, by + .5); if (Math.abs(h1 - h2) > 5) continue;
    if (!best || len < best.len) best = { x: ix - s * dx, y: iy - s * dy, a: dx ? len : 1, b: dy ? len : 1, len, z: Math.round((h1 + h2) / 2) + 1, dx, dy };
  }
  return best || { err: "Too wide here. Find a narrow spot (up to 9 tiles)." };
}
export function planShape(W, type, x, y, mayor) {
  const T = TYPES[type], S = W.S; if (!T) return { err: "Unknown building." };
  if (mayor && T.unlock && !S.ms[T.unlock]) return { err: UNLOCK_TEXT[T.unlock] + "." };
  if (S.phase !== "settled") return { err: "Settle first." };
  if (type === "bridge") return bridgeSpan(W, x, y);
  if (type === "fill") {
    const ix = Math.floor(x), iy = Math.floor(y);
    for (const [ox, oy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
      const X = ix + ox, Y = iy + oy; let ok = true, land = false;
      for (let j = 0; j < 2 && ok; j++) for (let i = 0; i < 2; i++) { const tx = X + i + .5, ty = Y + j + .5; if (!isWater(tx, ty) || overAt(tx, ty) || elev(tx, ty) < SEA - .04 || hidden(W, tx, ty) || W.occ.has(tkey(X + i, Y + j))) { ok = false; break; } }
      if (!ok) continue;
      for (let j = -1; j <= 2 && !land; j++) for (let i = -1; i <= 2; i++) if ((i < 0 || i > 1 || j < 0 || j > 1) && !wet(X + i + .5, Y + j + .5)) { land = true; break; }
      if (land) return { x: X, y: Y, a: 2, b: 2 };
    }
    return { err: "Gravel fill needs shallow water right next to the shore." };
  }
  const X = Math.round(x - T.a / 2), Y = Math.round(y - T.b / 2), err = canPlace(W, type, X, Y, mayor);
  return err ? { err, x: X, y: Y, a: T.a, b: T.b } : { x: X, y: Y, a: T.a, b: T.b };
}
function treesIn(W, x, y, a, b, fn) { for (let cy = Math.floor(y / C); cy <= Math.floor((y + b) / C); cy++) for (let cx = Math.floor(x / C); cx <= Math.floor((x + a) / C); cx++) { const ch = getChunk(W, cx, cy, true); for (const t of ch.trees) if (t.x >= x - .3 && t.x < x + a + .3 && t.y >= y - .3 && t.y < y + b + .3) fn(t, ch); } }
function bushesIn(W, x, y, a, b, fn) { for (let cy = Math.floor(y / C); cy <= Math.floor((y + b) / C); cy++) for (let cx = Math.floor(x / C); cx <= Math.floor((x + a) / C); cx++) { const ch = getChunk(W, cx, cy, true); for (const t of ch.bushes) if (t.x >= x - .3 && t.x < x + a + .3 && t.y >= y - .3 && t.y < y + b + .3) fn(t, ch); } }
export function addBuilding(W, type, x, y, by, sh) {
  const T = TYPES[type], S = W.S; x = Math.round(x); y = Math.round(y);
  const a = sh && sh.a || T.a, bb = sh && sh.b || T.b, need = {}; for (const k in T.cost) need[k] = T.cost[k] * (T.perTile ? a * bb : 1);
  const b = { id: S.nextId++, type, x, y, a, b: bb, done: T.time === 0, prog: 0, need, cost0: { ...need }, by, at: S.tick };
  if (type === "bridge") { b.z = sh.z; b.dx = sh.dx; }
  if (T.field) { b.crop = "wheat"; b.auto = true; b.stage = 0; b.work = 0; b.grow = 0; b.left = 0; }
  S.b.push(b); occupy(W, b, true);
  let n = 0; treesIn(W, x, y, a, bb, (t, ch) => { if (!t.felled) { t.felled = true; t.cleared = true; t.logs = 0; n++; markChunk(W, ch); } else t.cleared = true; });
  bushesIn(W, x, y, a, bb, (t, ch) => { t.gone = true; markChunk(W, ch); });
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
    let h = 12, m = 0, mon = 6, wd = 1;
    try { const parts = new Intl.DateTimeFormat("en-GB", { timeZone: S.tz, hour: "numeric", minute: "numeric", month: "numeric", weekday: "short", hourCycle: "h23" }).formatToParts(new Date(ms)); for (const p of parts) { if (p.type === "hour") h = +p.value; if (p.type === "minute") m = +p.value; if (p.type === "month") mon = +p.value; if (p.type === "weekday") wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.value); } } catch (e) { const d = new Date(ms); h = d.getHours(); m = d.getMinutes(); mon = d.getMonth() + 1; wd = d.getDay(); }
    c = { hour: h + m / 60, month: mon, wd }; if (fmtCache.size > 4000) fmtCache.clear(); fmtCache.set(key, c);
  }
  const sec = (ms % 60000) / 60000 / 60;
  return { hour: c.hour + sec, month: c.month, wd: c.wd };
}
export const seasonOf = month => month <= 2 || month === 12 ? "winter" : month <= 5 ? "spring" : month <= 8 ? "summer" : "autumn";
export function addLog(W, t) { const S = W.S; S.log.unshift({ tk: S.tick, t }); if (S.log.length > 40) S.log.length = 40; W.events.push({ k: "log", t }); }
function milestone(W, id, title, txt) { const S = W.S; if (S.ms[id]) return; S.ms[id] = S.tick; addLog(W, "Milestone: " + title + ". " + txt); W.events.push({ k: "milestone", title, txt }); }
// ---------- helpers ----------
export const capOf = W => 200 + 300 * W.S.b.filter(b => b.done && b.type === "store").length;
export const camp = W => W.S.b.find(b => b.type === "camp");
export function bedsTotal(W) { let n = 0; for (const b of W.S.b) if (b.done && TYPES[b.type].beds) n += TYPES[b.type].beds; return n; }
function homeFor(W) { const used = {}; for (const p of W.S.people) used[p.home] = (used[p.home] || 0) + 1; for (const b of W.S.b) { const T = TYPES[b.type]; if (b.done && T.beds && (used[b.id] || 0) < T.beds) return b.id; } return 0; }
const an = n => (/^[AEIOU]/.test(n) ? "an " : "a ") + n;
const center = b => ({ x: b.x + b.a / 2, y: b.y + b.b / 2 });
export const isSite = b => !b.done || !!b.upTo;
function workSpot(W, b) {
  if (b.type === "bridge") { const dx = b.dx ? 1 : 0, dy = 1 - dx, cm = camp(W), c = cm ? center(cm) : { x: 0, y: 0 }, e1 = { x: b.x - dx + .5, y: b.y - dy + .5 }, e2 = { x: b.x + (dx ? b.a : 0) + .5, y: b.y + (dy ? b.b : 0) + .5 }; return Math.hypot(e1.x - c.x, e1.y - c.y) < Math.hypot(e2.x - c.x, e2.y - c.y) ? e1 : e2; }
  if (b.type === "fill") { for (let j = -1; j <= 2; j++) for (let i = -1; i <= 2; i++) if ((i < 0 || i > 1 || j < 0 || j > 1) && !wet(b.x + i + .5, b.y + j + .5)) return { x: b.x + i + .5, y: b.y + j + .5 }; }
  return { x: b.x + b.a / 2, y: b.y + b.b + .3 };
}
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
const frac = v => v - Math.floor(v);
export const wakeAt = p => 5 + frac(p.id * .618) * 1.4 - (p.trait === "early riser" ? .5 : 0);
export const sleepAt = p => Math.min(23.9, 22.4 + frac(p.id * .414) * 1.1 + (p.trait === "night owl" ? .5 : 0));
const deepP = (p, h) => h >= sleepAt(p) || h < wakeAt(p);
const morningP = (p, h) => h >= wakeAt(p) && h < wakeAt(p) + .45;
const evening = h => h >= 21.5;
function night(h) { return h >= 21.5 || h < 6; }
export function rallyStr(S) { if (!S.rally) return 0; const t = S.rally.t; return t < 60 ? 1 : Math.max(0, 1 - (t - 60) / 60); }
function assignRoles(W) {
  const S = W.S, n = S.people.length, sites = S.b.filter(isSite).length;
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
    const sites = S.b.filter(isSite).sort((a, b) => (a.by === "mayor" ? 0 : 1) - (b.by === "mayor" ? 0 : 1) || a.at - b.at);
    for (const s of sites) {
      const needK = ["wood", "stone"].find(k => (s.need[k] || 0) > 0);
      if (needK && S.res[needK] > 0) { const st = nearestDrop(W, needK, s.x, s.y); if (st) { const d = doorOf(st); job = "fetch"; obj = { b: s.id }; p.fetchK = needK; p.fetchFrom = st.id; tx = d.x; ty = d.y; break; } }
      if (!needK) { const ws = workSpot(W, s); job = "construct"; obj = { b: s.id }; tx = ws.x + (s.type === "bridge" || s.type === "fill" ? 0 : (rnd(W) - .5) * s.a); ty = ws.y; break; }
    }
    if (!job) role = sites.some(s => (s.need.stone || 0) > 0 && !S.res.stone) ? "stone" : "wood";
  }
  if (!job && role === "food") {
    const f = S.b.filter(b => b.done && b.type === "field" && (b.stage === 0 || b.stage === 3));
    const fold = S.b.find(b => b.done && b.type === "fold" && (b.tend || 0) <= S.tick && free({ b: b.id }));
    const hive = sea !== "winter" && S.b.find(b => b.done && b.type === "apiary" && (b.honey || 0) <= S.tick && free({ b: b.id }));
    if (fold && rnd(W) < .6) { job = "tend"; obj = { b: fold.id }; tx = fold.x + 1 + rnd(W) * 2; ty = fold.y + 1 + rnd(W) * 2; }
    else if (hive && rnd(W) < .6) { job = "honey"; obj = { b: hive.id }; tx = hive.x + 1; ty = hive.y + 1.4; }
    else if (f.length) { const fb = f[(rnd(W) * f.length) | 0]; job = fb.stage === 0 ? "sow" : "harvest"; obj = { b: fb.id }; tx = fb.x + .5 + rnd(W) * (fb.a - 1); ty = fb.y + .5 + rnd(W) * (fb.b - 1); }
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
    if (drop && drop.type === "wcut" && rnd(W) < .3) { // the forester plants saplings where trees were felled
      const st = pickNear(W, dc.x, dc.y, 12, "trees", o => o.felled && !o.cleared && !o.sapling && free({ l: "trees", c: ckeyOf(o), i: o.i }), 2);
      if (st) { job = "plant"; obj = ref("trees", st.ch, st.o); tx = st.o.x + .5; ty = st.o.y + .5; }
    }
    const t = pickNear(W, dc.x, dc.y, 30, "trees", o => !o.felled && free({ l: "trees", c: ckeyOf(o), i: o.i }), 4);
    if (!job && t) { job = "wood"; obj = ref("trees", t.ch, t.o); tx = t.o.x + .5; ty = t.o.y + .5; }
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
  p.act = { fetch: "Fetching materials for a building", construct: "Building", sow: "Plowing and sowing the field", harvest: "Harvesting", wood: "Going to chop wood", stone: "Going to break stone", berries: "Going to pick berries", fish: "Going fishing", scout: "Exploring the land", rest: "Taking a break", plant: "Going to plant a young tree", tend: "Going to tend the sheep", honey: "Going to the beehives" }[job];
}
function ckeyOf(o) { return o._k || ""; }
function think(W, p, H) {
  const S = W.S, cm = camp(W);
  if (p.state === "sleep" && morningP(p, H)) { p.state = "morning"; p.act = "Waking up at home"; return; }
  if (p.state === "morning") { if (morningP(p, H)) return; p.state = "idle"; p.asleep = false; p.t = .3; }
  const chap = S.b.find(b => b.done && b.type === "chapel");
  if (chap && clockOf(S).wd === 0 && H >= 9.5 && H < 10.6 && !p.carry && !["church", "tochurch", "sleep", "morning"].includes(p.state)) { p.obj = null; const d = doorOf(chap); p.state = "tochurch"; p.tx = d.x; p.ty = d.y; p.act = "Going to the Sunday service"; return; }
  if ((deepP(p, H) || evening(H)) && p.state !== "toStore" && p.state !== "deliver") {
    p.obj = null;
    const hb = S.b.find(b => b.id === p.home) || cm, hc = hb ? doorOf(hb) : { x: 0, y: 0 };
    if (deepP(p, H)) { if (p.state !== "bed" && p.state !== "sleep") { p.inside = false; p.state = "bed"; p.tx = hc.x; p.ty = hc.y; p.act = "Going home to sleep"; } return; }
    const inn = S.b.find(b => b.done && b.type === "tavern");
    if (inn && H < 23.2) { if (p.state !== "toinn" && p.state !== "inn") { const d = doorOf(inn); p.state = "toinn"; p.tx = d.x + (rnd(W) - .5); p.ty = d.y; p.act = "Going to the tavern"; } return; }
    if (p.state !== "fire" && p.state !== "sit") { const f = cm ? center(cm) : { x: 0, y: 0 }, a = (p.id % 8) / 8 * 6.28 + .4; p.state = "fire"; p.tx = f.x + 2.2 + Math.cos(a) * 1.4; p.ty = f.y + 2.4 + Math.sin(a) * 1.1; p.act = "Going to the fire"; }
    return;
  }
  if (["sit", "sleep", "bed", "fire", "inn", "toinn", "church", "tochurch"].includes(p.state)) { p.sit = false; p.asleep = false; p.inside = false; p.state = "idle"; }
  if (p.carry) {
    if (p.carry.to) { const s = S.b.find(b => b.id === p.carry.to); if (s && isSite(s)) { const ws = workSpot(W, s); p.state = "deliver"; p.tx = ws.x; p.ty = ws.y; p.act = "Carrying " + p.carry.type + " to a building site"; return; } p.carry.to = 0; }
    const mill = p.carry.mill && S.b.find(b => b.id === p.carry.mill && b.done);
    const d = mill || nearestDrop(W, p.carry.type, p.x, p.y) || cm; if (d) { const q = doorOf(d); p.state = "toStore"; p.tx = q.x; p.ty = q.y; p.act = "Carrying " + p.carry.amt + " " + p.carry.type + " home"; return; }
  }
  pickJob(W, p, H);
}
const WORK = { wood: 18, stone: 24, berries: 12, fish: 25, scout: .5, rest: 8, construct: 6, sow: 12, harvest: 10, fetch: 1, plant: 10, tend: 22, honey: 16 };
function walk(W, p, spd) {
  const dt = DT, dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
  if (d < .25) return true;
  p.steerT -= dt;
  if (p.steerT <= 0) {
    p.steerT = .5; const base = Math.atan2(dy, dx); let best = -1e9, ba = base;
    for (const off of [-.9, -.45, 0, .45, .9]) {
      const a = base + off, qx = p.x + Math.cos(a) * .9, qy = p.y + Math.sin(a) * .9;
      let sc = Math.cos(off) + (d > 2 ? Math.min(1, wearAt(W, qx, qy)) * .85 : 0); if (wet(qx, qy) && !isRiver(qx, qy) || steep(p.x, p.y, qx, qy)) sc -= 10; else if (isRiver(qx, qy)) sc -= .9; else if (isRoad(qx, qy)) sc += .35;
      const o = occAt(W, qx, qy); if (o && !TYPES[o.type].field && o.type !== "bridge" && d > 2) sc -= 2;
      if (sc > best) { best = sc; ba = a; }
    }
    p.ax = Math.cos(ba); p.ay = Math.sin(ba);
  }
  p.hx += (p.ax - p.hx) * .7; p.hy += (p.ay - p.hy) * .7; const hl = Math.hypot(p.hx, p.hy) || 1;
  const inR = isRiver(p.x, p.y), m = Math.min(d, spd * dt * (inR ? .55 : isRoad(p.x, p.y) ? 1.25 : 1)); p.x += p.hx / hl * m; p.y += p.hy / hl * m; p.moving = true;
  if (inR && W.S.phase === "settled") { const k = okey(p.x, p.y); W.S.wade[k] = (W.S.wade[k] || 0) + 1; }
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
      const near = !["rest", "scout", "construct", "sow", "harvest", "tend"].includes(p.job) && Math.hypot(p.tx - p.x, p.ty - p.y) < .6;
      if (walk(W, p, spd) || near) {
        if (p.job === "fetch") { const s = deref(W, p.obj), k = p.fetchK; if (s && isSite(s) && (s.need[k] || 0) > 0 && S.res[k] > 0) { const n = Math.min(5, s.need[k], S.res[k]); S.res[k] -= n; s.need[k] -= n; p.carry = { type: k, amt: n, to: s.id }; } p.obj = null; p.state = "idle"; p.t = .3; break; }
        p.state = "work"; p.t = WORK[p.job] * (S.hungry ? 1.3 : 1) * (1 - rallyStr(S) * .2);
        p.act = { wood: "Chopping wood", stone: "Breaking stone", berries: "Picking berries", fish: "Fishing", scout: "Looking around", rest: "Resting", construct: "Building", sow: "Plowing and sowing", harvest: "Harvesting", plant: "Planting a young tree", tend: "Milking the sheep", honey: "Collecting honey" }[p.job];
        if (p.job === "rest") p.sit = p.benchSit || rnd(W) < .3;
      }
      if (evening(H) || deepP(p, H)) think(W, p, H);
      break;
    }
    case "work": p.t -= DT; if (p.job === "construct") { const s = deref(W, p.obj); if (s && isSite(s)) { s.prog += DT / TYPES[s.upTo || s.type].time * (1 + rallyStr(S) * .3); if (s.prog >= 1) { if (s.upTo) finishUpgrade(W, s); else finishBuilding(W, s); } } else p.t = 0; }
      if (p.t <= 0) { p.sit = false; finishWork(W, p); } break;
    case "deliver": if (walk(W, p, spd * .9) || Math.hypot(p.tx - p.x, p.ty - p.y) < .7) { const s = S.b.find(b => b.id === p.carry.to); if (!s || !isSite(s)) { S.res[p.carry.type] += p.carry.amt; } p.carry = null; p.state = "idle"; p.t = .3; } break;
    case "toStore": if (walk(W, p, spd * .9)) {
      S.res[p.carry.type] = Math.min(capOf(W), S.res[p.carry.type] + p.carry.amt); W.events.push({ k: "gain", type: p.carry.type, amt: p.carry.amt, x: p.x, y: p.y });
      if (p.carry.mill) { const m = S.b.find(b => b.id === p.carry.mill); if (m) m.grind = S.tick + 480; }
      p.carry = null; p.state = "idle"; p.t = .6 + rnd(W) * 1.5 * (1 - rallyStr(S)); p.act = "Back home";
      if (S.res.wood >= 50) milestone(W, "wood50", "A Fine Woodpile", "Fifty logs stacked up.");
    } break;
    case "fire": case "bed": if (walk(W, p, spd)) { if (p.state === "fire") { p.state = "sit"; p.sit = true; p.act = "Sitting by the fire"; } else { p.state = "sleep"; p.asleep = true; p.act = "Sleeping"; } } if (!evening(H) && !deepP(p, H)) think(W, p, H); else if (p.state === "fire" && deepP(p, H)) think(W, p, H); break;
    case "sit": if (!evening(H) || deepP(p, H)) think(W, p, H); break;
    case "sleep": if (!deepP(p, H)) think(W, p, H); break;
    case "morning": think(W, p, H); break;
    case "toinn": case "tochurch": if (walk(W, p, spd)) { p.inside = true; p.state = p.state === "toinn" ? "inn" : "church"; p.act = p.state === "inn" ? "At the tavern, singing" : "At the Sunday service"; } else if (p.state === "toinn" && (!evening(H) || deepP(p, H))) think(W, p, H); break;
    case "inn": if (!evening(H) || deepP(p, H) || H >= 23.2) { p.inside = false; think(W, p, H); } break;
    case "church": if (H >= 10.6 || H < 9) { p.inside = false; p.state = "idle"; p.t = rnd(W) * 2; } break;
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
  else if (j === "plant" && o && o.felled && !o.cleared) { o.sapling = true; o.regrow = Math.min(o.regrow || 1200, 1200); const ch = W.chunks.get(o._k); if (ch) ch.ovDirty = true; }
  else if (j === "tend" && o) { p.carry = { type: "food", amt: 4 }; o.tend = S.tick + 480; }
  else if (j === "honey" && o) { p.carry = { type: "food", amt: flowerV(o.x + 1, o.y) > .4 || flowerV(o.x + 4, o.y + 4) > .4 ? 5 : 3 }; o.honey = S.tick + 720; }
  else if (j === "harvest" && o && o.stage === 3) { const n = Math.min(3, o.left), mill = S.b.find(b => b.done && b.type === "mill"); o.left -= n; p.carry = mill ? { type: "food", amt: Math.round(n * 1.5), mill: mill.id } : { type: "food", amt: n }; if (o.left <= 0) { o.stage = 0; o.work = 0; W.events.push({ k: "field", b: o }); milestone(W, "harvest", "First Harvest", "The first field is harvested. The Hut and the Windmill are unlocked."); if (o.auto) {} } }
  else if (j === "scout") { p.state = "idle"; p.t = .5; return; }
  p.state = "idle"; p.t = .2;
}
function setOver(W, b, val) {
  const S = W.S; for (let j = 0; j < b.b; j++) for (let i = 0; i < b.a; i++) { const k = (b.x + i) + ":" + (b.y + j); OVER.set(k, val); S.over[k] = val; }
  W.events.push({ k: "over", x0: b.x - 1, y0: b.y - 1, x1: b.x + b.a + 1, y1: b.y + b.b + 1 });
}
function finishUpgrade(W, s) {
  const S = W.S; s.type = s.upTo; s.upTo = null; s.prog = 1; delete s.need;
  addLog(W, "A house was rebuilt into " + an(TYPES[s.type].name) + ".");
  W.events.push({ k: "built", b: s });
}
function finishBuilding(W, s) {
  const S = W.S; s.done = true; s.prog = 1; delete s.need;
  if (s.type === "bridge") { setOver(W, s, { k: "b", z: s.z, d: s.dx ? 1 : 0 }); for (const k in S.wade) delete S.wade[k]; }
  if (s.type === "fill") { setOver(W, s, { k: "f" }); occupy(W, s, false); S.b.splice(S.b.indexOf(s), 1); addLog(W, "New land: the gravel fill is done."); W.events.push({ k: "removed", b: s }); return; }
  if (s.type === "tower") reveal(W, s.x + 1, s.y + 1, TYPES.tower.reveal);
  if (s.type === "fold") for (let i = 0; i < 4; i++) S.sheep.push({ x: s.x + 1 + rnd(W) * 2, y: s.y + 1 + rnd(W) * 2, tx: 0, ty: 0, t: rnd(W) * 3, f: s.id, fx: 1 });
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
  // the busiest paths slowly become gravel roads
  if (S.res.stone >= 100 && !S.b.some(b => isSite(b) && (b.need.stone || 0) > 0)) {
    const cand = [];
    for (let y = Math.floor(c.y - 22); y <= c.y + 22; y++) for (let x = Math.floor(c.x - 22); x <= c.x + 22; x++) {
      const k = x + ":" + y; if (ROAD.has(k) || W.occ.has(k) || wet(x + .5, y + .5)) continue;
      const w = Math.max(wearAt(W, x + .5, y + .5), wearAt(W, x + .25, y + .25), wearAt(W, x + .75, y + .75)); if (w >= 1.0) cand.push([w, k]);
    }
    cand.sort((a, b) => b[0] - a[0]); const got = cand.slice(0, 3).map(q => q[1]);
    if (got.length) { for (const k of got) { ROAD.add(k); S.road.push(k); } S.res.stone -= got.length * 2; W.events.push({ k: "road", tiles: got }); if (!S.ms.road) milestone(W, "road", "First Road", "The busiest path was paved with gravel. Walking is faster on roads."); }
  }
  // wet feet: where villagers wade across the stream most, they build a bridge
  const wk = Object.keys(S.wade); if (wk.length > 300) { const keep = wk.sort((a, b) => S.wade[b] - S.wade[a]).slice(0, 60); const nw = {}; for (const k of keep) nw[k] = S.wade[k]; S.wade = nw; }
  if (!S.b.some(b => b.type === "bridge" && !b.done)) {
    let bk = null, bv = 0; for (const k in S.wade) if (S.wade[k] > bv) { bv = S.wade[k]; bk = k; }
    if (bk && bv >= 600) { const [bx, by] = bk.split(":").map(Number), sp = bridgeSpan(W, bx + .5, by + .5); if (S.b.some(b => b.type === "bridge" && Math.hypot(b.x - bx, b.y - by) < 10)) { S.wade[bk] = 0; sp.err = "near"; } if (!sp.err && S.res.wood >= sp.len * 2) { addBuilding(W, "bridge", sp.x, sp.y, "ai", sp); addLog(W, "Tired of wet feet, the villagers started a bridge over the stream."); S.wade = {}; return; } else S.wade[bk] = 0; }
  }
  if (S.b.filter(b => isSite(b) && b.by === "ai").length >= 1) return;
  // a pit house is rebuilt into a hut when there is stone
  if (S.ms.harvest && bedsTotal(W) - n <= 1 && S.res.wood >= 20 && S.res.stone >= 4) {
    const pit = S.b.find(b => b.type === "pit" && b.done && !b.upTo);
    if (pit) { occupy(W, pit, false); const ox = pit.x, oy = pit.y, err = canPlace(W, "hut", ox, oy, false); if (!err) { pit.upTo = "hut"; pit.prog = 0; pit.need = { ...TYPES.hut.cost }; pit.a = 3; pit.b = 3; occupy(W, pit, true); addLog(W, "The villagers are rebuilding a Pit House into a Hut."); W.events.push({ k: "build", b: pit }); return; } occupy(W, pit, true); }
  }
  const afford = t => { const k = TYPES[t].cost; return (S.res.wood >= (k.wood || 0) * .6) && (S.res.stone >= (k.stone || 0) * .6); };
  const free = bedsTotal(W) - n, L = [];
  const near = (list, ok) => { const t = pickNear(W, c.x, c.y, 30, list, ok, 1); return t ? t.o : null; };
  if (free <= 1) L.push([S.ms.pop15 && S.res.stone >= 12 ? "longhouse" : S.ms.harvest && S.res.stone >= 3 ? "hut" : "pit", c, 5, 20]);
  if (!has("field") && n >= 5) L.push(["field", c, 6, 18]);
  if (!has("wcut")) { const t = near("trees", o => !o.felled); if (t) L.push(["wcut", t, 2, 9]); }
  if (!has("forage") && n >= 6) { const t = near("bushes", o => !o.gone); if (t) L.push(["forage", t, 2, 9]); }
  if (!has("fisher") && n >= 6) { const t = near("shore", () => true); if (t) L.push(["fisher", t, 1, 7]); }
  if (n >= 7 && !has("store")) L.push(["store", c, 7, 18]);
  if (S.ms.pop7 && !has("quarry")) { const t = near("rocks", o => o.stone > 0); if (t) L.push(["quarry", t, 2, 8]); }
  if (S.ms.pop10 && !has("well")) L.push(["well", c, 3, 9]);
  if (S.ms.harvest && n >= 8 && !has("mill") && has("field")) { const f = S.b.find(b => b.type === "field"); L.push(["mill", center(f), 4, 12]); }
  if (n >= 8 && !has("tower")) { let bestA = 0, bestH = -1; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; let h = 0; for (let r = 14; r < 30; r += 4) if (hidden(W, c.x + Math.cos(a) * r, c.y + Math.sin(a) * r)) h++; if (h > bestH) { bestH = h; bestA = a; } } L.push(["tower", { x: c.x + Math.cos(bestA) * 12, y: c.y + Math.sin(bestA) * 12 }, 0, 8]); }
  if (S.ms.pop8 && !has("fold")) L.push(["fold", c, 8, 22]);
  if (S.ms.flowers && !has("apiary")) { let fp = null; for (let r = 4; r < 30 && !fp; r += 2) for (let a = 0; a < 6.28; a += .4) { const x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r; if (flowerV(x, y) > .5 && !hidden(W, x, y)) { fp = { x, y }; break; } } if (fp) L.push(["apiary", fp, 0, 6]); }
  if (S.ms.pop10 && !has("tavern")) L.push(["tavern", c, 5, 16]);
  if (S.ms.pop12 && !has("chapel")) L.push(["chapel", c, 7, 20]);
  if (cnt("field") * 5 < n - 2) L.push(["field", c, 6, 24]);
  for (const [want, anchor, r0, r1] of L) {
    if (!afford(want)) continue;
    const site = findSite(W, want, anchor.x, anchor.y, r0, r1); if (!site) continue;
    addBuilding(W, want, site.x, site.y, "ai");
    addLog(W, "The villagers started building " + an(TYPES[want].name) + ".");
    return;
  }
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
        for (const t of ch.trees) if (t.felled && !t.cleared && t.regrow > 0) { t.regrow -= 5; if (t.regrow <= 0) { t.felled = false; t.sapling = false; t.logs = 3; ch.ovDirty = true; } }
        for (const b of ch.bushes) if (b.regrow > 0) { b.regrow -= 5; if (b.regrow <= 0) b.berries = 3; }
      }
      // fields grow (not in winter)
      for (const f of S.b) if (f.done && f.type === "field" && (f.stage === 1 || f.stage === 2)) {
        f.grow += sea === "winter" ? 0 : sea === "autumn" ? 3.5 : 5; const st = f.grow >= 5000 ? 3 : f.grow >= 2000 ? 2 : 1;
        if (st !== f.stage) { f.stage = st; if (st === 3) { f.left = CROPS[f.crop].yield; } W.events.push({ k: "field", b: f }); }
      }
    }
    S.eatT += DT; if (S.eatT > 300) { S.eatT = 0; const need = S.people.filter(p => !p.asleep).length; if (S.res.food >= need) { S.res.food -= need; S.hungry = false; } else { S.res.food = 0; if (!S.hungry) addLog(W, "Food is running low. Everyone works a little slower."); S.hungry = true; } }
    if (S.rally) { S.rally.t += DT; if (S.rally.t > 120) { addLog(W, "The rally is over. Everyone goes back to their own work."); S.rally = null; } }
    S.roleT -= DT; if (S.roleT <= 0) { S.roleT = 20; assignRoles(W); }
    S.planT -= DT; if (S.planT <= 0) { S.planT = 150; plan(W); }
    // newcomers
    S.arriveT -= DT;
    if (S.arriveT <= 0) {
      S.arriveT = 60; const n = S.people.length;
      if (bedsTotal(W) > n && S.res.food >= 12 + n * 2 && !night(H)) {
        const e = W.trail.find(q => !hidden(W, q.x, q.y)) || { x: 0, y: 0 }, p = newPerson(W, e.x, e.y), cm = camp(W), c = cm ? doorOf(cm) : { x: 0, y: 0 };
        p.state = "arrive"; p.tx = c.x; p.ty = c.y; p.act = "Arriving in the village"; p.home = homeFor(W); p.role = "wood";
        S.people.push(p); S.arriveT = 900 + n * 240;
        addLog(W, p.name + " (" + p.trait + ") arrived and wants to live here.");
        W.events.push({ k: "arrive", p });
        if (S.people.length >= 7) milestone(W, "pop7", "Seven Souls", "The village grows. The Quarry is unlocked.");
        if (S.people.length >= 8) milestone(W, "pop8", "Eight Villagers", "Enough hands for a shepherd. The Sheepfold is unlocked.");
        if (S.people.length >= 10) milestone(W, "pop10", "Ten Villagers", "A real village now. The Well and the Tavern are unlocked.");
        if (S.people.length >= 12) milestone(W, "pop12", "Twelve Villagers", "Time for a bell. The Chapel is unlocked.");
        if (S.people.length >= 15) milestone(W, "pop15", "Fifteen Villagers", "The village needs a great hall. The Longhouse is unlocked.");
      }
    }
    if (!S.ms.tarn && S.tick % 40 === 0) for (const ch of W.chunks.values()) if (ch.shore.some(s => !hidden(W, s.x, s.y))) { milestone(W, "tarn", "Found the Water", "Clear water nearby. Fish!"); break; }
  }
  for (const p of S.people) updatePerson(W, p, H);
  if (S.dog) updateDog(W, H);
  if (S.sheep.length) for (const sh of S.sheep) {
    const f = S.b.find(b => b.id === sh.f); if (!f) continue; sh.moving = false;
    if (night(H)) continue;
    if (sh.t > 0) { sh.t -= DT; continue; }
    if (!sh.tx) { sh.tx = f.x + .6 + rnd(W) * (f.a - 1.2); sh.ty = f.y + .6 + rnd(W) * (f.b - 1.2); }
    const dx = sh.tx - sh.x, dy = sh.ty - sh.y, L = Math.hypot(dx, dy);
    if (L < .1) { sh.tx = 0; sh.t = 2 + rnd(W) * 7; continue; }
    const m = Math.min(L, .3 * DT); sh.x += dx / L * m; sh.y += dy / L * m; sh.fx = dx - dy >= 0 ? 1 : -1; sh.moving = true;
  }
  if (S.phase === "settled") {
    const chap = S.b.find(b => b.done && b.type === "chapel");
    if (chap) { const prev = clockOf(S, S.tick - 1).hour; if ((prev < 18 && H >= 18) || (clockOf(S).wd === 0 && prev < 9.5 && H >= 9.5)) W.events.push({ k: "bell", b: chap }); }
    if (!S.ms.flowers && S.tick % 40 === 0 && S.people.some(p => flowerV(p.x, p.y) > .45)) milestone(W, "flowers", "Flower Meadow", "The villagers found a meadow full of flowers. The Apiary is unlocked.");
  }
}
// ---------- Dunčo, the village dog ----------
function updateDog(W, H) {
  const S = W.S, d = S.dog, ow = S.people.find(p => p.id === d.owner) || S.people[0]; if (!ow) return;
  d.moving = false;
  const step = (spd) => { const dx = d.tx - d.x, dy = d.ty - d.y, L = Math.hypot(dx, dy); if (L < .15) return true; const m = Math.min(L, spd * DT), nx = d.x + dx / L * m, ny = d.y + dy / L * m; if ((wet(nx, ny) && !isRiver(nx, ny)) || steep(d.x, d.y, nx, ny)) { d.t = 0; d.tx = d.x; d.ty = d.y; return true; } d.x = nx; d.y = ny; d.fx = dx >= -dy ? 1 : -1; d.moving = true; return false; };
  if (ow.asleep || S.phase !== "settled" && ow.state === "follow") {
    if (ow.asleep) { const cm = camp(W); const c = cm ? doorOf(cm) : { x: S.wagon.x, y: S.wagon.y + 1 }; d.tx = c.x + .8; d.ty = c.y + .3; d.sleep = step(1.2); return; }
  }
  d.sleep = false;
  const far = Math.hypot(ow.x - d.x, ow.y - d.y);
  if (far > 3.2) { d.tx = ow.x + .6; d.ty = ow.y + .4; step(far > 8 ? 2.6 : 1.9); d.mode = "run"; return; }
  d.t -= DT;
  if (d.t <= 0) { const a = rnd(W) * 6.3, r = .8 + rnd(W) * 1.8; d.tx = ow.x + Math.cos(a) * r; d.ty = ow.y + Math.sin(a) * r; d.t = 1.5 + rnd(W) * 5; d.mode = rnd(W) < .3 ? "sniff" : "trot"; }
  step(d.mode === "sniff" ? .5 : 1.3);
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
  if (lakeV(x, y) > .6 || riverD(x, y) < 3) return "Too close to the water.";
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (steep(x + i, y + j, x + i + 1, y + j) || steep(x + i, y + j, x + i, y + j + 1)) return "Too steep. Pick flatter ground.";
  return null;
}
const blocked = (x, y, x2, y2) => lakeV(x2, y2) > .62 || steep(x, y, x2, y2);
function routeTo(a, b) {
  const pts = [a], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
  let wet = -1; for (let t = .3 / L; t <= 1; t += .3 / L) if (blocked(a.x + dx * (t - .3 / L), a.y + dy * (t - .3 / L), a.x + dx * t, a.y + dy * t)) { wet = t; break; }
  if (wet >= 0) { const nx = -dy / L, ny = dx / L; for (let o = 3; o < 40; o += 1.5) { let okp = null; for (const sg of [1, -1]) { const w = { x: a.x + dx * .5 + nx * o * sg, y: a.y + dy * .5 + ny * o * sg }; let dry = true; for (const [p, q] of [[a, w], [w, b]]) { const l = Math.hypot(q.x - p.x, q.y - p.y); for (let t = .3 / l; t <= 1; t += .3 / l) if (blocked(p.x + (q.x - p.x) * (t - .3 / l), p.y + (q.y - p.y) * (t - .3 / l), p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t)) { dry = false; break; } } if (dry) { okp = w; break; } } if (okp) { pts.push(okp); break; } } }
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
    const sh = planShape(W, a.type, a.x, a.y, true); if (sh.err) return sh.err;
    addBuilding(W, a.type, sh.x, sh.y, "mayor", sh); addLog(W, "The Mayor ordered " + an(TYPES[a.type].name) + "."); S.roleT = 0; S.rev++; return null;
  }
  if (a.k === "cancel") {
    const b = S.b.find(q => q.id === a.id); if (!b || b.done || b.type === "camp") return "Can't cancel that.";
    const T = TYPES[b.type];
    const c0 = b.cost0 || TYPES[b.type].cost; for (const k in c0) S.res[k] += (c0[k] - (b.need[k] || 0));
    occupy(W, b, false); S.b.splice(S.b.indexOf(b), 1); for (const p of S.people) if (p.obj && p.obj.b === b.id) { p.obj = null; p.state = "idle"; p.t = .5; }
    addLog(W, "The Mayor cancelled " + an(T.name) + "."); W.events.push({ k: "removed", b }); S.rev++; return null;
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
