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
const EMPTY_LAND = new Map();
const LOGS_OF = { willow: 2, birch: 2, dwarf: 1 }; // logs a full-grown tree gives, by kind (everything else gives 3)
let OVER = new Map(), ROAD = new Map(), ACTIVE = null; // ROAD: tile -> 1 gravel, 2 cobbled main road
export const okey = (x, y) => Math.floor(x) + ":" + Math.floor(y);
export const overAt = (x, y) => OVER.size ? OVER.get(okey(x, y)) : undefined;
export const isRoad = (x, y) => ROAD.size > 0 ? (ROAD.get(okey(x, y)) || 0) : 0;
// ---------- islands (only far out in the deep sea) ----------
const ISL = 48; let ISLC = new Map(), ISLX = -1;
function islandOf(cx, cy) {
  if (ISLX !== SX) { ISLC = new Map(); ISLX = SX; }
  const key = (cx + 5000) * 10007 + (cy + 5000); let r = ISLC.get(key); if (r !== undefined) return r;
  r = null; const h = k => ih(cx * 7919 + k * 31 + SX, cy * 6577 + k * 17 + SY);
  if (h(1) < .45) {
    const rad = 8 + h(2) * 6, x = cx * ISL + rad + 3 + h(3) * (ISL - 2 * rad - 6), y = cy * ISL + rad + 3 + h(4) * (ISL - 2 * rad - 6);
    let ok = Math.hypot(x, y) > 70 && baseElev(x, y) < SEA - .12;
    for (let a = 0; a < 8 && ok; a++) if (baseElev(x + Math.cos(a * .785) * rad * 1.5, y + Math.sin(a * .785) * rad * 1.5) > SEA - .05) ok = false;
    if (ok) r = { x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2, r: rad };
  }
  ISLC.set(key, r); if (ISLC.size > 4000) ISLC = new Map(); return r;
}
export const islandIn = islandOf;
export function elev(x, y) {
  const e = baseElev(x, y);
  if (e < SEA - .03 && x * x + y * y > 4900) {
    const I = islandOf(Math.floor(x / ISL), Math.floor(y / ISL));
    if (I) { const d = Math.hypot(x - I.x, y - I.y) / (I.r * (1 + (vn(x + 400, y - 90, 6) - .5) * .5)); if (d < 1) { const t = clamp((1 - d) / .5, 0, 1), ei = SEA - .03 + .11 * t * t * (3 - 2 * t); if (ei > e) return ei; } }
  }
  return e;
}
// desert: sand dunes on far, low land
export function desertV(x, y) {
  if (x * x + y * y < 4900) return -1; const n = vn(x - 6100, y + 2300, 55) - .5; if (n <= 0) return n;
  const e = baseElev(x, y); return e < SEA + .035 || e > SEA + .3 ? -1 : n;
}
// swamp: low wet ground near the water, far from the start
export function swampV(x, y) {
  if (x * x + y * y < 6400) return -1; const n = vn(x + 2100, y - 7300, 30) - .5; if (n <= -.18) return -1;
  if (desertV(x, y) > 0) return -1; const e = baseElev(x, y); return e < SEA + .008 || e > SEA + .14 ? -1 : n + .12;
}
// frozen tundra: permanent snow, more of it towards the highlands
export function tundraV(x, y) {
  if (x * x + y * y < 10000) return -1; const hl = clamp((-(x * DX + y * DY) - 40) / 400, 0, .06), n = vn(x - 3300, y + 5500, 52) - .5 + hl; if (n <= .2) return -1;
  if (desertV(x, y) > 0 || swampV(x, y) > 0) return -1; return baseElev(x, y) < SEA + .02 ? -1 : n;
}
// golden grove: maples and larches in autumn colours
export function groveV(x, y) {
  if (x * x + y * y < 6400) return -1; const n = vn(x + 5300, y + 1900, 26) - .5; if (n <= -.02) return -1;
  if (desertV(x, y) > 0 || swampV(x, y) > 0 || tundraV(x, y) > 0) return -1; const e = baseElev(x, y); return e < SEA + .03 || e > SEA + .45 ? -1 : n + .1;
}
// World version 2 (new worlds): a wide land with seas, lakes, highlands and plains in all directions, so that villages can lie
// hundreds of steps apart. Worlds saved before that (gv missing) keep the old coast-and-mountains terrain.
let GVN = 0;
function baseElev(x, y) {
  if (GVN >= 2) {
    const d = x * DX + y * DY;
    let e = vn(x + 3000, y - 1000, 48) * .30 + vn(x, y, 14) * .17 + vn(x + 77, y + 33, 5) * .09 + vn(x - 2500, y + 6100, 150) * .22 + vn(x + 9000, y - 4000, 430) * .22;
    e = .535 + (e - .5) * 1.4;                                   // wider spread: real seas and real mountains
    e += -clamp((d - 70) * .0035, 0, .32);                      // a sea in front of the valley, far away
    const rg = 1 - Math.abs(vn(x - 7700, y + 1300, 210) * 2 - 1); e += Math.pow(rg, 3) * .36 * clamp((vn(x + 400, y - 5200, 380) - .3) * 3, 0, 1); // mountain ranges
    const w = clamp(1 - Math.hypot(x, y) / 20, 0, 1), ws = w * w * (3 - 2 * w);
    return e * (1 - ws) + (SEA + .052) * ws;
  }
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
// open glades in the woods (new worlds only, so that old saves keep their trees)
export const gladeV = (x, y) => Math.max(0, vn(x - 5200, y + 2300, 22) - .7) * 3;
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
  camp:   { name: "Wagon Camp", a: 3, b: 3, cost: {}, beds: 5, drop: ["wood", "stone", "food"], time: 0, hall: true, d: "A tent by the wagon. The first home of the village." },
  outpost: { name: "Pioneer Camp", a: 3, b: 3, cost: {}, beds: 4, drop: ["wood", "stone", "food"], time: 0, hall: true, d: "Pioneers pitched a tent and lit a fire here. The heart of a new settlement." },
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
  harbor: { name: "Harbour", a: 3, b: 2, cost: { wood: 90, stone: 15 }, time: 1500, sea: true, d: "A boat shed and a pier. Sailors explore the sea, the islands and the far coasts, and fish on the way.", unlock: "pop10" },
  apiary: { name: "Apiary", a: 2, b: 1, cost: { wood: 20 }, time: 400, d: "Straw beehives. Near flowers they give more honey.", unlock: "flowers" },
};
export const BUILD_MENU = ["pit", "hut", "longhouse", "store", "wcut", "forage", "fisher", "harbor", "quarry", "field", "mill", "fold", "apiary", "well", "tavern", "chapel", "tower", "bridge", "fill", "torch", "bench"];
export const UNLOCK_TEXT = { harvest: "Unlocks after the first harvest", pop7: "Unlocks at 7 villagers", pop8: "Unlocks at 8 villagers", pop10: "Unlocks at 10 villagers", pop12: "Unlocks at 12 villagers", pop15: "Unlocks at 15 villagers", path: "Unlocks with the first footpath", flowers: "Unlocks when the villagers find a flower meadow" };
export const CROPS = { wheat: { name: "Wheat", yield: 30 }, barley: { name: "Barley", yield: 28 }, cabbage: { name: "Cabbage", yield: 34 }, flax: { name: "Flax", yield: 24 } };
const NAMES = ["Branko", "Dusa", "Milan", "Olga", "Ratibor", "Svetla", "Zdeno", "Kveta", "Bohuslav", "Lubica", "Ctibor", "Milica", "Bohdan", "Mila", "Radko", "Vesna", "Dobroslav", "Luba", "Stano", "Zora", "Jarek", "Dana", "Ivo", "Hela", "Miro", "Nada", "Tomas", "Rada", "Vlk", "Bela", "Ondro", "Lada", "Kubo", "Sona", "Pavol", "Jela"];
export const TOWN_NAMES = ["Lipovec", "Horka", "Brezina", "Potocik", "Kamenec", "Lucka", "Jedlove", "Vrsok", "Brod", "Medovec", "Sosnina", "Javorina", "Studnicka", "Dubina", "Skalka", "Rybnik", "Vresina", "Machnac"];
const TRAITS = ["early riser", "storyteller", "stubborn", "dreamer", "hard worker", "gossip", "careful", "cheerful", "night owl", "quiet", "curious", "grumpy but kind"];
// ---------- world runtime ----------
// W = { S: serializable state, chunks: Map, occ: Map, ... }
export function createWorld(seed, t0) {
  const S = {
    v: 1, gv: 2, seed, tick: 0, t0, tz: "Europe/Bratislava", rng: (seed ^ 0x9e3779b9) >>> 0, rev: 0,
    phase: "choose", res: { food: 20, wood: 10, stone: 0 }, ms: {}, log: [], people: [], b: [], nextId: 1,
    wagon: null, ox: null, rally: null, hungry: false, eatT: 0, planT: 40, roleT: 0, arriveT: 120, weather: { kind: "clear", temp: null, at: 0 },
    chunks: {}, over: {}, road: [], road2: [], wade: {}, sheep: [], towns: [], exp: null, wonders: [], trek: null, rumor: null, trekT: 0, boats: [], boatT: 0, treasures: [], scrollDone: false, price: { food: 1, wood: 1, stone: 1 }, trade: { n: 0, coins: 0, tax: 0, vol: { food: 0, wood: 0, stone: 0 } }, pact: {}, marketT: 60, tradeT: 120,
  };
  S.re = pickStart(seed);
  const R = mkRng(seed + 7);
  // the old cart track the wagon came along (set before the world is wrapped, so the very first chunks are made exactly as they will be after every reload)
  const sa = mkRng(seed + 11)() * Math.PI * 2, ang = sa + Math.PI / 2 * (R() < .5 ? 1 : -1) + (R() - .5) * .5, ex = Math.cos(ang) * 46, ey = Math.sin(ang) * 46;
  S.entry = { x: ex, y: ey };
  const W = wrap(S);
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
// The wagon always starts at the middle of the map, so a new world slides the terrain until the start is solid, dry, flat ground
// where the settlers can actually settle (about 1 seed in 14 used to start on a beach). Old saves keep their terrain (S.re is missing).
function startSpots(seed, re) {
  GVN = 2; SX = ((mkRng(seed)() * 20000) | 0) + re * 7919; SY = ((mkRng(seed + 1)() * 20000) | 0) + re * 6577;
  const sa = mkRng(seed + 11)() * Math.PI * 2; DX = Math.cos(sa); DY = Math.sin(sa); OVER = new Map(); ISLC = new Map();
  let n = 0;
  for (let y = -12; y <= 12; y += 2) for (let x = -12; x <= 12; x += 2) {
    if (Math.hypot(x, y) > 12.5 || lakeV(x, y) > .6 || riverD(x, y) < 3) continue;
    let flat = true; for (let j = -2; j <= 2 && flat; j++) for (let i = -2; i <= 2; i++) if (steep(x + i, y + j, x + i + 1, y + j) || steep(x + i, y + j, x + i, y + j + 1)) { flat = false; break; }
    if (flat) n++;
  }
  return n;
}
function pickStart(seed) { let best = 0, bn = -1; for (let re = 0; re < 40; re++) { const n = startSpots(seed, re); if (n >= 25) return re; if (n > bn) { bn = n; best = re; } } return best; }
export function wrap(S) {
  GVN = S.gv || 0; SX = ((mkRng(S.seed)() * 20000) | 0) + (S.re || 0) * 7919; SY = ((mkRng(S.seed + 1)() * 20000) | 0) + (S.re || 0) * 6577;
  const sa = mkRng(S.seed + 11)() * Math.PI * 2; DX = Math.cos(sa); DY = Math.sin(sa);
  const W = { S, chunks: new Map(), occ: new Map(), events: [], trail: [], dirtyGround: [], dirtyFog: [], newChunks: [], rt: new Map(), unr: new Map() };
  // trail from the entry point to the start clearing
  const R = mkRng(S.seed + 3), ex = S.entry ? S.entry.x : 0, ey = S.entry ? S.entry.y : 0;
  if (S.entry) { const L = Math.hypot(ex, ey), nx = ey / L, ny = -ex / L; for (let t = 0; t <= 1; t += .4 / L) { const o = Math.sin(t * Math.PI) * Math.sin(t * 7 + S.seed % 7) * 2.4; W.trail.push({ x: ex * (1 - t) + nx * o, y: ey * (1 - t) + ny * o }); } }
  // rebuild occupancy and the changed land
  W.over = OVER = new Map(); W.road = ROAD = new Map(); W.sx = SX; W.sy = SY; W.gvn = GVN; W.dx = DX; W.dy = DY; ACTIVE = W; S.wonders = S.wonders || []; S.boats = S.boats || []; S.boatT = S.boatT || 0; S.treasures = S.treasures || []; S.price = S.price || { food: 1, wood: 1, stone: 1 }; S.trade = S.trade || { n: 0, coins: 0, tax: 0, vol: { food: 0, wood: 0, stone: 0 } }; S.pact = S.pact || {}; S.marketT = S.marketT || 60; S.tradeT = S.tradeT || 120; S.over = S.over || {}; S.road = S.road || []; S.road2 = S.road2 || []; S.wade = S.wade || {}; S.sheep = S.sheep || [];
  for (const k in S.over) OVER.set(k, S.over[k]); for (const k of S.road) ROAD.set(k, 1); for (const k of S.road2) ROAD.set(k, 2); if (!S.rv) { S.rv = 1; thinRoads(S); }
  // settlements (older saves had only the first village)
  if (!S.towns) { S.towns = []; const cm = S.b.find(b => b.type === "camp"); if (cm) S.towns.push({ id: 1, name: TOWN_NAMES[S.seed % TOWN_NAMES.length], hall: cm.id, x: cm.x + 1.5, y: cm.y + 1.5, at: 0 }); }
  for (const b of S.b) if (!b.town && S.towns.length) b.town = townAt(S, b.x + b.a / 2, b.y + b.b / 2).id;
  for (const b of S.b) occupy(W, b, true);
  if (!S.dog && S.people.length) S.dog = { x: S.people[0].x + 1, y: S.people[0].y, tx: S.people[0].x, ty: S.people[0].y, t: 1, owner: S.people[0].id, name: "Dunčo", fx: 1 };
  return W;
}
// ---------- chunks ----------
export const ckey = (cx, cy) => cx + "," + cy;
export function chunkAt(W, x, y, create) { const cx = Math.floor(x / C), cy = Math.floor(y / C); return getChunk(W, cx, cy, create); }
export function getChunk(W, cx, cy, create) {
  const k = ckey(cx, cy); let ch = W.chunks.get(k);
  if (!ch && create) { const keep = OVER; OVER = EMPTY_LAND; try { ch = genChunk(W, cx, cy); } finally { OVER = keep; } W.chunks.set(k, ch); W.newChunks.push(ch); } // a chunk is made from the bare land only, never from what villagers built, so it is the same whenever it is made
  return ch;
}
function genChunk(W, cx, cy) {
  const S = W.S, GV = S.gv || 0, ch = { cx, cy, k: ckey(cx, cy), x0: cx * C, y0: cy * C, trees: [], rocks: [], bushes: [], shore: [], wear: new Uint16Array(C4 * C4), fog: new Uint8Array(C * C).fill(1) };
  const trail = W.trail.filter(p => p.x > ch.x0 - 2 && p.x < ch.x0 + C + 2 && p.y > ch.y0 - 2 && p.y < ch.y0 + C + 2);
  const wl = []; for (let ry = Math.floor((ch.y0 - 8) / RG); ry <= Math.floor((ch.y0 + C + 8) / RG); ry++) for (let rx = Math.floor((ch.x0 - 8) / RG); rx <= Math.floor((ch.x0 + C + 8) / RG); rx++) { const w = wonderIn(W, rx, ry); if (w) wl.push({ x: w.x, y: w.y, cr: WONDERS[w.k].cr || 4 }); }
  const nearTrail = (x, y, r) => trail.some(p => Math.abs(p.x - x) < r && Math.abs(p.y - y) < r && Math.hypot(p.x - x, p.y - y) < r);
  for (let y = ch.y0 + .4; y < ch.y0 + C; y += .75) for (let x = ch.x0 + .4; x < ch.x0 + C; x += .75) {
    const jx = x + (ih(Math.floor(x * 9) + SX, Math.floor(y * 7)) - .5) * .7, jy = y + (ih(Math.floor(x * 5), Math.floor(y * 3) + SY) - .5) * .7;
    if (jx < ch.x0 || jy < ch.y0 || jx >= ch.x0 + C || jy >= ch.y0 + C) continue;
    if (lakeV(jx, jy) > .62 || nearTrail(jx, jy, 1.2) || Math.hypot(jx, jy) < 4.5) continue;
    if (wl.some(w => Math.hypot(w.x - jx, w.y - jy) < w.cr)) continue;
    if (desertV(jx, jy) > 0) { const r0 = ih(Math.floor(jx * 13) + SX, Math.floor(jy * 11) + SY); if (r0 > .993 && !steep(jx - .3, jy - .3, jx + .3, jy + .3)) ch.rocks.push({ x: jx, y: jy, v: r0, big: false, stone: 2 }); continue; }
    const r = ih(Math.floor(jx * 13) + SX, Math.floor(jy * 11) + SY), v = ih(Math.floor(x * 3) + SY, Math.floor(y * 3)), hz = heightAt(jx, jy), fd = fdV(jx, jy) - (hz > 30 ? (hz - 30) * .03 : 0), rk = rockV(jx, jy) + (hz > 24 ? (hz - 24) * .006 : 0);
    if (steep(jx - .3, jy - .3, jx + .3, jy + .3) || steep(jx + .3, jy - .3, jx - .3, jy + .3)) continue;
    if (rk > .72 && !(swampV(jx, jy) > 0)) { if (r < .14) ch.rocks.push({ x: jx, y: jy, v, big: r < .08, stone: r < .08 ? 6 : 2 }); continue; }
    if (riverD(jx, jy) < riverW(jx, jy) + .8) continue;
    if (swampV(jx, jy) > 0) { // swamp: bog willows, reeds with cranberries, a few stones
      if (r < .08) ch.trees.push({ x: jx, y: jy, t: "willow", s: .85 + ih(Math.floor(x), Math.floor(y)) * .45, v, logs: 2, felled: false, regrow: 0, cleared: false });
      else if (r < .19) ch.bushes.push({ x: jx, y: jy, v, berries: 3, regrow: 0, bog: true });
      else if (r > .992) ch.rocks.push({ x: jx, y: jy, v, big: false, stone: 2 });
      continue;
    }
    if (tundraV(jx, jy) > 0) { // frozen tundra: lone frost spruces and stones
      if (r < .045) ch.trees.push({ x: jx, y: jy, t: "fspruce", s: .8 + ih(Math.floor(x), Math.floor(y)) * .5, v, logs: 3, felled: false, regrow: 0, cleared: false });
      else if (r > .993) ch.rocks.push({ x: jx, y: jy, v, big: false, stone: 2 });
      continue;
    }
    if (groveV(jx, jy) > 0 && hz < 30) { // golden grove: maples and larches, boletes underneath
      const gv = groveV(jx, jy);
      if (r < .16 + gv * .25) ch.trees.push({ x: jx, y: jy, t: r < .12 ? "larch" : "maple", s: .85 + ih(Math.floor(x), Math.floor(y)) * .5, v, logs: 3, felled: false, regrow: 0, cleared: false });
      else if (r > .955) ch.bushes.push({ x: jx, y: jy, v, berries: 3, regrow: 0, mush: true });
      continue;
    }
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
    if (GV >= 2 && gladeV(jx, jy) > 0 && hz < 26) { // an open glade in the woods: room for people and houses (berries at the edge, a lone old oak)
      if (r > .93 && gladeV(jx, jy) < .5) ch.bushes.push({ x: jx, y: jy, v, berries: 3, regrow: 0 });
      else if (r < .004) ch.trees.push({ x: jx, y: jy, t: "oak", s: 1.15, v, logs: 3, felled: false, regrow: 0, cleared: false });
      continue;
    }
    if (flowerV(jx, jy) > .45 && hz < 15) { if (r < .006) ch.trees.push({ x: jx, y: jy, t: "oak", s: 1.1, v, logs: 3, felled: false, regrow: 0, cleared: false }); continue; }
    if (fd > .62 && r < .55) ch.trees.push({ x: jx, y: jy, t: r < .34 ? "spruce" : "spruceS", s: .8 + ih(Math.floor(x), Math.floor(y)) * .6, v, logs: 3, felled: false, regrow: 0, cleared: false });
    else if (fd > .52 && r < .1 && hz < 26) ch.trees.push({ x: jx, y: jy, t: "oak", s: .9 + ih(Math.floor(x), Math.floor(y)) * .4, v, logs: 3, felled: false, regrow: 0, cleared: false });
    else if (fd < .52 && r < .014 && hz < 26) ch.trees.push({ x: jx, y: jy, t: r < .007 ? "birch" : "oak", s: .8 + ih(Math.floor(x), Math.floor(y)) * .4, v, logs: 3, felled: false, regrow: 0, cleared: false });
    else if (r > .994) ch.rocks.push({ x: jx, y: jy, v, big: false, stone: 2 });
    else if (r > .972 && fd > .38 && fd < .75) ch.bushes.push({ x: jx, y: jy, v, berries: 3, regrow: 0 });
  }
  ch.nb = ch.trees.length; ch.trees.forEach((t, i) => { t.i = i; t._k = ch.k; }); ch.rocks.forEach((t, i) => { t.i = i; t._k = ch.k; }); ch.bushes.forEach((t, i) => { t.i = i; t._k = ch.k; });
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
    const sx = Math.floor(gx) + i, sy = Math.floor(gy) + j, d = Math.hypot(sx + .5 - gx, sy + .5 - gy) / 4, v = 1 - d / .4; if (v <= 0) continue;
    const ch = getChunk(W, Math.floor(sx / C4), Math.floor(sy / C4), true), li = sx - ch.cx * C4, lj = sy - ch.cy * C4, k = lj * C4 + li;
    const o = ch.wear[k] / WK, n = Math.min(1.4, o + amt * v); ch.wear[k] = Math.round(n * WK); ch.worn = true;
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
const QUART = [[.2, .2], [.8, .2], [.2, .8], [.8, .8]];
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
    if (!T.deco && !T.water && !T.sea) for (const [ox, oy] of QUART) if (isWater(i + ox, j + oy) || lakeV(i + ox, j + oy) > .64) return "Too wet to build here.";
    if (steep(i, j, i + 1, j) || steep(i, j, i, j + 1) || steep(i, j, i + 1, j + 1)) return "Too steep to build here.";
    if (riverD(i + .5, j + .5) < riverW(i + .5, j + .5) + .6) return "That is the stream.";
    const ch = chunkAt(W, i, j, false); if (ch && ch.rocks.some(r => r.stone > 0 && r.x >= i && r.x < i + 1 && r.y >= j && r.y < j + 1)) return "Rocks are in the way.";
  }
  // a house never stands on a thin strip of land: the ring around it must be dry too (the fisher and the harbour live on the shore)
  if (!T.deco && !T.water && !T.sea) { let wetRing = 0, ring = 0; for (let j = y - 1; j <= y + T.b; j++) for (let i = x - 1; i <= x + T.a; i++) { if (i >= x && i < x + T.a && j >= y && j < y + T.b) continue; ring++; if (isWater(i + .5, j + .5)) wetRing++; } if (wetRing > ring * .34) return "Too close to the water."; }
  if (T.rocks) { let ok = heightAt(x + 1, y + 1) > 18; for (let cy = Math.floor((y - 5) / C); cy <= Math.floor((y + 7) / C) && !ok; cy++) for (let cx = Math.floor((x - 5) / C); cx <= Math.floor((x + 7) / C) && !ok; cx++) { const ch = getChunk(W, cx, cy, false); if (ch && ch.rocks.some(r => r.stone > 0 && Math.abs(r.x - x - 1) < 6 && Math.abs(r.y - y - 1) < 6)) ok = true; } if (!ok) return "A quarry needs rock: next to stones or up in the mountains."; }
  if (T.sea) {
    const hd = harborDir(x, y, T.a, T.b), msg = "A harbour needs open sea in front of it. A pond or a narrow stream is too small.";
    if (!hd) return msg;
    const dk = dockOf({ x, y, a: T.a, b: T.b, pdx: hd.dx, pdy: hd.dy, ppk: hd.pk }); if (seaBFS(W, dk, 44).list.length < 90) return msg;
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
  const b = { id: S.nextId++, type, x, y, a, b: bb, done: T.time === 0, prog: 0, need, cost0: { ...need }, by, at: S.tick, town: S.towns && S.towns.length ? townAt(S, x + a / 2, y + bb / 2).id : 1 };
  if (type === "bridge") { b.z = sh.z; b.dx = sh.dx; }
  if (type === "harbor") { const d = harborDir(x, y, a, bb) || { dx: 0, dy: 1 }; b.pdx = d.dx; b.pdy = d.dy; b.ppk = d.pk || 0; }
  if (T.field) { b.crop = "wheat"; b.auto = true; b.stage = 0; b.work = 0; b.grow = 0; b.left = 0; }
  S.b.push(b); occupy(W, b, true);
  let n = 0; treesIn(W, x, y, a, bb, (t, ch) => { if (!t.felled) { t.felled = true; t.logs = 0; n++; } t.cleared = true; t.gone = true; t.sapling = false; markChunk(W, ch); });
  bushesIn(W, x, y, a, bb, (t, ch) => { t.gone = true; markChunk(W, ch); });
  if (n) townRes(S, b.town).wood += n;
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
// ---------- economy: every settlement has its own stock and treasury ----------
// The first settlement keeps its stock in S.res (older saves), the others in T.res. Storage is per settlement.
export const COIN = .0005;       // coins per surplus unit: 10,000 units become 5 coins; 1 coin buys about 1,000 units
export const KINDS = ["food", "wood", "stone"];
export const resOf = (S, T) => (T && S.towns[0] && T.id !== S.towns[0].id) ? (T.res || (T.res = { food: 0, wood: 0, stone: 0 })) : S.res;
export const townRes = (S, id) => { const T = S.towns && S.towns.find(t => t.id === id); return T ? resOf(S, T) : S.res; };
export const capT = (W, T) => 200 + 300 * W.S.b.filter(b => b.done && b.type === "store" && (!T || b.town === T.id)).length;
export const capOf = (W, T) => capT(W, T || W.S.towns[0]);
export const totalRes = S => { const r = { food: 0, wood: 0, stone: 0 }; for (const t of (S.towns.length ? S.towns : [null])) { const q = resOf(S, t); for (const k of KINDS) r[k] += q[k] || 0; } return r; };
export const totalCap = W => W.S.towns.length ? W.S.towns.reduce((n, t) => n + capT(W, t), 0) : capT(W, null);
const homeTown = W => W.S.towns[0];
// put goods into a settlement's stock; whatever does not fit is sold off for coins (a loss that works as a tax)
function addRes(W, T, k, amt) {
  const S = W.S, R = resOf(S, T), cap = capT(W, T), v = R[k] + amt;
  if (v > cap) { if (T) { T.coin = Math.round(((T.coin || 0) + (v - cap) * COIN) * 10000) / 10000; if (!S.ms.coins && T.coin >= .05) milestone(W, "coins", "First Coins", "The storehouse was full, so the villagers sold the surplus. Every 10,000 spare goods bring 5 coins."); } R[k] = cap; }
  else R[k] = v;
}
export const camp = W => W.S.b.find(b => b.type === "camp");
export function bedsTotal(W) { let n = 0; for (const b of W.S.b) if (b.done && TYPES[b.type].beds) n += TYPES[b.type].beds; return n; }
function homeFor(W) {
  // newcomers move into the settlement with the fewest people that still has a free bed
  const S = W.S, used = {}, pop = {}; for (const p of S.people) { used[p.home] = (used[p.home] || 0) + 1; const h = S.b.find(b => b.id === p.home); if (h) pop[h.town] = (pop[h.town] || 0) + 1; }
  let best = 0, bp = 1e9;
  for (const b of S.b) { const T = TYPES[b.type]; if (b.done && !b.upTo && T.beds && (used[b.id] || 0) < T.beds && townRes(S, b.town).food >= 12 + (pop[b.town] || 0) * 2) { const bt0 = S.towns.find(t => t.id === b.town), q = (pop[b.town] || 0) * 100 + (b.town || 1) - (bt0 && bt0.fx === "come" ? 350 : 0); if (q < bp) { bp = q; best = b.id; } } }
  return best;
}
const an = n => (/^[AEIOU]/.test(n) ? "an " : "a ") + n;
// stumps near houses are dug out sooner
function plantable(W, x, y, self) {
  if (!openGround(W, x, y)) return false;
  const ch = chunkAt(W, x, y, true); for (const q of ch.trees) if (q !== self && !q.gone && (!q.felled || q.sapling) && Math.abs(q.x - x) < 1.1 && Math.abs(q.y - y) < 1.1) return false;
  return true;
}
function openGround(W, x, y) {
  if (wet(x, y) || lakeV(x, y) > .6 || lakeV(x + .6, y) > .62 || lakeV(x - .6, y) > .62 || lakeV(x, y + .6) > .62 || lakeV(x, y - .6) > .62 || isRoad(x, y) || wearAt(W, x, y) > .3 || hidden(W, x, y) || heightAt(x, y) > 42) return false;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (occAt(W, x + i * 1.2, y + j * 1.2)) return false;
  if (steep(x - .5, y, x + .5, y) || steep(x, y - .5, x, y + .5)) return false;
  return true;
}
function nearVillage(W, x, y) { for (const b of W.S.b) if (Math.abs(b.x + b.a / 2 - x) < b.a / 2 + 5 && Math.abs(b.y + b.b / 2 - y) < b.b / 2 + 5) return true; return false; }
// ---------- settlements ----------
export function townAt(S, x, y) { let best = S.towns[0], bd = 1e9; for (const t of S.towns) { const d = Math.hypot(t.x - x, t.y - y); if (d < bd) { bd = d; best = t; } } return best; }
export function townOf(W, p) {
  const S = W.S; let id = W.tm && W.tm.get(p.home);
  if (id === undefined) { const h = S.b.find(b => b.id === p.home); id = h ? h.town : 1; if (h) (W.tm || (W.tm = new Map())).set(p.home, id); }
  return S.towns.find(t => t.id === id) || S.towns[0];
}
const hallOf = (W, t) => t && W.S.b.find(b => b.id === t.hall);
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
  forEachNear(W, x, y, r, list, (o, ch) => { if (!ok(o) || hidden(W, o.x, o.y)) return; if (W.unr.size) { const u = W.unr.get(Math.round(o.x / 3) + ":" + Math.round(o.y / 3)); if (u && u > W.S.tick) return; } const d = Math.hypot(o.x - x, o.y - y); if (d <= r) c.push([d, o, ch]); });
  c.sort((a, b) => a[0] - b[0]); if (!c.length) return null;
  const e = c[Math.min(c.length - 1, (rnd(W) * Math.min(k, c.length)) | 0)]; return { o: e[1], ch: e[2] };
}
const ref = (list, ch, o) => ({ l: list, c: ch.k, i: o.i });
function deref(W, r) { if (!r) return null; if (r.b) return W.S.b.find(b => b.id === r.b) || null; const ch = W.chunks.get(r.c); return ch ? ch[r.l][r.i] : null; }
const busy = new Map(); // runtime reservation counts, rebuilt each step
const bkey = r => r ? (r.b ? "b" + r.b : r.l + r.c + ":" + r.i) : "";
// ---------- villager brain ----------
const frac = v => v - Math.floor(v);
// Bedtimes are spread from 22:15 to about 1:30 (night owls later), wake-up from 4:30 to 6:30.
// The night watchman (one per village) sleeps by day instead and walks his rounds with a lantern all night.
export const wakeAt = p => p.watch ? 16.3 : 4.6 + frac(p.id * .618) * 1.8 - (p.trait === "early riser" ? .5 : 0);
export const sleepAt = p => p.watch ? 9.3 : 22.25 + frac(p.id * .414) * 2.4 + (p.trait === "night owl" ? .9 : 0);
const deepP = (p, h) => { if (p.watch) return h >= 9.3 && h < 16.3; if (h >= 12) return h >= sleepAt(p); if (h < wakeAt(p)) return h >= 3 || h + 24 >= sleepAt(p); return false; };
const morningP = (p, h) => h >= wakeAt(p) && h < wakeAt(p) + .45;
const nightWatch = (p, h) => p.watch && (h >= 21 || h < 5.6);
const goesToInn = p => frac(p.id * .37 + .11) < .5;           // about half the village likes the tavern
const innLeave = p => 22.4 + frac(p.id * .29) * 1.1;
const evening = h => h >= 21.5 || h < 3;
function night(h) { return h >= 21.5 || h < 6; }
export function rallyStr(S) { if (!S.rally) return 0; const t = S.rally.t; return t < 60 ? 1 : Math.max(0, 1 - (t - 60) / 60); }
function assignRoles(W) { const S = W.S; if (!S.towns.length) assignTown(W, null); else for (const T of S.towns) assignTown(W, T); }
function assignTown(W, T) {
  const S = W.S, people = T ? S.people.filter(p => !p.pioneer && townOf(W, p).id === T.id) : S.people, n = people.length; if (!n) return;
  const R = resOf(S, T), sites = S.b.filter(b => isSite(b) && (!T || b.town === T.id || b.type === "bridge" || b.by === "mayor")).length;
  const fields = S.b.filter(b => b.done && TYPES[b.type].field && (!T || b.town === T.id)).length;
  const want = { build: sites ? Math.min(n, Math.max(1, Math.round(n * .3)) + (S.b.some(b => !b.done && b.by === "mayor") ? 1 : 0)) : 0 };
  const rest = n - want.build;
  const foodShare = R.food < n * 6 ? .5 : .35;
  want.food = Math.max(1, Math.round(rest * foodShare)); want.stone = S.ms.settled && n >= 5 ? Math.max(0, Math.round(rest * .12)) : 0;
  want.scout = n >= (T && T.id !== 1 ? 6 : 4) ? 1 : 0; want.wood = Math.max(0, rest - want.food - want.stone - want.scout);
  if (fields && want.food < fields) { want.food = Math.min(rest, fields); want.wood = Math.max(0, rest - want.food - want.stone - want.scout); }
  const have = {}; for (const k in want) have[k] = 0;
  const free = [];
  for (const p of people) { if (want[p.role] !== undefined && have[p.role] < want[p.role]) have[p.role]++; else free.push(p); }
  for (const p of free) { for (const k of ["build", "food", "wood", "stone", "scout"]) if (have[k] < want[k]) { p.role = k; have[k]++; break; } }
}
function pickJob(W, p, H) {
  const S = W.S, tw = townOf(W, p), hall = hallOf(W, tw) || camp(W), cm = hall, home = hall ? center(hall) : { x: 0, y: 0 }, rs = rallyStr(S), sea = seasonOf(clockOf(S).month);
  let role = p.role;
  if (S.rally && rs > .3 && rnd(W) < rs) role = S.rally.type;
  const R = resOf(S, tw), cap = capT(W, tw);
  // a full storehouse does not stop the work: the surplus is sold for coins, but people prefer to gather what is running low
  if (role !== "build" && role !== "scout" && R[role] >= cap) { const alt = KINDS.filter(k => R[k] < cap * .8); if (alt.length && rnd(W) < .6) role = alt[(rnd(W) * alt.length) | 0]; }
  let job = null, obj = null, tx = 0, ty = 0;
  const free = r => !busy.get(bkey(r));
  // visits between settlements: people carry news and bundles, and the walking makes roads
  if (S.towns.length > 1 && rnd(W) < .05 && !p.carry) {
    const others = S.towns.filter(t => t.id !== tw.id), ot = others[(rnd(W) * others.length) | 0];
    const farAway = Math.hypot(ot.x - tw.x, ot.y - tw.y) > 150 && rnd(W) > .2, dest = farAway || (W.unr.get("t" + tw.id + ">" + ot.id) || 0) > S.tick ? null : S.b.find(b => b.done && b.town === ot.id && (b.type === "store")) || hallOf(W, ot);
    if (dest) { const d = doorOf(dest); job = "visit"; tx = d.x + (rnd(W) - .5); ty = d.y; p.pack = true; p.visitTo = ot.name; }
  }
  if (!job && !p.carry && S.wonders.length && rnd(W) < .02) { // pilgrims walk to see a wonder their people found
    const near = S.wonders.filter(w => Math.hypot(w.x - home.x, w.y - home.y) < 70);
    if (near.length) { const w = near[(rnd(W) * near.length) | 0]; job = "visit"; tx = w.x + (rnd(W) - .5) * 3; ty = w.y + 2 + rnd(W); p.pack = true; p.visitTo = "the " + WONDERS[w.k].name; }
  }
  if (!job && role === "build") {
    const sites = S.b.filter(b => isSite(b) && (S.towns.length < 2 || b.town === tw.id || b.type === "bridge" || b.by === "mayor")).sort((a, b) => (a.by === "mayor" ? 0 : 1) - (b.by === "mayor" ? 0 : 1) || a.at - b.at);
    for (const s of sites) {
      const needK = ["wood", "stone"].find(k => (s.need[k] || 0) > 0);
      if (needK && townRes(S, s.town)[needK] > 0) { const st = nearestDrop(W, needK, s.x, s.y); if (st) { const d = doorOf(st); job = "fetch"; obj = { b: s.id }; p.fetchK = needK; p.fetchFrom = st.id; tx = d.x; ty = d.y; break; } }
      if (!needK) { const ws = workSpot(W, s); job = "construct"; obj = { b: s.id }; tx = ws.x + (s.type === "bridge" || s.type === "fill" ? 0 : (rnd(W) - .5) * s.a); ty = ws.y; break; }
    }
    if (!job) role = sites.some(s => (s.need.stone || 0) > 0 && !townRes(S, s.town).stone) ? "stone" : "wood";
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
    const r = pickNear(W, dc.x, dc.y, drop && drop.type === "quarry" ? 10 : 34, "rocks", o => o.stone > 0 && free({ l: "rocks", c: ckeyOf(o), i: o.i }), 2);
    const q = S.b.find(b => b.done && b.type === "quarry" && b.town === tw.id);
    if (r) { job = "stone"; obj = ref("rocks", r.ch, r.o); tx = r.o.x + .6; ty = r.o.y + .6; }
    else if (q) { job = "quarry"; obj = null; tx = q.x + 1 + (rnd(W) - .5); ty = q.y + q.b + .2; } // the quarry face never runs out
    else role = "wood";
  }
  if (!job && role === "wood") {
    const drop = nearestDrop(W, "wood", p.x, p.y) || cm, dc = drop ? doorOf(drop) : home;
    if (drop && drop.type === "wcut" && rnd(W) < .3) { // the forester plants young trees around the hut (sometimes a bit further)
      const st = pickNear(W, dc.x, dc.y, 12, "trees", o => o.felled && !o.cleared && !o.sapling && !o.gone && free({ l: "trees", c: ckeyOf(o), i: o.i }), 2);
      if (st) { job = "plant"; obj = ref("trees", st.ch, st.o); tx = st.o.x + .5; ty = st.o.y + .5; }
      else { const far = rnd(W) < .15, a = rnd(W) * 6.283, r = far ? 12 + rnd(W) * 8 : 4 + rnd(W) * 8, x = dc.x + Math.cos(a) * r, y = dc.y + Math.sin(a) * r;
        if (plantable(W, x, y)) { job = "plant"; obj = null; p.plantAt = { x, y }; tx = x; ty = y; } }
    }
    // a woodcutter with a hut works the forest around it like a forester: the densest trees first, within reach of the hut
    let t = null;
    if (!job && drop && drop.type === "wcut") {
      const c = []; forEachNear(W, dc.x, dc.y, 13, "trees", (o, ch) => { if (o.felled || o.gone || hidden(W, o.x, o.y) || !free({ l: "trees", c: ch.k, i: o.i })) return; const d = Math.hypot(o.x - dc.x, o.y - dc.y); if (d <= 13) c.push([-d * .15, o, ch]); });
      for (const e of c) { let nb = 0; for (const f of c) if (f !== e && Math.abs(f[1].x - e[1].x) < 1.6 && Math.abs(f[1].y - e[1].y) < 1.6) nb++; e[0] += nb * 2; }
      c.sort((a, b) => b[0] - a[0]); if (c.length) { const e = c[(rnd(W) * Math.min(3, c.length)) | 0]; t = { o: e[1], ch: e[2] }; }
    }
    if (!job && !t) t = pickNear(W, dc.x, dc.y, 30, "trees", o => !o.felled && !o.gone && free({ l: "trees", c: ckeyOf(o), i: o.i }), 4);
    if (!job && t) { job = "wood"; obj = ref("trees", t.ch, t.o); tx = t.o.x + .5; ty = t.o.y + .5; }
  }
  if (!job && role === "scout") {
    const a = rnd(W) * Math.PI * 2;
    for (let d = 4; d < 44; d++) { const x = home.x + Math.cos(a) * d, y = home.y + Math.sin(a) * d; if (isWater(x, y)) continue; if (hidden(W, x, y)) { job = "scout"; tx = x; ty = y; break; } }
  }
  if (!job && !p.carry) {
    // nothing within reach of the village: nobody just stands around. Look farther, plant young trees, or tidy up around the houses.
    const far = o => free({ l: "trees", c: ckeyOf(o), i: o.i });
    const t2 = pickNear(W, home.x, home.y, 75, "trees", o => !o.felled && !o.gone && far(o), 5);
    if (t2 && rnd(W) < .7) { job = "wood"; obj = ref("trees", t2.ch, t2.o); tx = t2.o.x + .5; ty = t2.o.y + .5; }
    if (!job) { const r2 = pickNear(W, home.x, home.y, 75, "rocks", o => o.stone > 0 && free({ l: "rocks", c: ckeyOf(o), i: o.i }), 4); if (r2 && rnd(W) < .5) { job = "stone"; obj = ref("rocks", r2.ch, r2.o); tx = r2.o.x + .6; ty = r2.o.y + .6; } }
    if (!job && sea !== "winter" && rnd(W) < .6) { for (let k = 0; k < 6 && !job; k++) { const a = rnd(W) * 6.283, r = 6 + rnd(W) * 16, x = home.x + Math.cos(a) * r, y = home.y + Math.sin(a) * r; if (plantable(W, x, y)) { job = "plant"; obj = null; p.plantAt = { x, y }; tx = x; ty = y; } } }
    if (!job) { const mine = S.b.filter(b => b.done && b.town === tw.id && !TYPES[b.type].deco && b.type !== "bridge" && b.type !== "field"); if (mine.length) { const b = mine[(rnd(W) * mine.length) | 0], d = doorOf(b); job = "chore"; tx = d.x + (rnd(W) - .5) * 1.5; ty = d.y + .6 + rnd(W) * .8; p.chore = b.type; } }
  }
  if (!job) {
    const benches = S.b.filter(b => b.done && b.type === "bench");
    if (benches.length && rnd(W) < .4) { const bb = benches[(rnd(W) * benches.length) | 0]; job = "rest"; tx = bb.x + .5; ty = bb.y + 1.1; p.benchSit = true; }
    else { const a = rnd(W) * 6.3, d = 1.5 + rnd(W) * 2.5; job = "rest"; tx = home.x + Math.cos(a) * d; ty = home.y + Math.sin(a) * d + 2; p.benchSit = false; }
  }
  p.job = job; p.obj = obj; if (obj) busy.set(bkey(obj), 1); p.tx = tx; p.ty = ty; p.state = "go";
  p.act = { chore: "Going to tidy up", fetch: "Fetching materials for a building", construct: "Building", sow: "Plowing and sowing the field", harvest: "Harvesting", wood: "Going to chop wood", stone: "Going to break stone", berries: "Going to pick berries", fish: "Going fishing", scout: "Exploring the land", rest: "Taking a break", plant: "Going to plant a young tree", tend: "Going to tend the sheep", honey: "Going to the beehives", visit: "Walking to " + (p.visitTo || "the other village") + " with a bundle", quarry: "Going to the quarry" }[job];
}
// the watchman's next stop: the door of some house or the fire of his village
function nextRound(W, p) {
  const S = W.S, tw = townOf(W, p), list = S.b.filter(b => b.done && b.town === tw.id && TYPES[b.type].beds || (b.done && b.town === tw.id && TYPES[b.type].hall));
  const b = list.length ? list[(rnd(W) * list.length) | 0] : null, d = b ? doorOf(b) : { x: p.x, y: p.y };
  p.tx = d.x + (rnd(W) - .5) * 2; p.ty = d.y + 1 + rnd(W); p.act = "Night watch: walking the rounds with a lantern";
}
function ckeyOf(o) { return o._k || ""; }
function think(W, p, H) {
  const S = W.S, cm = camp(W);
  if (p.trade) { tradeAbort(W, p); p.pack = false; }
  if (p.state === "sleep" && morningP(p, H)) { p.state = "morning"; p.act = "Waking up at home"; return; }
  if (p.state === "morning") { if (morningP(p, H)) return; p.state = "idle"; p.asleep = false; p.t = .3; }
  const chap = S.b.find(b => b.done && b.type === "chapel" && b.town === townOf(W, p).id);
  if (chap && clockOf(S).wd === 0 && H >= 9.5 && H < 10.6 && !p.carry && !["church", "tochurch", "sleep", "morning"].includes(p.state)) { p.obj = null; const d = doorOf(chap); p.state = "tochurch"; p.tx = d.x; p.ty = d.y; p.act = "Going to the Sunday service"; return; }
  if (nightWatch(p, H) && p.state !== "toStore" && p.state !== "deliver") {
    if (p.state !== "patrol") { p.obj = null; p.sit = false; p.asleep = false; p.inside = false; p.state = "patrol"; nextRound(W, p); }
    return;
  }
  if ((deepP(p, H) || evening(H)) && p.state !== "toStore" && p.state !== "deliver") {
    p.obj = null;
    const hb = S.b.find(b => b.id === p.home) || cm, hc = hb ? doorOf(hb) : { x: 0, y: 0 };
    if (deepP(p, H)) { if (p.state !== "bed" && p.state !== "sleep") { p.inside = false; p.state = "bed"; p.tx = hc.x; p.ty = hc.y; p.act = "Going home to sleep"; } return; }
    const tw = townOf(W, p), hall = hallOf(W, tw) || cm, inn = S.b.find(b => b.done && b.type === "tavern" && b.town === tw.id);
    if (inn && goesToInn(p) && H >= 12 && H < innLeave(p)) { if (p.state !== "toinn" && p.state !== "inn") { const d = doorOf(inn); p.state = "toinn"; p.tx = d.x + (rnd(W) - .5); p.ty = d.y; p.act = "Going to the tavern"; } return; }
    if (p.state !== "fire" && p.state !== "sit") { const f = hall ? center(hall) : { x: 0, y: 0 }, a = (p.id % 8) / 8 * 6.28 + .4; p.state = "fire"; p.tx = f.x + 2.2 + Math.cos(a) * 1.4; p.ty = f.y + 2.4 + Math.sin(a) * 1.1; p.act = "Going to the fire"; }
    return;
  }
  if (["sit", "sleep", "bed", "fire", "inn", "toinn", "church", "tochurch", "patrol"].includes(p.state)) { p.sit = false; p.asleep = false; p.inside = false; p.state = "idle"; }
  if (p.carry) {
    if (p.carry.to) { const s = S.b.find(b => b.id === p.carry.to); if (s && isSite(s)) { const ws = workSpot(W, s); p.state = "deliver"; p.tx = ws.x; p.ty = ws.y; p.act = "Carrying " + p.carry.type + " to a building site"; return; } p.carry.to = 0; }
    const mill = p.carry.mill && S.b.find(b => b.id === p.carry.mill && b.done);
    const d = mill || nearestDrop(W, p.carry.type, p.x, p.y) || cm; if (d) { const q = doorOf(d); p.state = "toStore"; p.tx = q.x; p.ty = q.y; p.act = "Carrying " + p.carry.amt + " " + p.carry.type + " home"; return; }
  }
  pickJob(W, p, H);
}
const WORK = { chore: 9, quarry: 30, visit: 12, trade: 10, wood: 18, stone: 24, berries: 12, fish: 25, scout: .5, rest: 8, construct: 6, sow: 12, harvest: 10, fetch: 1, plant: 10, tend: 22, honey: 16 };
// ---------- walking routes ----------
// Villagers do not walk in straight lines over lakes, through other villages or over cliffs: long trips (and any trip whose straight
// line is blocked) follow a route found on the land, around the water and around the squares of villages they are not going to.
const RT_N = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
function lineBad(x0, y0, x1, y1) {
  const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(L / .7)); let ph = heightAt(x0, y0);
  for (let k = 1; k <= n; k++) { const x = x0 + (x1 - x0) * k / n, y = y0 + (y1 - y0) * k / n; if (isWater(x, y)) return true; const h = heightAt(x, y); if (Math.abs(h - ph) > 3.6) return true; ph = h; }
  return false;
}
// is the straight stretch clear with a little room to the sides (so the smoothed route does not scrape the shore)?
function lineClear(x0, y0, x1, y1) {
  const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(L / .6)), nx = -(y1 - y0) / (L || 1) * .5, ny = (x1 - x0) / (L || 1) * .5; let ph = heightAt(x0, y0);
  for (let k = 1; k <= n; k++) { const x = x0 + (x1 - x0) * k / n, y = y0 + (y1 - y0) * k / n; if (isWater(x, y) || isWater(x + nx, y + ny) || isWater(x - nx, y - ny)) return false; const h = heightAt(x, y); if (Math.abs(h - ph) > 3.6) return false; ph = h; }
  return true;
}
// returns { pts } (waypoints, the last one is the goal), { fail: "unreach" } when the whole reachable land was searched, or { fail: "cap" }
function findRoute(W, x0, y0, x1, y1) {
  const S = W.S, D = Math.hypot(x1 - x0, y1 - y0), s = D < 50 ? 1 : D < 130 ? 2 : D < 300 ? 4 : 6, mg = 30 + D * .35;
  const xa = Math.min(x0, x1) - mg, ya = Math.min(y0, y1) - mg, nw = Math.ceil((Math.max(x0, x1) + mg - xa) / s) + 1, nh = Math.ceil((Math.max(y0, y1) + mg - ya) / s) + 1;
  if (nw * nh > 90000) return { fail: "cap" };
  const N = nw * nh, gs = new Float32Array(N).fill(1e9), par = new Int32Array(N).fill(-1), st = new Uint8Array(N), wk = new Uint8Array(N), hh = new Float32Array(N);
  const wx = i => xa + (i % nw) * s, wy = i => ya + Math.floor(i / nw) * s;
  const fh = S.towns.filter(t => Math.hypot(t.x - x0, t.y - y0) > 14 && Math.hypot(t.x - x1, t.y - y1) > 14);
  const cell = i => { let v = wk[i]; if (v) return v; const x = wx(i), y = wy(i); hh[i] = heightAt(x, y); if (isWater(x, y)) v = 2; else if (isRiver(x, y)) v = 3; else { v = 1; const rl = isRoad(x, y); if (rl) v = 4; else { const o = occAt(W, x, y); if (o && !TYPES[o.type].field && o.type !== "bridge") v = 5; } for (const t of fh) if (Math.abs(t.x - x) < 11 && Math.abs(t.y - y) < 11 && Math.hypot(t.x - x, t.y - y) < 11) { v = v === 4 ? 4 : 6; break; } } wk[i] = v; return v; };
  const mult = v => v === 3 ? 3 : v === 4 ? .6 : v === 5 ? 6 : v === 6 ? 5 : 1;
  const sc = Math.max(0, Math.min(nw - 1, Math.round((x0 - xa) / s))), sr = Math.max(0, Math.min(nh - 1, Math.round((y0 - ya) / s))), gc = Math.max(0, Math.min(nw - 1, Math.round((x1 - xa) / s))), gr = Math.max(0, Math.min(nh - 1, Math.round((y1 - ya) / s)));
  const si = sr * nw + sc, gi = gr * nw + gc, hf = i => { const dx = Math.abs(i % nw - gc), dy = Math.abs(Math.floor(i / nw) - gr); return (Math.max(dx, dy) + .4142 * Math.min(dx, dy)) * s; };
  // binary heap of [f, idx]
  const hp = []; const push = (f, i) => { hp.push([f, i]); let c = hp.length - 1; while (c > 0) { const q = (c - 1) >> 1; if (hp[q][0] <= hp[c][0]) break; const t = hp[q]; hp[q] = hp[c]; hp[c] = t; c = q; } };
  const pop = () => { const top = hp[0], last = hp.pop(); if (hp.length) { hp[0] = last; let c = 0; for (;;) { let l = c * 2 + 1, r = l + 1, m = c; if (l < hp.length && hp[l][0] < hp[m][0]) m = l; if (r < hp.length && hp[r][0] < hp[m][0]) m = r; if (m === c) break; const t = hp[m]; hp[m] = hp[c]; hp[c] = t; c = m; } } return top; };
  cell(si); gs[si] = 0; push(hf(si), si); let pops = 0, found = -1; const rch = s * 1.45;
  while (hp.length) {
    const [, i] = pop(); if (st[i] === 2) continue; st[i] = 2;
    if (Math.hypot(wx(i) - x1, wy(i) - y1) <= rch && cell(i) !== 2) { found = i; break; }
    if (++pops > 32000) return { fail: "cap" };
    const ci = i % nw, cj = Math.floor(i / nw);
    for (const [ox, oy, l] of RT_N) {
      const ni = ci + ox, nj = cj + oy; if (ni < 0 || nj < 0 || ni >= nw || nj >= nh) continue; const k = nj * nw + ni; if (st[k] === 2) continue;
      const v = cell(k); if (v === 2) continue; if (Math.abs(hh[k] - hh[i]) > 3.6 * Math.min(s, 2) * (l > 1 ? 1.2 : 1)) continue;
      if (s > 1) { const mx = (wx(i) + wx(k)) / 2, my = (wy(i) + wy(k)) / 2; if (isWater(mx, my)) continue; }
      const g = gs[i] + l * s * mult(v); if (g < gs[k]) { gs[k] = g; par[k] = i; push(g + hf(k) * 1.05, k); }
    }
  }
  if (found < 0) return { fail: "unreach" };
  let cellsP = []; for (let i = found; i >= 0; i = par[i]) cellsP.push({ x: wx(i), y: wy(i) }); cellsP.reverse(); cellsP[0] = { x: x0, y: y0 }; cellsP.push({ x: x1, y: y1 });
  // straighten: keep only the corners that are needed
  const out = []; let a = 0;
  while (a < cellsP.length - 1) { let b = cellsP.length - 1; while (b > a + 1 && !lineClear(cellsP[a].x, cellsP[a].y, cellsP[b].x, cellsP[b].y)) b--; out.push(cellsP[b]); a = b; }
  return { pts: out };
}
function giveUp(W, p) {
  W.unr.set(Math.round(p.tx / 3) + ":" + Math.round(p.ty / 3), W.S.tick + 6000); W.rt.delete(p.id);
  if (p.trade) { const t = p.trade; tradeAbort(W, p); W.unr.set("t" + t.from + ">" + t.to, W.S.tick + 14400); }
  p.obj = null; p.job = null; p.pack = false; p.blk = 0; p.state = "idle"; p.t = 3 + rnd(W) * 3;
}
function routeOf(W, p, fd) {
  const tk = W.S.tick; let r = W.rt.get(p.id);
  if (r && tk - r.lt <= 8 && Math.hypot(p.tx - r.tx, p.ty - r.ty) < 3.5 && Math.hypot(p.x - r.lx, p.y - r.ly) < 3) { r.lt = tk; r.lx = p.x; r.ly = p.y; return r; }
  r = { tx: p.tx, ty: p.ty, pts: null, i: 0, fail: "", lt: tk, lx: p.x, ly: p.y };
  if (W.S.phase !== "settled") { W.rt.set(p.id, r); return r; }
  if (fd > 3 && (fd > 28 || lineBad(p.x, p.y, p.tx, p.ty))) { const f = findRoute(W, p.x, p.y, p.tx, p.ty); if (f.pts) r.pts = f.pts; else r.fail = f.fail; }
  W.rt.set(p.id, r); return r;
}
function walk(W, p, spd) {
  const dt = DT, fdx = p.tx - p.x, fdy = p.ty - p.y, fd = Math.hypot(fdx, fdy);
  if (fd < .25) { W.rt.delete(p.id); return true; }
  let gx = p.tx, gy = p.ty;
  const rt = routeOf(W, p, fd);
  if (rt.fail === "unreach") { if (p.trek || p.state === "pioneer") p.unr = 1; else { giveUp(W, p); return false; } }
  if (rt.pts) { while (rt.i < rt.pts.length - 1 && Math.hypot(rt.pts[rt.i].x - p.x, rt.pts[rt.i].y - p.y) < .9) rt.i++; if (rt.i < rt.pts.length - 1) { gx = rt.pts[rt.i].x; gy = rt.pts[rt.i].y; } }
  const dx = gx - p.x, dy = gy - p.y, d = Math.hypot(dx, dy);
  p.steerT -= dt;
  if (p.steerT <= 0) {
    p.steerT = .5; const base = Math.atan2(dy, dx); let best = -1e9, ba = base;
    for (const off of (p.blk > .4 ? [-.9, -.45, 0, .45, .9, -1.5, 1.5, -2.2, 2.2] : [-.9, -.45, 0, .45, .9])) {
      const a = base + off, qx = p.x + Math.cos(a) * .9, qy = p.y + Math.sin(a) * .9;
      let sc = Math.cos(off) + (d > 2 ? Math.min(1, wearAt(W, qx, qy)) * .85 : 0); if (wet(qx, qy) && !isRiver(qx, qy) || steep(p.x, p.y, qx, qy)) sc -= 10; else if (isRiver(qx, qy)) sc -= .9; else if (isRoad(qx, qy)) sc += .35;
      const o = occAt(W, qx, qy); if (o && !TYPES[o.type].field && o.type !== "bridge" && d > 2) sc -= 2;
      if (sc > best) { best = sc; ba = a; }
    }
    p.ax = Math.cos(ba); p.ay = Math.sin(ba);
  }
  p.hx += (p.ax - p.hx) * .7; p.hy += (p.ay - p.hy) * .7; const hl = Math.hypot(p.hx, p.hy) || 1;
  const inR = isRiver(p.x, p.y), rl = isRoad(p.x, p.y), m = Math.min(d, spd * dt * (inR ? .55 : rl === 2 ? 1.45 : rl ? 1.25 : 1)), nx = p.x + p.hx / hl * m, ny = p.y + p.hy / hl * m;
  // nobody walks into a lake: stop at the shore, look for another way, and after a while give the errand up
  if (isWater(nx, ny) && !isWater(p.x, p.y)) { p.blk = (p.blk || 0) + dt; p.steerT = 0; p.moving = false; if (p.blk > 4) { if (p.trek || p.state === "pioneer") p.blk = 0; else giveUp(W, p); } return false; }
  p.blk = 0; p.x = nx; p.y = ny; p.moving = true;
  if (inR && W.S.phase === "settled" && !p.trek) { const k = okey(p.x, p.y); W.S.wade[k] = (W.S.wade[k] || 0) + 1; }
  return false;
}
function updatePerson(W, p, H) {
  const S = W.S, cm = camp(W);
  p.moving = false;
  const ptw0 = S.towns.length ? townOf(W, p) : null, hg = ptw0 ? ptw0.hungry : S.hungry, spd = (hg ? .8 : 1.1) * (1 + rallyStr(S) * .25) * (1 + wonderBonus(S, "speed") + townBonus(ptw0, "speed"));
  if (S.phase === "choose") { p.t -= DT; if (p.t < 0) { p.t = 3 + rnd(W) * 5; const a = rnd(W) * 6.3; p.tx = S.wagon.x - 1 + Math.cos(a) * 2; p.ty = S.wagon.y + 1.2 + Math.sin(a) * 1.4; } walk(W, p, .6); return; }
  if (S.phase === "travel") { const q = pathAt(S, S.wagon.d - 1.4 - (p.id % 5) * .9); p.tx = q.x + (p.id % 2 ? .7 : -.7); p.ty = q.y + (p.id % 2 ? -.5 : .5); walk(W, p, 1.6); if (p.moving) addWear(W, p.x, p.y, .012 * DT); return; }
  p.revT -= DT; if (p.revT <= 0) { p.revT = .75; reveal(W, p.x, p.y, p.trek ? 7.5 : 3.4); }
  switch (p.state) {
    case "arrive": if (walk(W, p, spd)) { p.state = "idle"; p.t = 1; } break;
    case "idle": case "wait": p.t -= DT; if (p.t <= 0) think(W, p, H); break;
    case "go": {
      if (p.job === "visit" || p.job === "trade") { p.goT = (p.goT || 0) + DT; if (p.goT > 1800) { p.goT = 0; p.pack = false; if (p.trade) tradeAbort(W, p); p.state = "idle"; p.t = 1; break; } }
      const near = !["rest", "scout", "construct", "sow", "harvest", "tend", "visit", "trade"].includes(p.job) && Math.hypot(p.tx - p.x, p.ty - p.y) < .6;
      if (walk(W, p, spd) || near) {
        if (p.job === "fetch") { const s = deref(W, p.obj), k = p.fetchK; const SR = s ? townRes(S, s.town) : S.res; if (s && isSite(s) && (s.need[k] || 0) > 0 && SR[k] > 0) { const n = Math.min(5, s.need[k], SR[k]); SR[k] -= n; s.need[k] -= n; p.carry = { type: k, amt: n, to: s.id }; } p.obj = null; p.state = "idle"; p.t = .3; break; }
        if (p.job === "trade" && p.trade) tradeDeliver(W, p);
        p.goT = 0; p.state = "work"; p.t = WORK[p.job] * (hg ? 1.3 : 1) * (1 - rallyStr(S) * .2);
        p.act = { wood: "Chopping wood", stone: "Breaking stone", berries: "Picking berries", fish: "Fishing", scout: "Looking around", rest: "Resting", construct: "Building", sow: "Plowing and sowing", harvest: "Harvesting", plant: "Planting a young tree", tend: "Milking the sheep", honey: "Collecting honey", visit: "Chatting in " + (p.visitTo || "the other village"), trade: "Haggling over the price", quarry: "Cutting stone at the quarry", chore: "Tidying up around the " + (TYPES[p.chore] ? TYPES[p.chore].name.toLowerCase() : "house") }[p.job];
        if (p.job === "rest") p.sit = p.benchSit || rnd(W) < .3;
      }
      if (evening(H) || deepP(p, H)) think(W, p, H);
      break;
    }
    case "work": p.t -= DT; if (p.job === "construct") { const s = deref(W, p.obj); if (s && isSite(s)) { s.prog += DT / TYPES[s.upTo || s.type].time * (1 + rallyStr(S) * .3); if (s.prog >= 1) { if (s.upTo) finishUpgrade(W, s); else finishBuilding(W, s); } } else p.t = 0; }
      if (p.t <= 0) { p.sit = false; finishWork(W, p); } break;
    case "deliver": if (walk(W, p, spd * .9) || Math.hypot(p.tx - p.x, p.ty - p.y) < .7) { const s = S.b.find(b => b.id === p.carry.to); if (!s || !isSite(s)) { { const dt0 = townOf(W, p); addRes(W, dt0, p.carry.type, boosted(S, p.carry.type, p.carry.amt, dt0)); } } p.carry = null; p.state = "idle"; p.t = .3; } break;
    case "toStore": if (walk(W, p, spd * .9)) {
      const ptw = townOf(W, p), gn = boosted(S, p.carry.type, p.carry.amt, ptw); addRes(W, ptw, p.carry.type, gn); W.events.push({ k: "gain", type: p.carry.type, amt: gn, x: p.x, y: p.y });
      if (p.carry.mill) { const m = S.b.find(b => b.id === p.carry.mill); if (m) m.grind = S.tick + 480; }
      p.carry = null; p.state = "idle"; p.t = .6 + rnd(W) * 1.5 * (1 - rallyStr(S)); p.act = "Back home";
      if (resOf(S, ptw).wood >= 50) milestone(W, "wood50", "A Fine Woodpile", "Fifty logs stacked up.");
    } break;
    case "fire": case "bed": if (walk(W, p, spd)) { if (p.state === "fire") { p.state = "sit"; p.sit = true; p.act = "Sitting by the fire"; } else { p.state = "sleep"; p.asleep = true; p.act = "Sleeping"; } } if (!evening(H) && !deepP(p, H)) think(W, p, H); else if (p.state === "fire" && deepP(p, H)) think(W, p, H); break;
    case "sit": if (!evening(H) || deepP(p, H)) think(W, p, H); break;
    case "sleep": if (!deepP(p, H)) think(W, p, H); break;
    case "morning": think(W, p, H); break;
    case "trek": trekStep(W, p, H); break;
    case "sail": { const bt = S.boats.find(q => q.id === p.boat); if (!bt) { p.trek = 0; p.boat = 0; p.inside = false; p.state = "idle"; p.t = 1; break; } p.x = bt.x; p.y = bt.y; p.inside = true; p.act = bt.rest > 0 ? "Fishing and looking around" : bt.st === "back" ? "Sailing home" : "Sailing out to sea"; break; }
    case "pioneer": { walk(W, p, spd * 1.1); if (p.revT <= .05) reveal(W, p.x, p.y, 5); const e = S.exp; if (!e) { p.state = "idle"; p.pioneer = 0; break; } if (Math.hypot(p.tx - p.x, p.ty - p.y) < 1.2) { p.state = "camp"; p.act = "Waiting for the others at the new place"; } break; }
    case "camp": if (!S.exp) { p.state = "idle"; } break;
    case "toinn": case "tochurch": if (walk(W, p, spd)) { p.inside = true; p.state = p.state === "toinn" ? "inn" : "church"; p.act = p.state === "inn" ? "At the tavern, singing" : "At the Sunday service"; } else if (p.state === "toinn" && (!evening(H) || deepP(p, H))) think(W, p, H); break;
    case "inn": if (!evening(H) || deepP(p, H) || H < 12 || H >= innLeave(p)) { p.inside = false; p.state = "idle"; think(W, p, H); } break;
    case "patrol": if (!nightWatch(p, H)) { p.state = "idle"; think(W, p, H); break; } if (p.t > 0) { p.t -= DT; break; } if (walk(W, p, spd * .7)) { p.t = 4 + rnd(W) * 10; nextRound(W, p); } break;
    case "church": if (H >= 10.6 || H < 9) { p.inside = false; p.state = "idle"; p.t = rnd(W) * 2; } break;
  }
  if (p.moving && S.towns.some(t => Math.hypot(t.x - p.x, t.y - p.y) < 45)) { const f = addWear(W, p.x, p.y, .034 * DT * (p.trade ? 2.5 : 1)); if (f && cm && Math.hypot(p.x - cm.x - 1.5, p.y - cm.y - 1.5) > 8) milestone(W, "path", "First Footpath", "Your villagers walked their first path into the grass. The Bench is unlocked."); }
}
function finishWork(W, p) {
  const S = W.S, j = p.job, o = deref(W, p.obj); p.obj = null;
  if (j === "wood" && o && !o.felled) { o.logs--; p.carry = { type: "wood", amt: 2 }; if (o.logs <= 0) { o.felled = true; o.regrow = 3600; const ch = W.chunks.get(o._k); if (ch) ch.ovDirty = true; } }
  else if (j === "stone" && o && o.stone > 0) { o.stone--; p.carry = { type: "stone", amt: 1 }; if (o.stone <= 0) { o.regrow = o.big ? 57600 : 36000; const ch = W.chunks.get(o._k); if (ch) ch.ovDirty = true; } }
  else if (j === "berries" && o && o.berries > 0) { o.berries--; p.carry = { type: "food", amt: 2 }; if (o.berries <= 0) o.regrow = 600; }
  else if (j === "fish") { p.carry = { type: "food", amt: 3 }; }
  else if (j === "sow" && o && o.stage === 0) { o.work += 1; if (o.work >= 3) { o.stage = 1; o.work = 0; o.grow = 0; W.events.push({ k: "field", b: o }); } }
  else if (j === "plant" && o && o.felled && !o.cleared && !o.gone) { o.sapling = true; o.regrow = 1200; o.rot = 0; const ch = W.chunks.get(o._k); if (ch) ch.ovDirty = true; }
  else if (j === "plant" && !o && p.plantAt && plantable(W, p.plantAt.x, p.plantAt.y)) { const { x, y } = p.plantAt, ch = chunkAt(W, x, y, true), conifer = fdV(x, y) > .55 || heightAt(x, y) > 14;
    ch.trees.push({ x, y, t: conifer ? (rnd(W) < .5 ? "spruce" : "spruceS") : birchV(x, y) > .4 ? "birch" : "oak", s: .85 + rnd(W) * .4, v: rnd(W), logs: 3, felled: true, sapling: true, regrow: 1200, cleared: false, i: ch.trees.length, _k: ch.k, planted: true }); ch.ovDirty = true; p.plantAt = null; }
  else if (j === "tend" && o) { p.carry = { type: "food", amt: 4 }; o.tend = S.tick + 480; }
  else if (j === "honey" && o) { p.carry = { type: "food", amt: flowerV(o.x + 1, o.y) > .4 || flowerV(o.x + 4, o.y + 4) > .4 ? 5 : 3 }; o.honey = S.tick + 720; }
  else if (j === "harvest" && o && o.stage === 3) { const n = Math.min(3, o.left), mill = S.b.find(b => b.done && b.type === "mill"); o.left -= n; p.carry = mill ? { type: "food", amt: Math.round(n * 1.5), mill: mill.id } : { type: "food", amt: n }; if (o.left <= 0) { o.stage = 0; o.work = 0; W.events.push({ k: "field", b: o }); milestone(W, "harvest", "First Harvest", "The first field is harvested. The Hut and the Windmill are unlocked."); if (o.auto) {} } }
  else if (j === "scout") { p.state = "idle"; p.t = .5; return; }
  else if (j === "visit" || j === "trade") { p.pack = false; }
  else if (j === "quarry") { p.carry = { type: "stone", amt: 2 }; }
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
// Where do the villagers build? Not wherever it is closest: houses and workplaces keep two free tiles around them (lanes for
// walking and carrying), the square around the village hall stays open, and paved roads are never built over.
const SPREAD = new Set(["pit", "hut", "longhouse", "field", "fold"]);
const OPEN_SQUARE = new Set(["well", "tavern", "chapel", "bench", "torch", "apiary", "tower", "camp", "outpost"]);
function findSite(W, type, ax, ay, rmin, rmax, again) {
  const T = TYPES[type], S = W.S; let best = null;
  const tw = S.towns.length ? townAt(S, ax, ay) : null, hall = tw && hallOf(W, tw), hc = hall ? center(hall) : null;
  const gap = T.deco || T.field ? 0 : 1; // extra free tiles on top of the one that canPlace already demands
  // houses and fields anchored on the village centre spread out sideways: the more buildings, the wider the ring they aim for
  const spread = hc && SPREAD.has(type) && Math.hypot(ax - hc.x, ay - hc.y) < 3;
  let rT = 0;
  if (spread) {
    const nb = S.b.filter(b => b.town === tw.id && !TYPES[b.type].deco).length;
    rT = 5 + 2.2 * Math.sqrt(Math.max(0, nb - 4)); rmin = Math.max(rmin, 5); rmax = Math.max(rmax, Math.ceil(rT) + 5);
  }
  for (let r = rmin; r <= rmax; r += 1) {
    const n = Math.max(8, Math.round(r * 3));
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2 + r * .37, x = Math.round(ax + Math.cos(a) * r - T.a / 2), y = Math.round(ay + Math.sin(a) * r - T.b / 2);
      if (hc && !OPEN_SQUARE.has(type) && Math.hypot(x + T.a / 2 - hc.x, y + T.b / 2 - hc.y) < 5.5) continue;
      if (canPlace(W, type, x, y, false)) continue;
      let blocked = false;
      for (let j = y - 1 - gap; j < y + T.b + 1 + gap && !blocked; j++) for (let i = x - 1 - gap; i < x + T.a + 1 + gap; i++) if (W.occ.has(tkey(i, j)) && !(TYPES[W.occ.get(tkey(i, j))?.type]?.field && type === "field")) { blocked = true; break; }
      if (blocked) continue;
      if (!T.deco) for (let j = y; j < y + T.b && !blocked; j++) for (let i = x; i < x + T.a; i++) if (ROAD.get(i + ":" + j)) { blocked = true; break; }
      if (blocked) continue;
      let trees = 0; treesIn(W, x, y, T.a, T.b, t => { if (!t.felled) trees++; });
      const sc = (spread ? Math.abs(r - rT) * .7 + rnd(W) * 1.2 : r + rnd(W) * .5) + trees * .8;
      if (!best || sc < best.sc) best = { x, y, sc };
    }
    if (best && r > (spread ? rT + 3 : rmin + 3)) break;
  }
  if (!best && !again && !T.deco) return findSite(W, type, ax, ay, rmax, rmax + 10, true);
  return best;
}
// old saves had blobs of road several tiles wide: thin them once to a path one tile wide (a tile in a 2x2 block goes if its neighbours stay connected)
function thinRoads(S) {
  const R = k => ROAD.has(k), key = (x, y) => x + ":" + y;
  for (let pass = 0; pass < 4; pass++) {
    let n = 0;
    for (const k of [...ROAD.keys()].sort()) {
      if (!ROAD.has(k)) continue; const [x, y] = k.split(":").map(Number);
      const N = R(key(x, y - 1)), E = R(key(x + 1, y)), So = R(key(x, y + 1)), Wt = R(key(x - 1, y)), NE = R(key(x + 1, y - 1)), SE = R(key(x + 1, y + 1)), SW = R(key(x - 1, y + 1)), NW = R(key(x - 1, y - 1));
      const blk = (N && E && NE) || (E && So && SE) || (So && Wt && SW) || (Wt && N && NW); if (!blk) continue;
      const e = [N, E, So, Wt], c = [NE, SE, SW, NW]; let comps = 0; const seen = [false, false, false, false];
      for (let i = 0; i < 4; i++) { if (!e[i] || seen[i]) continue; comps++; let j = i; seen[j] = true; while (true) { const nx = (j + 1) % 4; if (e[nx] && c[j] && !seen[nx]) { seen[nx] = true; j = nx; } else break; } j = i; while (true) { const pv = (j + 3) % 4; if (e[pv] && c[pv] && !seen[pv]) { seen[pv] = true; j = pv; } else break; } }
      if (comps <= 1) { ROAD.delete(k); n++; }
    }
    if (!n) break;
  }
  S.road = S.road.filter(k => ROAD.get(k) === 1); S.road2 = S.road2.filter(k => ROAD.get(k) === 2);
}
// roads only grow near a village and only out of the village or out of an existing road, so they never wander through the wild
const roadZone = (S, x, y) => S.towns.some(t => Math.hypot(t.x - x, t.y - y) < 30);
const roadJoins = (x, y) => { if (ROAD.has((x + 1) + ":" + y) || ROAD.has((x - 1) + ":" + y) || ROAD.has(x + ":" + (y + 1)) || ROAD.has(x + ":" + (y - 1))) return true; return ACTIVE.S.towns.some(t => Math.hypot(t.x - x, t.y - y) < 9); };
function plan(W) {
  const S = W.S; if (!camp(W)) return;
  // the busiest paths slowly become gravel roads; the busiest roads become wide cobbled main roads
  const stoneNeeded = S.b.some(b => isSite(b) && (b.need.stone || 0) > 0);
  const richest = k => S.towns.reduce((a, t) => resOf(S, t)[k] > resOf(S, a)[k] ? t : a, S.towns[0]), RS = resOf(S, richest("stone"));
  if (RS.stone >= 100 && !stoneNeeded) {
    const c1 = [], c2 = [];
    for (const ch of W.chunks.values()) {
      for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) {
        if (ch.fog[j * C + i]) continue; const x = ch.x0 + i, y = ch.y0 + j, k = x + ":" + y, lv = ROAD.get(k) || 0;
        const w0 = ch.wear[(j * 4 + 2) * C4 + i * 4 + 2]; if (w0 < WK * .6) continue;
        const w = Math.max(wearAt(W, x + .5, y + .5), wearAt(W, x + .25, y + .25), wearAt(W, x + .75, y + .75));
        if (!roadZone(S, x + .5, y + .5)) continue;
        if (lv === 0 && w >= 1.0 && !W.occ.has(k) && !wet(x + .5, y + .5) && lakeV(x + .5, y + .5) < .6 && roadJoins(x, y)) c1.push([w, k]);
        else if (lv === 1 && w >= 1.32) c2.push([w, k]);
      }
    }
    c1.sort((p, q) => q[0] - p[0]); const got = c1.slice(0, 4).map(q => q[1]);
    if (got.length) { for (const k of got) { ROAD.set(k, 1); S.road.push(k); } RS.stone -= got.length * 2; W.events.push({ k: "road", tiles: got }); if (!S.ms.road) milestone(W, "road", "First Road", "The busiest path was paved with gravel. Walking is faster on roads."); }
    if (RS.stone >= 180 && c2.length) {
      c2.sort((p, q) => q[0] - p[0]); const up = c2.slice(0, 3).map(q => q[1]), wide = [];
      for (const k of up) { ROAD.set(k, 2); S.road2.push(k); S.road = S.road.filter(q => q !== k); }
      RS.stone -= up.length * 4 + wide.length * 2; W.events.push({ k: "road", tiles: up.concat(wide) });
      if (!S.ms.road2) milestone(W, "road2", "A Main Road", "So many feet walked here that the villagers laid a cobbled road.");
    }
  }
  // wet feet: where villagers wade across the stream most, they build a bridge
  const wk = Object.keys(S.wade); if (wk.length > 300) { const keep = wk.sort((a, b) => S.wade[b] - S.wade[a]).slice(0, 60); const nw = {}; for (const k of keep) nw[k] = S.wade[k]; S.wade = nw; }
  if (!S.b.some(b => b.type === "bridge" && !b.done)) {
    let bk = null, bv = 0; for (const k in S.wade) if (S.wade[k] > bv) { bv = S.wade[k]; bk = k; }
    if (bk && bv >= 600) { const [bx, by] = bk.split(":").map(Number), sp = bridgeSpan(W, bx + .5, by + .5); if (S.b.some(b => b.type === "bridge" && Math.hypot(b.x - bx, b.y - by) < 10)) { S.wade[bk] = 0; sp.err = "near"; } if (!sp.err && resOf(S, richest("wood")).wood >= sp.len * 2) { addBuilding(W, "bridge", sp.x, sp.y, "ai", sp); addLog(W, "Tired of wet feet, the villagers started a bridge over the stream."); S.wade = {}; } else if (bk) S.wade[bk] = 0; }
  }
  expeditions(W);
  // the way between two villages is known: people walk it, so no dark gaps are left between them
  S.linked = S.linked || {};
  for (let i = 0; i < S.towns.length; i++) for (let j = i + 1; j < S.towns.length; j++) {
    const a = S.towns[i], b = S.towns[j], key = a.id + "-" + b.id, d = Math.hypot(a.x - b.x, a.y - b.y); if (S.linked[key] || d > 140) continue;
    const L = Math.max(1, Math.round(d / 5)); for (let k = 1; k < L; k++) reveal(W, a.x + (b.x - a.x) * k / L, a.y + (b.y - a.y) * k / L, 8); S.linked[key] = 1;
  }
  for (const t of S.towns) planTown(W, t);
}
function planTown(W, T) {
  const S = W.S, hall = hallOf(W, T); if (!hall) return;
  const c = center(hall), mine = S.b.filter(b => b.town === T.id), ppl = S.people.filter(p => townOf(W, p).id === T.id && !p.pioneer), n = ppl.length;
  const has = t => mine.some(b => b.type === t), cnt = t => mine.filter(b => b.type === t).length, first = T.id === 1;
  if (n >= 6 && ppl.filter(p => p.watch).length < 1 + (n >= 16 ? 1 : 0)) { const free = ppl.filter(p => !p.watch && !p.trek && !p.pioneer), w = free.find(p => p.trait === "night owl") || free[free.length - 1]; if (w) { w.watch = 1; addLog(W, w.name + " became the night watchman of " + T.name + ". Someone keeps a lantern lit all night."); } }
  if (mine.some(b => isSite(b) && b.by === "ai")) return;
  let beds = 0; for (const b of mine) if (b.done && TYPES[b.type].beds) beds += TYPES[b.type].beds;
  const free = beds - n, R = resOf(S, T), cap = capT(W, T);
  // a pit house is rebuilt into a hut when there is stone
  if (S.ms.harvest && free <= 1 && R.wood >= 20 && R.stone >= 4) {
    const pit = mine.find(b => b.type === "pit" && b.done && !b.upTo);
    if (pit) { occupy(W, pit, false); const err = canPlace(W, "hut", pit.x, pit.y, false); if (!err) { pit.upTo = "hut"; pit.prog = 0; pit.need = { ...TYPES.hut.cost }; pit.a = 3; pit.b = 3; occupy(W, pit, true); addLog(W, "In " + T.name + " the villagers are rebuilding a Pit House into a Hut."); W.events.push({ k: "build", b: pit }); return; } occupy(W, pit, true); }
  }
  const afford = t => { const k = TYPES[t].cost; return (R.wood >= (k.wood || 0) * .6) && (R.stone >= (k.stone || 0) * .6); };
  const L = [], near = (list, ok, r) => { const t = pickNear(W, c.x, c.y, r || 30, list, ok, 1); return t ? t.o : null; };
  // everyone needs a roof
  const totalFree = bedsTotal(W) - S.people.length;
  if (free <= 1 && (first || totalFree <= 2 || free <= 0 || n < 8)) L.push([S.ms.pop15 && R.stone >= 12 && n >= 10 ? "longhouse" : S.ms.harvest && R.stone >= 3 ? "hut" : "pit", c, 5, 20]);
  // workplaces and storehouses next to the resources around this village
  if (!has("wcut")) { const t = near("trees", o => !o.felled); if (t) L.push(["wcut", t, 2, 9]); }
  if (!has("field") && n >= (first ? 5 : 4)) L.push(["field", c, 6, 18]);
  if (!has("forage") && n >= (first ? 6 : 3)) { const t = near("bushes", o => !o.gone); if (t) L.push(["forage", t, 2, 9]); }
  if (!has("fisher") && n >= (first ? 6 : 4)) { const t = near("shore", () => true); if (t) L.push(["fisher", t, 1, 7]); }
  if (!has("store") && n >= (first ? 7 : 5)) {
    // the storehouse goes where most of the work happens: towards the densest wood or stone nearby
    let anchor = c; const t = near("trees", o => !o.felled, 24), r = near("rocks", o => o.stone > 0, 24);
    if (t && Math.hypot(t.x - c.x, t.y - c.y) > 10) anchor = { x: (t.x + c.x) / 2, y: (t.y + c.y) / 2 }; else if (r && Math.hypot(r.x - c.x, r.y - c.y) > 10) anchor = { x: (r.x + c.x) / 2, y: (r.y + c.y) / 2 };
    L.push(["store", anchor, 3, 16]);
  }
  if (S.ms.pop7 && !has("quarry")) { const t = near("rocks", o => o.stone > 0); if (t) L.push(["quarry", t, 2, 8]); }
  if (S.ms.pop10 && !has("well") && n >= 6) L.push(["well", c, 3, 9]);
  if (S.ms.harvest && n >= 8 && !has("mill") && has("field")) { const f = mine.find(b => b.type === "field"); L.push(["mill", center(f), 4, 12]); }
  if (n >= 8 && !has("tower") && first) { let bestA = 0, bestH = -1; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; let h = 0; for (let r = 14; r < 30; r += 4) if (hidden(W, c.x + Math.cos(a) * r, c.y + Math.sin(a) * r)) h++; if (h > bestH) { bestH = h; bestA = a; } } L.push(["tower", { x: c.x + Math.cos(bestA) * 12, y: c.y + Math.sin(bestA) * 12 }, 0, 8]); }
  if (S.ms.pop8 && !has("fold") && n >= 8) L.push(["fold", c, 8, 22]);
  if (S.ms.flowers && !has("apiary") && n >= 6) { let fp = null; for (let r = 4; r < 30 && !fp; r += 2) for (let a = 0; a < 6.28; a += .4) { const x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r; if (flowerV(x, y) > .5 && !hidden(W, x, y)) { fp = { x, y }; break; } } if (fp) L.push(["apiary", fp, 0, 6]); }
  if (S.ms.pop10 && !has("harbor") && n >= 12 && first) { const t = near("shore", () => true, 40); if (t) L.push(["harbor", t, 2, 10]); }
  if (S.ms.pop10 && !has("tavern") && n >= 10) L.push(["tavern", c, 5, 16]);
  if (S.ms.pop12 && !has("chapel") && n >= 12) L.push(["chapel", c, 7, 20]);
  if (n >= 7 && cnt("field") < 2) L.push(["field", c, 6, 22]);
  if (cnt("field") * 5 < n - 2) L.push(["field", c, 6, 24]);
  // when the storehouse is overflowing the village keeps growing: roofs ahead of need, more fields
  const rich = KINDS.filter(k => R[k] >= cap * .6).length >= 2;
  if (rich && free > 1 && free <= 3 && n >= 6) L.push([S.ms.pop15 && R.stone >= 12 && n >= 10 ? "longhouse" : S.ms.harvest && R.stone >= 3 ? "hut" : "pit", c, 5, 22]);
  if (rich && n >= 8 && cnt("field") < 1 + Math.floor(n / 6)) L.push(["field", c, 6, 26]);
  // a growing village keeps building: more workplaces, more storage when it is full, wells, lights for the night
  const capFull = KINDS.some(k => R[k] >= cap * .9);
  if (n >= 10 && has("store") && capFull && cnt("store") < 1 + Math.floor(n / 10)) { const t = near("trees", o => !o.felled, 26); L.push(["store", t ? { x: (t.x + c.x) / 2, y: (t.y + c.y) / 2 } : c, 4, 18]); }
  if (n >= 12 && cnt("wcut") < 1 + Math.floor(n / 12)) { const t = pickNear(W, c.x + 8, c.y - 6, 30, "trees", o => !o.felled && !mine.some(b => b.type === "wcut" && Math.hypot(b.x - o.x, b.y - o.y) < 14), 1); if (t) L.push(["wcut", t.o, 2, 9]); }
  if (n >= 12 && cnt("forage") < 1 + Math.floor(n / 14)) { const t = pickNear(W, c.x, c.y, 30, "bushes", o => !o.gone && !mine.some(b => b.type === "forage" && Math.hypot(b.x - o.x, b.y - o.y) < 12), 1); if (t) L.push(["forage", t.o, 2, 9]); }
  if (S.ms.pop10 && n >= 14 && cnt("well") < Math.floor(n / 12)) L.push(["well", c, 5, 16]);
  if (n >= 6 && cnt("torch") < Math.floor(n / 3)) L.push(["torch", c, 2, 6 + cnt("torch") * 1.5]);
  if (S.ms.path && n >= 8 && cnt("bench") < Math.floor(n / 6)) L.push(["bench", c, 2, 10]);
  for (const [want, anchor, r0, r1] of L) {
    if (!afford(want)) continue;
    const site = findSite(W, want, anchor.x, anchor.y, r0, r1); if (!site) continue;
    const b = addBuilding(W, want, site.x, site.y, "ai"); b.town = T.id;
    addLog(W, (S.towns.length > 1 ? "In " + T.name + " the" : "The") + " villagers started building " + an(TYPES[want].name) + ".");
    return;
  }
}
// ---------- wonders of the world ----------
// The world is seeded with wonders: roughly one in every second 48x48 region, at least 48 tiles from the start,
// so only an expedition (or very far-wandering villagers) will ever meet them.
const RG = 48;
const dry = (x, y) => !isWater(x, y) && !wet(x, y) && lakeV(x, y) < .58;
const flat = (x, y) => Math.abs(heightAt(x + 2, y) - heightAt(x - 2, y)) < 3 && Math.abs(heightAt(x, y + 2) - heightAt(x, y - 2)) < 3;
const coast = (x, y) => { const l = lakeV(x, y); return !isWater(x, y) && l > .6 && l < .7 && heightAt(x, y) < 2.6; };
export const WONDERS = {
  stones:     { name: "Stone Circle", d: "Seven tall stones in a ring. Nobody remembers who raised them.", rumor: "a ring of tall standing stones", ok: (x, y, h) => dry(x, y) && flat(x, y) && h < 20 },
  falls:      { name: "Great Falls", d: "A river throws itself over a cliff. You hear it from far away.", rumor: "a waterfall louder than thunder", ok: (x, y, h) => !wet(x, y) && riverD(x, y) < 4 && Math.abs(heightAt(x + 3, y + 3) - heightAt(x - 3, y - 3)) > 4 },
  elder:      { name: "Elder Oak", d: "An oak as wide as a barn. Ribbons hang from its branches.", rumor: "an oak as wide as a barn", ok: (x, y, h) => dry(x, y) && h < 18 },
  ruins:      { name: "Ancient Ruins", d: "Broken walls of a tower from a forgotten age. Ivy holds the stones together.", rumor: "old ruins from a forgotten age", ok: (x, y, h) => dry(x, y) && flat(x, y) && h < 26 },
  spring:     { name: "Hot Spring", d: "Warm turquoise pools steam on a rocky ledge.", rumor: "hot water bubbling out of the rock", ok: (x, y, h) => dry(x, y) && h >= 10 && h < 30 },
  crystal:    { name: "Crystal Cave", d: "Crystals glow blue and violet around a dark cave mouth.", rumor: "a cave that glows at night", ok: (x, y, h) => dry(x, y) && h >= 22 && h < 40 },
  bones:      { name: "Giant's Bones", d: "The ribs of a creature bigger than any house, half buried in the sand.", rumor: "the bones of a creature bigger than a house", ok: (x, y, h) => coast(x, y) || (dry(x, y) && flat(x, y) && h < 8) },
  fairy:      { name: "Mushroom Ring", d: "Giant red mushrooms stand in a perfect circle. Tiny lights dance between them.", rumor: "a ring of giant mushrooms", ok: (x, y, h) => dry(x, y) && h < 16 && (flowerV(x, y) > .2 || birchV(x, y) > .2) },
  shrine:     { name: "Hermit's Shrine", d: "A tiny chapel with a bell on a post. Someone keeps the candles lit.", rumor: "a lonely shrine with a bell", ok: (x, y, h) => dry(x, y) && flat(x, y) && h >= 8 && h < 28 },
  obelisk:    { name: "Sky Obelisk", d: "A tall pale stone, carved with suns and spirals.", rumor: "a tall carved stone", ok: (x, y, h) => dry(x, y) && flat(x, y) && h < 14 },
  lighthouse: { name: "Old Lighthouse", d: "A round tower on the shore. Its lamp went dark long ago.", rumor: "an old lighthouse on the shore", ok: (x, y, h) => coast(x, y) },
  arch:       { name: "Stone Arch", d: "A bridge of rock, made by wind and a very long time.", rumor: "a rock arch like a bridge", ok: (x, y, h) => dry(x, y) && h >= 18 && h < 38 },
  pyramid:    { name: "Sand Pyramid", d: "A stepped pyramid of golden stone rising from the dunes. A dark door waits at the top of the stairs.", rumor: "a golden mountain of stone, built by hands, in the sand", cr: 9, big: [(x, y) => desertV(x, y) > 0, .4, .8], ok: (x, y, h) => desertV(x, y) > .04 && !wet(x, y) && flat(x, y) },
  tisland:    { name: "Island Temple", d: "A white temple on a small island far out at sea. Only a ship can reach it.", rumor: "a white temple on an island far out at sea", cr: 6, ok: (x, y, h) => !isWater(x, y) && flat(x, y) },
  wtemple:    { name: "Wooden Temple", d: "A tall temple of dark timber, hidden deep in the forest. Wind chimes ring under its roofs.", rumor: "a temple of black timber deep in the forest", cr: 8, big: [(x, y) => fdV(x, y) > .55 && birchV(x, y) < .3 && !wet(x, y) && heightAt(x, y) < 22, .25, .8], ok: (x, y, h) => dry(x, y) && flat(x, y) && h < 20 && fdV(x, y) > .55 && birchV(x, y) < .3 },
  swamphut:   { name: "Stilt Hut", d: "A crooked hut on tall stilts above the black water. A green lantern burns in the window, day and night.", rumor: "a hut on stilts in the bog, with a green light", cr: 7, big: [(x, y) => swampV(x, y) > 0, .18, .9], ok: (x, y, h) => swampV(x, y) > 0 && dry(x, y) && flat(x, y) },
  icespires:  { name: "Ice Spires", d: "Spires of blue ice that never melt. They hum when the wind blows through them.", rumor: "blue towers of ice that sing in the wind", cr: 8, big: [(x, y) => tundraV(x, y) > 0, .25, .9], ok: (x, y, h) => tundraV(x, y) > 0 && dry(x, y) && flat(x, y) && h < 36 },
  goldtree:   { name: "The Golden Tree", d: "A tree taller than a church, every leaf pure gold. The leaves fall like slow rain and never run out.", rumor: "a tree with leaves of gold", cr: 8, big: [(x, y) => groveV(x, y) > 0, .3, .9], ok: (x, y, h) => groveV(x, y) > 0 && dry(x, y) && flat(x, y) && h < 30 },
};
for (const k of ["stones", "falls", "elder", "ruins", "spring", "crystal", "bones", "fairy", "shrine", "obelisk", "lighthouse", "arch"]) WONDERS[k].cr = WONDERS[k].cr || 5;
// what each wonder gives the village once it is found (stacks per wonder, capped)
const FX = { stones: "stone", falls: "food", elder: "wood", ruins: "come", spring: "speed", crystal: "stone", bones: "stone", fairy: "food", shrine: "come", obelisk: "come", lighthouse: "food", arch: "speed", pyramid: "stone", tisland: "food", wtemple: "wood", swamphut: "food", icespires: "stone", goldtree: "wood" };
const FXPCT = { wood: 6, stone: 6, food: 6, speed: 3, come: 5 }, FXNAME = { wood: "wood from every load", stone: "stone from every load", food: "food from every load", speed: "walking speed", come: "faster newcomers" };
for (const k in FX) WONDERS[k].fx = FX[k];
export const wonderFxText = k => { const f = WONDERS[k].fx; return "+" + FXPCT[f] + "% " + FXNAME[f]; };
export const wonderFxTown = T => T && T.fx ? (T.fx === "speed" ? "+12% walking speed" : T.fx === "come" ? "newcomers who like to settle there" : "+" + WFX_PCT + "% " + FXNAME[T.fx]) : "";
export function wonderBonus(S, f) { let n = 0; for (const w of S.wonders) if (WONDERS[w.k] && WONDERS[w.k].fx === f) n++; return Math.min(n * FXPCT[f], 40) / 100; }
function boosted(S, type, amt, T) { const b = wonderBonus(S, type) + townBonus(T, type); if (!b) return amt; const bc = S.bacc || (S.bacc = {}), acc = (bc[type] || 0) + amt * b, ex = Math.floor(acc); bc[type] = acc - ex; return amt + ex; }
// ---- THE RULE: every biome has its own wonder, and the Wonder Album is built from this list. ----
// A new biome in an update must add its wonder to WONDERS (with `biome:` set) and, if it is new, a line in BIOMES.
export const BIOMES = [
  { id: "meadow", name: "Meadows & Woods" }, { id: "highland", name: "Rivers & Highlands" }, { id: "coast", name: "Coast & Sea" },
  { id: "forest", name: "Great Forest" }, { id: "desert", name: "Desert" }, { id: "bog", name: "The Bog" }, { id: "frozen", name: "Frozen Lands" }, { id: "grove", name: "Golden Grove" },
];
const WB = { stones: "meadow", elder: "meadow", ruins: "meadow", shrine: "meadow", obelisk: "meadow", fairy: "meadow", falls: "highland", spring: "highland", crystal: "highland", arch: "highland", bones: "coast", lighthouse: "coast", tisland: "coast", wtemple: "forest", pyramid: "desert", swamphut: "bog", icespires: "frozen", goldtree: "grove" };
for (const k in WONDERS) { WONDERS[k].biome = WB[k]; if (!BIOMES.some(b => b.id === WB[k])) throw new Error("wonder " + k + " needs a biome in BIOMES"); }
for (const b of BIOMES) if (!Object.keys(WONDERS).some(k => WONDERS[k].biome === b.id)) throw new Error("biome " + b.id + " needs a wonder");
export const wonderTotal = S => S.scrollDone ? Object.keys(WONDERS).length : null;
const CLASSIC = Object.keys(WONDERS).slice(0, 12);
const BIGK = Object.keys(WONDERS).filter(k => WONDERS[k].big);
// how much of a region (48x48) is covered by a biome: only huge stretches of it can hide a wonder
const bigFrac = (rx, ry, f) => { let n = 0; for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) if (f(rx * RG + 4 + i * 8 + 1, ry * RG + 4 + j * 8 + 1)) n++; return n / 36; };
export const WONDER_KINDS = Object.keys(WONDERS);
export function wonderIn(W, rx, ry) {
  const cache = W.wc || (W.wc = new Map()), key = rx + "," + ry; if (cache.has(key)) return cache.get(key);
  const sd = W.S.seed | 0, Hh = c => ih(((rx * 73856093) ^ sd ^ (c * 2654435)) | 0, ((ry * 19349663) + c * 83492791 + sd) | 0);
  let res = null; const keepOver = OVER; OVER = new Map(); // wonders belong to the land itself, never to what villagers changed
  try {
    const isl = islandOf(rx, ry);
    const pre = []; if (isl && isl.r >= 9.5 && Hh(8) < .4) pre.push("tisland");
    BIGK.forEach((kk, bi) => { const bg = WONDERS[kk].big; if (Hh(301 + bi) < bg[2] && bigFrac(rx, ry, bg[0]) >= bg[1]) pre.push(kk); });
    if (pre.length || Hh(1) < .62 || (isl && Hh(7) < .6)) {
      const k0 = Math.floor(Hh(2) * CLASSIC.length), order = pre.slice();
      for (let j = 0; j < CLASSIC.length; j++) order.push(CLASSIC[(k0 + j) % CLASSIC.length]);
      outer: for (let j = 0; j < order.length; j++) {
        const kind = order[j], def = WONDERS[kind];
        for (let i = 0; i < 6; i++) {
          let x, y;
          if (kind === "tisland") { if (i) break; x = isl.x; y = isl.y; }
          else { x = Math.round((rx * RG + 4 + Hh(10 + j * 12 + i * 2) * (RG - 8)) * 2) / 2; y = Math.round((ry * RG + 4 + Hh(11 + j * 12 + i * 2) * (RG - 8)) * 2) / 2; }
          if (Math.hypot(x, y) < 48) continue;
          if (def.ok(x, y, heightAt(x, y))) { res = { id: key, k: kind, x, y }; break outer; }
        }
      }
    }
  } finally { OVER = keepOver; }
  cache.set(key, res); return res;
}
// ---------- treasures and hidden places: smaller finds, far more often than wonders ----------
export const TREASURES = {
  amphora: { name: "Clay Amphora", e: "🏺", d: "Sealed with wax. Still full of olive oil.", fx: { food: 40 } },
  chest:   { name: "Old Chest", e: "🧰", d: "Rusty hinges, good oak. Someone buried it in a hurry.", fx: { wood: 40 } },
  coins:   { name: "Old Coins", e: "🪙", d: "Silver from a kingdom nobody remembers. A trader pays well for it.", fx: { stone: 30 } },
  helm:    { name: "Knight's Helm", e: "🪖", d: "Dented, and much too big for anyone in the village.", fx: { stone: 20 } },
  sword:   { name: "Rusted Sword", e: "⚔️", d: "The smith says the steel is still good. He wants to melt it.", fx: { stone: 20 } },
  bell:    { name: "Small Bell", e: "🔔", d: "It still rings. Clear and sweet.", fx: { wood: 30 } },
  ring:    { name: "Silver Ring", e: "💍", d: "Inside the band: two names and a date.", fx: { food: 30 } },
  crown:   { name: "Tiny Crown", e: "👑", d: "Made for a child king. Nobody knows which one.", fx: { food: 40, stone: 20 } },
  gem:     { name: "Blue Gem", e: "💎", d: "It catches the light and keeps some of it.", fx: { stone: 50 } },
  horn:    { name: "Hunting Horn", e: "📯", d: "One deep note. Every dog in the village looks up.", fx: { wood: 25 } },
  cave:    { name: "Hidden Cave", e: "🕳️", d: "A narrow mouth in the rock. Dry inside, with bundles of old dried fruit.", fx: { food: 40 }, place: true },
  camp:    { name: "Abandoned Camp", e: "⛺", d: "A cold fire ring and a tent that nobody came back for.", fx: { wood: 40 }, place: true },
  well:    { name: "Old Well", e: "🪣", d: "Moss-covered stones, and water so clear you can see the bottom.", fx: { food: 30 }, place: true },
  cairn:   { name: "Lost Cairn", e: "🪨", d: "A tall pile of stones. Travellers have added one each for ages.", fx: { stone: 30 }, place: true },
};
const TKINDS = Object.keys(TREASURES), RT = 24, SCROLL_PIECES = 3;
export const SCROLL_NAME = ["The torn top", "The middle strip", "The lower corner"];
const tH = (W, a, b, c) => ih(((a * 73856093) ^ (W.S.seed | 0) ^ (c * 2654435)) | 0, ((b * 19349663) + c * 83492791 + (W.S.seed | 0)) | 0);
function treasureSpot(W, x0, y0, w, h, tries, salt) {
  for (let i = 0; i < tries; i++) { const x = Math.round((x0 + tH(W, salt, i, 11) * w) * 2) / 2, y = Math.round((y0 + tH(W, i, salt, 12) * h) * 2) / 2; if (Math.hypot(x, y) > 14 && dry(x, y) && heightAt(x, y) < 34) return { x, y }; }
  return null;
}
function treasureIn(W, tx, ty) {
  const cache = W.tc || (W.tc = new Map()), key = tx + "," + ty; if (cache.has(key)) return cache.get(key);
  let res = null; const keepOver = OVER; OVER = new Map();
  try { if (tH(W, tx, ty, 1) < .4) { const sp = treasureSpot(W, tx * RT + 2, ty * RT + 2, RT - 4, RT - 4, 5, tx * 131 + ty * 7 + 3); if (sp) { const k = tH(W, tx, ty, 2) < .22 ? TKINDS[10 + Math.floor(tH(W, tx, ty, 3) * 4)] : TKINDS[Math.floor(tH(W, tx, ty, 4) * 10)]; res = { id: "t" + key, k, x: sp.x, y: sp.y }; } } } finally { OVER = keepOver; }
  cache.set(key, res); return res;
}
// the three pieces of the Scroll of the Wonders: one in each of three rings around the start, on the mainland
function scrollSpots(W) {
  if (W.ss) return W.ss; const out = []; const keepOver = OVER; OVER = new Map();
  try { for (let i = 0; i < SCROLL_PIECES; i++) { let sp = null; for (let t = 0; t < 400 && !sp; t++) { const a = tH(W, i, t, 21) * 6.2832, d = 85 + i * 55 + tH(W, i, t, 22) * 45, x = Math.round(Math.cos(a) * d * 2) / 2, y = Math.round(Math.sin(a) * d * 2) / 2; if (dry(x, y) && heightAt(x, y) < 30 && !islandOf(Math.floor(x / ISL), Math.floor(y / ISL)) && flat(x, y)) sp = { id: "sc" + i, k: "scroll", i, x, y }; } if (sp) out.push(sp); } } finally { OVER = keepOver; }
  return W.ss = out;
}
export function debugTreasures(W) { const out = { scroll: scrollSpots(W).map(t => [t.x, t.y, Math.round(Math.hypot(t.x, t.y))]), n: 0, kinds: {} }; for (let j = -6; j < 6; j++) for (let i = -6; i < 6; i++) { const t = treasureIn(W, i, j); if (t) { out.n++; out.kinds[t.k] = (out.kinds[t.k] || 0) + 1; } } return out; }
function foundTreasure(W, t, p) {
  const S = W.S, who = p.trek === 1 ? p.name + " and the explorers" : p.boat ? p.name + " and the sailors" : p.name;
  if (S.treasures.some(q => q.id === t.id)) return;
  if (t.k === "scroll") {
    S.treasures.push({ id: t.id, k: "scroll", i: t.i, x: t.x, y: t.y, at: S.tick, by: p.name });
    const n = S.treasures.filter(q => q.k === "scroll").length;
    if (n >= SCROLL_PIECES) { S.scrollDone = true; addLog(W, who + " found the last piece of an old scroll. The pieces fit together."); milestone(W, "scroll", "Scroll of the Wonders", "The scroll lists every wonder of the world, by land. Open the Book to see how many are left to find."); }
    else addLog(W, who + " found a torn piece of an old scroll (" + n + " of " + SCROLL_PIECES + "). It speaks of wonders.");
    W.events.push({ k: "treasure", t, by: p.name, scroll: n }); return;
  }
  const def = TREASURES[t.k]; S.treasures.push({ id: t.id, k: t.k, x: t.x, y: t.y, at: S.tick, by: p.name });
  const parts = []; for (const r of Object.keys(def.fx)) { addRes(W, homeTown(W), r, def.fx[r]); parts.push("+" + def.fx[r] + " " + r); }
  addLog(W, who + " found " + (def.place ? "a hidden place: " : "a treasure: ") + def.name + ". " + def.d + " (" + parts.join(", ") + ")");
  if (def.place) reveal(W, t.x, t.y, 6);
  milestone(W, "treasure1", "A Treasure", "The explorers brought back something old. The Book keeps a list of everything they find.");
  W.events.push({ k: "treasure", t, by: p.name });
}
// anyone out exploring (expedition, pilgrim, boat) finds what lies within a few tiles
function treasureCheck(W, p, x, y, rad) {
  const S = W.S, tx = Math.floor(x / RT), ty = Math.floor(y / RT);
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const t = treasureIn(W, tx + i, ty + j); if (t && Math.hypot(t.x - x, t.y - y) <= rad && !S.treasures.some(q => q.id === t.id)) foundTreasure(W, t, p); }
  for (const t of scrollSpots(W)) if (Math.hypot(t.x - x, t.y - y) <= rad && !S.treasures.some(q => q.id === t.id)) foundTreasure(W, t, p);
}
const COMPASS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];
// screen directions: the map is drawn isometric, so "north" is the top of the screen
export function compass(dx, dy) { const a = Math.atan2(dx + dy, dx - dy); return COMPASS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]; }
const homeOf = W => { const t = W.S.towns[0], h = t ? hallOf(W, t) : camp(W); return h ? doorOf(h) : { x: 0, y: 0 }; };
function foundWonder(W, w, p) {
  const S = W.S, def = WONDERS[w.k]; S.wonders.push({ id: w.id, k: w.k, x: w.x, y: w.y, at: S.tick, by: p.name });
  reveal(W, w.x, w.y, 10); S.renown = S.wonders.length;
  addLog(W, (p.trek === 1 ? p.name + " and the explorers" : p.boat ? p.name + " and the sailors" : p.name) + " found a wonder: the " + def.name + ". " + def.d + " The village gains " + wonderFxText(w.k) + ".");
  W.events.push({ k: "wonder", w, by: p.name });
  const n = S.wonders.length;
  milestone(W, "wonder1", "A Wonder of the World", "Word of the " + def.name + " will travel. Newcomers arrive a little faster.");
  if (n >= 4) milestone(W, "wonder4", "Four Wonders", "Travellers talk about your valley now.");
  if (n >= 8) milestone(W, "wonder8", "Eight Wonders", "Your people have seen more of the world than anyone.");
  if (new Set(S.wonders.map(q => q.k)).size >= WONDER_KINDS.length) milestone(W, "wonderAll", "Every Kind of Wonder", WONDER_KINDS.length + " wonders, each one different.");
  if (S.rumor && S.rumor.id === w.id) S.rumor = null;
  if (p.trek === 1 && S.trek) { S.trek.rest = 120 + rnd(W) * 180; S.trek.restAct = "Marvelling at the " + def.name; S.trek.found.push(w.id); }
}
function discoverCheck(W) {
  const S = W.S;
  for (const p of S.people) {
    if (p.asleep || p.inside || !(p.trek === 1 || p.pilgrim)) continue;
    const rx = Math.floor(p.x / RG), ry = Math.floor(p.y / RG);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const w = wonderIn(W, rx + i, ry + j); if (!w || Math.hypot(w.x - p.x, w.y - p.y) > 9 || S.wonders.some(q => q.id === w.id)) continue;
      foundWonder(W, w, p);
    }
    treasureCheck(W, p, p.x, p.y, 7);
  }
}
// a newcomer tells a story about something far away
function makeRumor(W) {
  const S = W.S, c = homeOf(W); let best = null, bd = 1e9;
  for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) {
    const w = wonderIn(W, Math.floor(c.x / RG) + i, Math.floor(c.y / RG) + j); if (!w || S.wonders.some(q => q.id === w.id)) continue;
    const d = Math.hypot(w.x - c.x, w.y - c.y); if (d >= 48 && d < 230 && d < bd) { bd = d; best = w; }
  }
  if (!best) return;
  S.rumor = { id: best.id, k: best.k, x: best.x, y: best.y, dir: compass(best.x - c.x, best.y - c.y) };
  addLog(W, "A newcomer tells of " + WONDERS[best.k].rumor + ", far to the " + S.rumor.dir + ". Maybe worth an expedition.");
  W.events.push({ k: "rumor", dir: S.rumor.dir });
}
// ---------- expeditions ----------
// A small party walks out with food for the trip, rests every 15 tiles or so, camps at night, looks around the target,
// and walks back the same way. A trip to 100 tiles takes a few hours of real time.
const TREK_SPD = .6;
const dryNear = (x, y) => { if (!isWater(x, y)) return { x, y }; for (let r = 2; r <= 10; r += 2) for (let a = 0; a < 6.3; a += .5) { const qx = x + Math.cos(a) * r, qy = y + Math.sin(a) * r; if (!isWater(qx, qy)) return { x: qx, y: qy }; } return null; };
function trekLaunch(W, tx, ty, by) {
  const S = W.S; if (S.phase !== "settled") return "Settle first.";
  if (S.trek) return "The explorers are already out.";
  const h = homeOf(W), d = Math.hypot(tx - h.x, ty - h.y);
  if (d < 18) return "Too close. Pick a place farther away."; if (d > 700) return "Too far for one trip.";
  if (resOf(S, homeTown(W)).food < 24) return "Not enough food to pack. The explorers need 24.";
  const T = dryNear(tx, ty); if (!T) return "That is open water. Pick land.";
  if (!landRoute(W, h, T)) return "There is no way there on foot (water or cliffs are in the way).";
  const score = p => (p.role === "scout" ? 3 : 0) + (p.trait === "curious" ? 2 : p.trait === "early riser" || p.trait === "hard worker" ? 1 : 0);
  const pool = S.people.filter(p => !p.pioneer && !p.watch && !p.trek && !p.carry && !p.asleep && !p.inside && p.state !== "bed" && p.state !== "sleep" && p.role !== "build");
  if (pool.length < 2) return "Not enough free hands right now.";
  pool.sort((a, b) => score(b) - score(a) || a.id - b.id);
  const mem = pool.slice(0, S.people.length >= 9 ? 3 : 2);
  const L = Math.max(1, Math.round(d / 15)), legs = [];
  for (let i = 1; i <= L; i++) { const q = dryNear(h.x + (T.x - h.x) * i / L, h.y + (T.y - h.y) * i / L) || { x: T.x, y: T.y }; legs.push({ x: q.x, y: q.y, k: "leg" }); }
  legs[L - 1] = { x: T.x, y: T.y, k: "leg", last: 1 };
  const a0 = rnd(W) * 6.28, looks = [0, 1, 2].map(i => { const q = dryNear(T.x + Math.cos(a0 + i * 2.1) * 10, T.y + Math.sin(a0 + i * 2.1) * 10) || T; return { x: q.x, y: q.y, k: "look" }; });
  const back = legs.slice(0, L - 1).reverse().map(q => ({ x: q.x, y: q.y, k: "back" })).concat([{ x: h.x, y: h.y, k: "home" }]);
  const dir = compass(T.x - h.x, T.y - h.y), name = dir[0].toUpperCase() + dir.slice(1) + "ern Expedition";
  S.trek = { name: name.replace("north-ern", "North-eastern").replace(/ern Expedition$/, "ern Expedition"), dir, members: mem.map(p => p.id), hx: h.x, hy: h.y, tx: T.x, ty: T.y, path: [...legs, ...looks, ...back], i: 0, rest: 0, restAct: "", at: S.tick, found: [], stuck: 0, sk: 60, bd: 1e9, by, far: Math.round(d), rf: d > 150 ? .35 : 1 };
  resOf(S, homeTown(W)).food -= 24;
  for (const p of mem) { p.obj = null; p.carry = null; p.job = null; p.pack = true; p.trek = 1; p.state = "trek"; p.sit = false; p.inside = false; p.asleep = false; p.act = "Setting out on an expedition"; }
  addLog(W, mem.map(p => p.name).join(", ") + " set out to the " + dir + " with food for the road (" + Math.round(d) + " tiles). " + (by === "mayor" ? "The Mayor asked them to." : "They could not sit still any longer."));
  W.events.push({ k: "trek", what: "start", dir });
  milestone(W, "trek1", "First Expedition", "A small party leaves the valley to see what lies beyond.");
  return null;
}
function trekFinish(W) {
  const S = W.S, T = S.trek; if (!T) return;
  const mem = S.people.filter(p => T.members.includes(p.id));
  for (const p of mem) { p.trek = 0; p.pack = false; p.sit = false; p.state = "idle"; p.t = 1; p.act = "Back home"; }
  const hrs = Math.max(.1, (S.tick - T.at) / 14400), n = T.found.length;
  addRes(W, homeTown(W), "food", 6 * mem.length);
  addLog(W, "The " + T.name + " is back after " + hrs.toFixed(1) + " hours. " + (n ? "They found " + n + " wonder" + (n > 1 ? "s" : "") + "." : "No wonders this time, but they know the land better now.") + " They brought back berries and stories.");
  W.events.push({ k: "trek", what: "end", n });
  S.lastTrek = S.tick; S.trek = null;
}
function trekStep(W, p, H) {
  const S = W.S, T = S.trek;
  if (!T || !T.members.includes(p.id)) { p.trek = 0; p.pack = false; p.state = "idle"; p.t = 1; return; }
  const lead = S.people.find(q => q.id === T.members[0]);
  if (!lead) { for (const q of S.people) if (T.members.includes(q.id)) { q.trek = 0; q.state = "idle"; } S.trek = null; return; }
  if (H >= 21.5 || H < 5.3) { p.sit = true; p.moving = false; p.act = "Camping under the stars"; return; }
  p.sit = false;
  const idx = T.members.indexOf(p.id);
  if (T.rest > 0) { if (idx === 0) T.rest -= DT; p.sit = true; p.act = T.restAct || "Resting"; return; }
  if (idx > 0) {
    if (Math.hypot(p.x - lead.x, p.y - lead.y) > 10) { const q = dryNear(lead.x - .8 * idx, lead.y + .5 * idx) || dryNear(lead.x, lead.y) || lead; p.x = q.x; p.y = q.y; }
    else if (isWater(p.x, p.y) && !p.boat) { const q = dryNear(p.x, p.y); if (q) { p.x = q.x; p.y = q.y; } }
    { const q = dryNear(lead.x + (idx % 2 ? -.9 : .9), lead.y + .35 * idx) || lead; p.tx = q.x; p.ty = q.y; } if (Math.hypot(p.tx - p.x, p.ty - p.y) > .7) walk(W, p, TREK_SPD * 1.25); p.act = "On an expedition"; return;
  }
  if (isWater(p.x, p.y) && !p.boat) { const q = dryNear(p.x, p.y); if (q) { p.x = q.x; p.y = q.y; } }
  const wp = T.path[T.i]; if (!wp) { trekFinish(W); return; }
  p.tx = wp.x; p.ty = wp.y; p.act = wp.k === "look" ? "Exploring the area" : wp.k === "home" || wp.k === "back" ? "Heading home" : "On an expedition to the " + T.dir;
  const arrived = walk(W, p, TREK_SPD) || Math.hypot(wp.x - p.x, wp.y - p.y) < 1.3;
  if (p.unr && !arrived) { p.unr = 0; T.i++; T.bd = 1e9; T.stuck = 0; T.sk = 60; return; } // no way there on foot: skip this stop
  if (arrived) {
    p.unr = 0; T.i++; T.bd = 1e9; T.stuck = 0; T.sk = 60;
    if (wp.k === "home") { trekFinish(W); return; }
    if (wp.last) { T.rest = 600 + rnd(W) * 600; T.restAct = "Making camp and studying the land"; addLog(W, "The explorers reached the place they were heading for and are looking around."); }
    else if (wp.k === "look") { T.rest = 480 + rnd(W) * 600; T.restAct = "Exploring the area"; }
    else { T.rest = (480 + rnd(W) * 720) * (T.rf || 1); T.restAct = wp.k === "back" ? "Resting on the way home" : "Resting and eating"; if (rnd(W) < .3) addLog(W, TREK_TALES[(rnd(W) * TREK_TALES.length) | 0].replace("%", p.name)); }
    return;
  }
  T.sk -= DT;
  if (T.sk <= 0) {
    T.sk = 60; const d = Math.hypot(wp.x - p.x, wp.y - p.y);
    if (d > T.bd - 1.2) {
      T.stuck++;
      if (T.stuck >= 10 && wp.k === "home") { for (const q of S.people) if (T.members.includes(q.id)) { q.x = T.hx; q.y = T.hy; } addLog(W, "The explorers got lost, but a farmer showed them the way home."); trekFinish(W); return; }
      if (T.stuck >= 6) { T.i++; T.stuck = 0; }
      else if (T.stuck >= 2 && T.path.length < 160) { const a = Math.atan2(wp.y - p.y, wp.x - p.x) + (T.stuck % 2 ? 1.1 : -1.1), q = dryNear(p.x + Math.cos(a) * 10, p.y + Math.sin(a) * 10); if (q) T.path.splice(T.i, 0, { x: q.x, y: q.y, k: "detour" }); }
    } else T.stuck = 0;
    T.bd = d;
  }
}
const TREK_TALES = ["% saw deer drinking at a stream.", "The explorers crossed a stream and refilled their water.", "A storm of birds rose from a meadow as the explorers passed.", "% found wild berries and everyone ate well.", "Rain came. The explorers waited under a rock.", "The explorers carved a mark into a tree so they can find the way back."];
function trekAI(W, H) {
  const S = W.S; if (S.trek || S.exp || S.phase !== "settled" || S.people.length < 9 || resOf(S, homeTown(W)).food < 40 || S.tick < 28800) return;
  if (H < 5.6 || H > (S.wantLand ? 16 : 9.5) || S.tick < (S.trekRetry || 0)) return;
  if (S.tick - (S.lastTrek || 0) < (S.rumor ? 14400 : S.wantLand ? 21600 : 86400)) return;
  const h = homeOf(W); let tx, ty;
  if (S.rumor) { tx = S.rumor.x + (rnd(W) - .5) * 8; ty = S.rumor.y + (rnd(W) - .5) * 8; }
  else {
    let best = -1e9;
    const far = !!S.wantLand, cl = [];
    for (let a = 0; a < 24; a++) for (const r of (far ? [TOWN_GAP + 25, TOWN_GAP + 80, TOWN_GAP + 140, TOWN_GAP + 210] : [45, 70, 95, 120])) {
      const ang = a / 24 * 6.283, x = h.x + Math.cos(ang) * r, y = h.y + Math.sin(ang) * r; if (isWater(x, y) || heightAt(x, y) > 34) continue;
      if (far && (!S.towns.every(q => Math.hypot(q.x - x, q.y - y) >= TOWN_GAP * .95) || !siteOk(W, x, y, true))) continue;
      let ok = 0; for (let k = 1; k <= 8; k++) if (!isWater(h.x + Math.cos(ang) * r * k / 8, h.y + Math.sin(ang) * r * k / 8)) ok++; if (ok < (far ? 4 : 7)) continue;
      let hid = 0; for (const [dx, dy] of [[0, 0], [6, 0], [-6, 0], [0, 6], [0, -6]]) if (hidden(W, x + dx, y + dy)) hid++;
      const sc = hid * 10 - r * (far ? .02 : .12) + ih(a * 31 + (S.seed & 255), r) * 4; cl.push({ sc, x, y });
    }
    cl.sort((p, q) => q.sc - p.sc); for (const c of cl.slice(0, 5)) if (landRoute(W, h, c)) { best = c.sc; tx = c.x; ty = c.y; break; }
    if (best < -1e8) { S.trekRetry = S.tick + 28800; return; }
  }
  const err = trekLaunch(W, tx, ty, "ai"); if (err) S.trekRetry = S.tick + 7200;
}
function trekRecall(W) {
  const S = W.S, T = S.trek; if (!T) return "Nobody is out.";
  const visited = T.path.slice(0, T.i).filter(q => q.k === "leg" || q.k === "back").map(q => ({ x: q.x, y: q.y, k: "back" })).reverse();
  T.path = [...visited, { x: T.hx, y: T.hy, k: "home" }]; T.i = 0; T.rest = 0; T.stuck = 0; T.bd = 1e9;
  addLog(W, "The Mayor called the explorers back."); S.rev++; return null;
}
// ---------- harbour and boats ----------
// A harbour is a boat shed with a pier. Its boat takes two or three sailors out by day: they sail to unexplored water and coasts,
// look around, fish, and come back along the same track before dark. Each trip goes a little farther than the last.
export function harborDir(x, y, a = 3, b = 2) {
  const cx = x + a / 2, cy = y + b / 2; let best = null, bs = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const ext = (dx ? a : b) / 2; let pk = -1;
    for (let k = 0; k <= 3 && pk < 0; k++) if (isWater(cx + dx * (ext + .5 + k), cy + dy * (ext + .5 + k)) && isWater(cx + dx * (ext + 1.5 + k), cy + dy * (ext + 1.5 + k)) && isWater(cx + dx * (ext + 2.5 + k), cy + dy * (ext + 2.5 + k))) pk = k;
    if (pk < 0) continue;
    let wn = 0, n = 0; for (let d = ext + pk + 4; d <= 44; d += 2) { n++; if (isWater(cx + dx * d, cy + dy * d)) wn++; }
    const sc = wn / n; if (sc > .75 && sc > bs) { bs = sc; best = { dx, dy, pk }; }
  }
  return best;
}
export function dockOf(hb) {
  const dx = hb.pdx || 0, dy = hb.pdy || 1, pk = hb.ppk || 0, cx = hb.x + hb.a / 2, cy = hb.y + hb.b / 2, ext = (dx ? hb.a : hb.b) / 2;
  for (let k = 4; k >= 1; k--) { const px = cx + dx * (ext + .5 + pk + k), py = cy + dy * (ext + .5 + pk + k); if (isWater(px, py)) return { x: px, y: py }; }
  return { x: cx + dx * (ext + 1 + pk), y: cy + dy * (ext + 1 + pk) };
}
const waterLine = (x0, y0, x1, y1, need = .85) => { let ok = 0; for (let k = 1; k <= 8; k++) if (isWater(x0 + (x1 - x0) * k / 8, y0 + (y1 - y0) * k / 8)) ok++; return ok / 8 >= need; };
const nearLand = (x, y) => { for (let a = 0; a < 6.28; a += 1.05) if (!isWater(x + Math.cos(a) * 6, y + Math.sin(a) * 6)) return true; return false; };
const hid5 = (W, x, y) => { let n = 0; for (const [dx, dy] of [[0, 0], [11, 0], [-11, 0], [0, 11], [0, -11]]) if (hidden(W, x + dx, y + dy)) n++; return n; };
// Sea routes: the water is cut into 4x4-tile cells and searched breadth-first from the pier, so a boat finds its way out of bays and around headlands.
const SG = 4, EMPTY_OVER = new Map();
function seaCell(W, cx, cy) {
  const m = W.sg || (W.sg = new Map()), k = (cx + 3000) * 6007 + (cy + 3000); let v = m.get(k);
  if (v === undefined) { const x = cx * SG + SG / 2, y = cy * SG + SG / 2, keep = OVER; OVER = EMPTY_OVER; try { v = isWater(x, y) && isWater(x + 1.3, y + 1.3) && isWater(x - 1.3, y - 1.3) ? 1 : 0; } finally { OVER = keep; } m.set(k, v); if (m.size > 60000) W.sg = new Map(); }
  return v;
}
function seaBFS(W, from, maxR) {
  const c0x = Math.floor(from.x / SG), c0y = Math.floor(from.y / SG), R = Math.ceil(maxR / SG), map = new Map(), list = [], key = (cx, cy) => (cx + 3000) * 6007 + (cy + 3000);
  const start = { cx: c0x, cy: c0y, d: 0, p: null }; map.set(key(c0x, c0y), start); list.push(start);
  for (let h = 0; h < list.length; h++) {
    const c = list[h];
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      if (!i && !j) continue; const nx = c.cx + i, ny = c.cy + j; if (Math.abs(nx - c0x) > R || Math.abs(ny - c0y) > R) continue;
      const k = key(nx, ny); if (map.has(k) || !seaCell(W, nx, ny)) continue;
      if (i && j && !(seaCell(W, c.cx + i, c.cy) && seaCell(W, c.cx, c.cy + j))) continue; // no squeezing through a diagonal gap
      const n = { cx: nx, cy: ny, d: c.d + 1, p: c }; map.set(k, n); list.push(n);
    }
  }
  return { map, list, key };
}
function seaRouteTo(cell) {
  const chain = []; for (let c = cell; c; c = c.p) chain.push(c); chain.reverse();
  const legs = []; for (let i = 2; i < chain.length - 1; i += 2) legs.push({ x: chain[i].cx * SG + SG / 2, y: chain[i].cy * SG + SG / 2, k: "via" });
  legs.push({ x: cell.cx * SG + SG / 2, y: cell.cy * SG + SG / 2, k: "leg" });
  return legs;
}
function planVoyage(W, bt, from) {
  const S = W.S, maxR = Math.min(260, 55 + 25 * bt.voy), G = seaBFS(W, from, maxR); let best = null, bsc = -1e9;
  if (S.rumor) { const q = dryNearWater(S.rumor.x, S.rumor.y); if (q) { const c = G.map.get(G.key(Math.floor(q.x / SG), Math.floor(q.y / SG))); if (c && c.d > 2) { best = c; bsc = 1e8; } } }
  if (!best) for (const c of G.list) {
    if (c.d < 3) continue; const x = c.cx * SG + 2, y = c.cy * SG + 2, hid = hid5(W, x, y); if (hid < 3) continue;
    let sc = hid * 6 - c.d * .35 + (nearLand(x, y) ? 4 : 0) + ih(c.cx * 31 + bt.voy, c.cy) * 5; for (const q of bt.prev || []) if (Math.hypot(q.x - x, q.y - y) < 28) sc -= 7;
    if (sc > bsc) { bsc = sc; best = c; }
  }
  if (!best) return [];
  (bt.prev = bt.prev || []).push({ x: best.cx * SG + 2, y: best.cy * SG + 2 }); if (bt.prev.length > 8) bt.prev.shift();
  const legs = seaRouteTo(best), T = legs[legs.length - 1], a0 = rnd(W) * 6.28;
  for (let i = 0; i < 2; i++) { const q = dryNearWater(T.x + Math.cos(a0 + i * 3.1) * 9, T.y + Math.sin(a0 + i * 3.1) * 9); if (q && seaCell(W, Math.floor(q.x / SG), Math.floor(q.y / SG))) legs.push({ x: q.x, y: q.y, k: "leg" }); }
  return legs;
}
function dryNearWater(x, y) { if (isWater(x, y)) return { x, y }; for (let r = 2; r <= 16; r += 2) for (let a = 0; a < 6.3; a += .5) { const qx = x + Math.cos(a) * r, qy = y + Math.sin(a) * r; if (isWater(qx, qy)) return { x: qx, y: qy }; } return null; }
function sailLaunch(W, bt, legs, by) {
  const S = W.S, hb = S.b.find(q => q.id === bt.hb); if (!hb || !legs.length) return "No unexplored water is in reach.";
  const score = p => (p.role === "scout" ? 3 : 0) + (p.role === "food" ? 2 : 0) + (p.trait === "curious" ? 1 : 0);
  const pool = S.people.filter(p => !p.pioneer && !p.watch && !p.trek && !p.carry && !p.asleep && !p.inside && p.state !== "bed" && p.state !== "sleep" && p.role !== "build" && (townOf(W, p).id === hb.town || Math.hypot(p.x - hb.x, p.y - hb.y) < 50));
  if (pool.length < 2) return "Not enough free hands for the boat.";
  pool.sort((a, b) => score(b) - score(a) || a.id - b.id); const crew = pool.slice(0, S.people.length >= 14 ? 3 : 2);
  legs[legs.length - 1].last = 1;
  bt.legs = legs; bt.i = 0; bt.rest = 0; bt.st = "out"; bt.trail = []; bt.found = []; bt.crew = crew.map(p => p.id); bt.at = S.tick; bt.stuck = 0; bt.sk = 60; bt.bd = 1e9; bt.by = by; bt.bias = 1;
  for (const p of crew) { p.obj = null; p.carry = null; p.job = null; p.pack = false; p.trek = 2; p.boat = bt.id; p.state = "sail"; p.sit = false; p.inside = true; p.asleep = false; p.act = "Sailing"; }
  const d = dockOf(hb); bt.x = d.x; bt.y = d.y;
  if (bt.voy < 2 || bt.voy % 5 === 0 || by === "mayor") addLog(W, crew.map(p => p.name).join(", ") + " pushed off in the boat. " + (by === "mayor" ? "The Mayor sent them." : "They want to see what lies out there."));
  W.events.push({ k: "boat", what: "start" });
  milestone(W, "sea1", "First Voyage", "The boat leaves the harbour. The sea is no longer a wall.");
  return null;
}
function sailMove(W, bt, tx, ty, spd) {
  const step = spd * DT; const want = Math.atan2(ty - bt.y, tx - bt.x);
  for (const o of [0, .35, -.35, .7, -.7, 1.05, -1.05, 1.5, -1.5, 2.1, -2.1, 2.8]) {
    const a = want + o * bt.bias, c = Math.cos(a), s = Math.sin(a);
    if (isWater(bt.x + c * 1.8, bt.y + s * 1.8) && isWater(bt.x + c * step, bt.y + s * step)) { bt.x += c * step; bt.y += s * step; bt.hd = a; return Math.hypot(tx - bt.x, ty - bt.y) < 1.4; }
  }
  bt.bias = -bt.bias; return false;
}
function boatCrew(W, bt) { return W.S.people.filter(p => bt.crew.includes(p.id)); }
function sailFinish(W, bt, hb) {
  const S = W.S, crew = boatCrew(W, bt), d = { dx: hb.pdx || 0, dy: hb.pdy || 1 }, ext = (d.dx ? hb.a : hb.b) / 2, cx = hb.x + hb.a / 2 - d.dx * 0, cy = hb.y + hb.b / 2;
  for (const [i, p] of crew.entries()) { p.trek = 0; p.boat = 0; p.inside = false; p.pack = false; p.state = "idle"; p.t = 1; p.act = "Back from the sea"; p.x = cx + d.dx * (ext + .6 + (hb.ppk || 0)) + d.dy * (i - .5) * .8; p.y = cy + d.dy * (ext + .6 + (hb.ppk || 0)) + d.dx * (i - .5) * .8; }
  const mins = Math.max(1, Math.round((S.tick - bt.at) * DT / 60)), n = bt.found.length;
  addRes(W, homeTown(W), "food", 3 * crew.length + 4);
  if (n || bt.voy < 2 || bt.voy % 5 === 0 || bt.by === "mayor") addLog(W, "The boat is back after " + mins + " minutes. " + (n ? "The sailors found " + n + " wonder" + (n > 1 ? "s" : "") + ". " : "") + "They charted more of the sea and brought home fish.");
  W.events.push({ k: "boat", what: "end", n });
  bt.crew = []; bt.st = "dock"; bt.last = S.tick; bt.voy++; const dk = dockOf(hb); bt.x = dk.x; bt.y = dk.y; bt.trail = []; bt.legs = [];
}
function boatStep(W, bt, H) {
  const S = W.S, hb = S.b.find(q => q.id === bt.hb);
  if (!hb) { for (const p of boatCrew(W, bt)) { p.trek = 0; p.boat = 0; p.inside = false; p.state = "idle"; p.t = 1; } S.boats = S.boats.filter(q => q !== bt); return; }
  if (bt.st === "dock") return;
  if (S.tick % 4 === 0) reveal(W, bt.x, bt.y, 11);
  if (bt.st === "out") { const l = bt.trail[bt.trail.length - 1]; if (!l || Math.hypot(l.x - bt.x, l.y - bt.y) > 3) bt.trail.push({ x: bt.x, y: bt.y }); if (H >= 19.2 || H < 5.5) { bt.st = "back"; bt.rest = 0; addLog(W, "Dusk is near. The boat turns for home."); } else if (S.weather.kind === "rain") { bt.st = "back"; bt.rest = 0; addLog(W, "Dark clouds and rough water. The boat turns for home before the storm."); W.events.push({ k: "storm" }); } }
  if (bt.rest > 0) { bt.rest -= DT; return; }
  let tx, ty, final = false;
  if (bt.st === "out") { const g = bt.legs[bt.i]; if (!g) { bt.st = "back"; return; } tx = g.x; ty = g.y; }
  else { const c = bt.trail[bt.trail.length - 1]; if (c) { tx = c.x; ty = c.y; } else { const d = dockOf(hb); tx = d.x; ty = d.y; final = true; } }
  const arrived = sailMove(W, bt, tx, ty, 1.3);
  if (arrived) {
    bt.stuck = 0; bt.bd = 1e9; bt.sk = 60;
    if (bt.st === "out") { const g = bt.legs[bt.i]; bt.i++; bt.rest = g.k === "via" ? 0 : g.last ? 120 + rnd(W) * 180 : 40 + rnd(W) * 80; if (g.last || !bt.legs[bt.i]) { /* last stop */ } }
    else if (final) { sailFinish(W, bt, hb); return; } else bt.trail.pop();
    return;
  }
  bt.sk -= DT;
  if (bt.sk <= 0) {
    bt.sk = 60; const d = Math.hypot(tx - bt.x, ty - bt.y);
    if (d > bt.bd - 1.5) {
      bt.stuck++;
      if (bt.stuck >= 6 && bt.st === "back") { if (bt.trail.length) bt.trail.pop(); else if (final) { sailFinish(W, bt, hb); return; } bt.stuck = 0; }
      else if (bt.stuck >= 4 && bt.st === "out") { bt.i++; bt.stuck = 0; if (!bt.legs[bt.i]) bt.st = "back"; }
      else if (bt.stuck >= 2) bt.bias = -bt.bias;
    } else bt.stuck = 0;
    bt.bd = d;
  }
}
function boatAI(W, H) {
  const S = W.S; if (S.phase !== "settled") return;
  for (const hb of S.b) {
    if (hb.type !== "harbor" || !hb.done || hb.upTo) continue;
    let bt = S.boats.find(q => q.hb === hb.id);
    if (!bt) { const d = dockOf(hb); S.boats.push(bt = { id: S.nextId++, hb: hb.id, x: d.x, y: d.y, hd: 0, st: "dock", crew: [], voy: 0, last: S.tick - 3600, trail: [], legs: [], i: 0, rest: 0, found: [], stuck: 0, sk: 60, bd: 1e9, bias: 1, at: S.tick }); addLog(W, "A boat was launched at the " + (S.towns.length > 1 ? townOf(W, { x: hb.x, y: hb.y }).name + " " : "") + "harbour."); continue; }
    if (bt.st !== "dock" || H < 6 || H > 16.5 || S.tick - bt.last < 3600 || S.people.length < 8 || S.weather.kind === "rain") continue;
    const legs = planVoyage(W, bt, dockOf(hb)); if (!legs.length) { bt.last = S.tick; continue; }
    const err = sailLaunch(W, bt, legs, "ai"); if (err) bt.last = S.tick - 2400;
  }
}
function sailOrder(W, tx, ty) {
  const S = W.S, hb = S.b.find(b => b.type === "harbor" && b.done); if (!hb) return "Build a harbour first.";
  const bt = S.boats.find(q => q.hb === hb.id); if (!bt) return "The boat is not ready yet.";
  if (bt.st !== "dock") return "The boat is already out.";
  const d0 = dockOf(hb), d = Math.hypot(tx - d0.x, ty - d0.y); if (d < 10) return "Too close. Pick a place farther out."; if (d > 260) return "Too far for one trip.";
  const G = seaBFS(W, d0, Math.min(270, d + 24)); let best = null, bd = 1e9;
  for (const c of G.list) { const dd = Math.hypot(c.cx * SG + 2 - tx, c.cy * SG + 2 - ty); if (dd < bd) { bd = dd; best = c; } }
  if (!best || bd > 14) return "The boat cannot get there by sea.";
  const legs = seaRouteTo(best), T = legs[legs.length - 1], a0 = rnd(W) * 6.28;
  for (let i = 0; i < 2; i++) { const q = dryNearWater(T.x + Math.cos(a0 + i * 3.1) * 9, T.y + Math.sin(a0 + i * 3.1) * 9); if (q && seaCell(W, Math.floor(q.x / SG), Math.floor(q.y / SG))) legs.push({ x: q.x, y: q.y, k: "leg" }); }
  return sailLaunch(W, bt, legs, "mayor");
}
function boatDiscover(W) {
  const S = W.S;
  for (const bt of S.boats) {
    if (bt.st === "dock" || !bt.crew.length) continue; const p = S.people.find(q => q.id === bt.crew[0]); if (!p) continue;
    const rx = Math.floor(bt.x / RG), ry = Math.floor(bt.y / RG);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const w = wonderIn(W, rx + i, ry + j); if (!w || Math.hypot(w.x - bt.x, w.y - bt.y) > 12 || S.wonders.some(q => q.id === w.id)) continue; foundWonder(W, w, p); bt.found.push(w.id); bt.rest = Math.max(bt.rest, 90); }
    treasureCheck(W, p, bt.x, bt.y, 9);
  }
}
// ---------- the whole world, one tick ----------
export function pathAt(S, d) { const P = S.wagon.path; if (!P) return { x: S.wagon.x, y: S.wagon.y }; const i = clamp(Math.floor(d / .25), 0, P.length - 1); return P[i]; }
// several worlds can live in one page (e.g. while resyncing); terrain helpers follow the active one
export function activate(W) { if (ACTIVE === W) return; ACTIVE = W; ISLC = new Map(); GVN = W.gvn || 0; SX = W.sx; SY = W.sy; DX = W.dx; DY = W.dy; OVER = W.over; ROAD = W.road; }
export function step(W) {
  activate(W);
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
      for (const p of S.people) if (!p.boat && p.state !== "sail" && isWater(p.x, p.y)) { const q = dryNear(p.x, p.y); if (q) { p.x = q.x; p.y = q.y; p.blk = 0; W.rt.delete(p.id); } } // nobody stays in a lake: lead them to the shore
      for (const ch of W.chunks.values()) {
        if (ch.worn !== false) { const wr = ch.wear; let any = false; for (let k = 0; k < wr.length; k++) { const o = wr[k]; if (o) { const n = o > 9 ? o - 9 : 0; wr[k] = n; if (n) any = true; if (((o / WK * 14) | 0) !== ((n / WK * 14) | 0)) W.dirtyGround.push(ch, k); } } ch.worn = any; }
        for (const t of ch.trees) {
          if (!t.felled || t.gone) continue;
          if (t.sapling) { t.regrow -= 5; if (t.regrow <= 0) { t.felled = false; t.sapling = false; t.logs = LOGS_OF[t.t] || 3; ch.ovDirty = true; } }
          else {
            // an old stump sprouts again (most of them), or rots away: the forest never runs out for good
            t.rot = (t.rot || 0) + 5;
            if (t.cleared) { t.gone = true; ch.ovDirty = true; }
            else if (t.rot >= (nearVillage(W, t.x, t.y) ? 7200 : 28800)) {
              if (ih(Math.floor(t.x * 17) + SX, Math.floor(t.y * 13) + SY) < .92 && plantable(W, t.x, t.y, t)) { t.sapling = true; t.regrow = 1800; t.rot = 0; } else t.gone = true;
              ch.ovDirty = true;
            }
          }
        }
        for (const r of ch.rocks) if (r.regrow > 0) { r.regrow -= 5; if (r.regrow <= 0) { if (openGround(W, r.x, r.y) && ih(Math.floor(r.x * 11) + SY, Math.floor(r.y * 19) + SX) < .7) { r.stone = r.big ? 3 : 2; ch.ovDirty = true; } else r.regrow = 0; } }
        for (const b of ch.bushes) if (b.regrow > 0) { b.regrow -= 5; if (b.regrow <= 0) b.berries = 3; }
      }
      // fields grow (not in winter)
      for (const f of S.b) if (f.done && f.type === "field" && (f.stage === 1 || f.stage === 2)) {
        f.grow += sea === "winter" ? 0 : sea === "autumn" ? 3.5 : 5; const st = f.grow >= 5000 ? 3 : f.grow >= 2000 ? 2 : 1;
        if (st !== f.stage) { f.stage = st; if (st === 3) { f.left = CROPS[f.crop].yield; } W.events.push({ k: "field", b: f }); }
      }
    }
    S.eatT += DT; if (S.eatT > 300) {
      S.eatT = 0;
      for (const T of (S.towns.length ? S.towns : [null])) {
        const R = resOf(S, T), need = S.people.filter(p => !p.asleep && !p.pioneer && (!T || townOf(W, p).id === T.id)).length, was = T ? T.hungry : S.hungry;
        let hung;
        if (R.food >= need) { R.food -= need; hung = false; } else { R.food = 0; hung = true; if (!was) addLog(W, (S.towns.length > 1 ? "Food is running low in " + T.name + "." : "Food is running low.") + " Everyone works a little slower."); }
        if (T) T.hungry = hung; else S.hungry = hung;
      }
      if (S.towns.length) S.hungry = S.towns.some(t => t.hungry);
    }
    if (S.rally) { S.rally.t += DT; if (S.rally.t > 120) { addLog(W, "The rally is over. Everyone goes back to their own work."); S.rally = null; } }
    S.roleT -= DT; if (S.roleT <= 0) { S.roleT = 20; assignRoles(W); }
    if (S.tick % 40 === 0) { discoverCheck(W); if (S.boats.length) boatDiscover(W); }
    S.trekT -= DT; if (S.trekT <= 0) { S.trekT = 60; trekAI(W, H); }
    S.boatT -= DT; if (S.boatT <= 0) { S.boatT = 30; boatAI(W, H); }
    for (const bt of S.boats.slice()) boatStep(W, bt, H);
    S.planT -= DT; if (S.planT <= 0) { S.planT = 150; plan(W); }
    S.marketT -= DT; if (S.marketT <= 0) { S.marketT = 60; marketUpdate(W); }
    S.tradeT -= DT; if (S.tradeT <= 0) { S.tradeT = 45; tradeAI(W, H); }
    // newcomers
    S.arriveT -= DT;
    if (S.arriveT <= 0) {
      S.arriveT = 60; const n = S.people.length;
      const hid = homeFor(W), hb0 = hid && S.b.find(b => b.id === hid), tn = hb0 ? S.towns.find(t => t.id === hb0.town) || S.towns[0] : null, tR = hb0 ? resOf(S, tn) : S.res, nT = tn ? S.people.filter(q => townOf(W, q).id === tn.id).length : n;
      if (hid && tR.food >= 12 + nT * 2 && !night(H)) {
        const e = W.trail.find(q => !hidden(W, q.x, q.y)) || { x: 0, y: 0 }, p = newPerson(W, e.x, e.y), cm = camp(W), c = cm ? doorOf(cm) : { x: 0, y: 0 };
        p.state = "arrive"; p.tx = c.x; p.ty = c.y; p.act = "Arriving in the village"; p.home = hid; p.role = "wood";
        S.people.push(p); S.arriveT = (900 + n * 240) * (tR.food >= capT(W, tn) * .5 ? .6 : 1) * (1 - Math.min(.5, (S.renown || 0) * .05 + wonderBonus(S, "come")));
        addLog(W, p.name + " (" + p.trait + ") arrived and wants to live here.");
        W.events.push({ k: "arrive", p });
        if (!S.rumor && !S.trek && S.people.length >= 7 && rnd(W) < .35) makeRumor(W);
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
    if (S.tick % 40 === 0 && (!S.ms.swamp || !S.ms.tundra || !S.ms.grove)) for (const p of S.people) {
      if (!S.ms.swamp && swampV(p.x, p.y) > 0) milestone(W, "swamp", "The Bog", "The villagers waded into a bog. Cranberries grow among the reeds.");
      else if (!S.ms.tundra && tundraV(p.x, p.y) > 0) milestone(W, "tundra", "Frozen Lands", "The snow here never melts. Only frost spruces grow.");
      else if (!S.ms.grove && groveV(p.x, p.y) > 0) milestone(W, "grove", "Golden Grove", "Maples and larches glow red and gold, in every season.");
    }
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
// ---------- the market: prices follow supply and demand, villagers carry goods between settlements ----------
const ratioOf = (W, T, k) => resOf(W.S, T)[k] / capT(W, T);
const townPop = (W, T) => W.S.people.filter(p => !p.pioneer && townOf(W, p).id === T.id).length;
// what a settlement would pay for 1,000 units: little when the storehouse is full, a lot when it is nearly empty
export function localPrice(W, T, k) {
  const R = resOf(W.S, T), cap = capT(W, T), want = k === "food" ? Math.max(cap * .35, townPop(W, T) * 10) : cap * .4;
  return Math.max(.25, Math.min(4, Math.pow(want / Math.max(R[k], want * .05), .8)));
}
function marketUpdate(W) {
  const S = W.S; if (!S.towns.length) return;
  for (const k of KINDS) { let sum = 0; for (const T of S.towns) sum += localPrice(W, T, k); const avg = sum / S.towns.length; S.price[k] = Math.round((S.price[k] + (avg - S.price[k]) * .3) * 1000) / 1000; }
}
function tradeAbort(W, p) { const S = W.S, t = p.trade; p.trade = null; if (!t) return; const from = S.towns.find(x => x.id === t.from); if (from) addRes(W, from, t.k, t.amt); }
function tradeDeliver(W, p) {
  const S = W.S, t = p.trade; p.trade = null; if (!t) return;
  const to = S.towns.find(x => x.id === t.to), from = S.towns.find(x => x.id === t.from);
  if (!to || !from) { if (from) addRes(W, from, t.k, t.amt); return; }
  addRes(W, to, t.k, t.amt);
  const pay = t.amt * t.price / 1000, fee = pay * .05, r4 = v => Math.round(v * 10000) / 10000;
  to.coin = r4((to.coin || 0) - pay); from.coin = r4((from.coin || 0) + pay - fee);
  const tr = S.trade; tr.n++; tr.coins = r4(tr.coins + pay); tr.tax = r4(tr.tax + fee); tr.vol[t.k] += t.amt;
  const key = Math.min(t.from, t.to) + "-" + Math.max(t.from, t.to), n = S.pact[key] = (S.pact[key] || 0) + 1, word = { food: "food", wood: "wood", stone: "stone" }[t.k];
  if (n === 1) { addLog(W, from.name + " sent " + word + " to " + to.name + ", and " + to.name + " paid for it. The two villages traded for the first time."); milestone(W, "trade1", "Trade Begins", "Villagers carry goods from the village that has plenty to the village that is short. The market sets the prices."); }
  else if (n === 12) addLog(W, from.name + " and " + to.name + " trade often now. People greet each other on the road.");
  else if (n === 40) addLog(W, from.name + " and " + to.name + " are close friends. Nobody remembers a quarrel between them.");
  W.events.push({ k: "trade", x: p.x, y: p.y, type: t.k, amt: t.amt });
}
// every minute or so: where one settlement is short of something and another has plenty, a villager carries a load across
function tradeAI(W, H) {
  const S = W.S; if (S.towns.length < 2 || H < 6.5 || H > 16) return;
  const flying = S.people.filter(p => p.trade);
  for (const k of KINDS) {
    let buyer = null, br = .3;
    for (const T of S.towns) { const r = ratioOf(W, T, k); if (r < br && (T.coin || 0) > -3 && !flying.some(p => p.trade.to === T.id && p.trade.k === k)) { br = r; buyer = T; } }
    if (!buyer) continue;
    let seller = null, sr = .55;
    for (const T of S.towns) { if (T === buyer) continue; const r = ratioOf(W, T, k), d = Math.hypot(T.x - buyer.x, T.y - buyer.y); if (r > sr && r - br >= .3 && d < TRADE_REACH && !((W.unr.get("t" + T.id + ">" + buyer.id) || 0) > S.tick)) { sr = r; seller = T; } }
    if (!seller) continue;
    const sR = resOf(S, seller), bR = resOf(S, buyer), amt = Math.min(24, Math.floor(sR[k] - capT(W, seller) * .45), Math.floor(capT(W, buyer) * .5 - bR[k]));
    if (amt < 6) continue;
    const cand = S.people.filter(p => !p.pioneer && !p.watch && !p.trek && !p.carry && !p.trade && !p.asleep && !p.inside && p.role !== "build" && (p.state === "idle" || p.state === "wait") && townOf(W, p).id === seller.id);
    if (!cand.length) continue;
    const p = cand[(rnd(W) * cand.length) | 0], dest = S.b.find(b => b.done && b.town === buyer.id && b.type === "store") || hallOf(W, buyer); if (!dest) continue;
    const d = doorOf(dest), price = Math.round((localPrice(W, seller, k) + localPrice(W, buyer, k)) / 2 * 1000) / 1000;
    sR[k] -= amt; p.trade = { to: buyer.id, from: seller.id, k, amt, price };
    p.obj = null; p.job = "trade"; p.state = "go"; p.goT = 0; p.pack = true; p.tx = d.x + (rnd(W) - .5); p.ty = d.y; p.act = "Carrying " + amt + " " + k + " to " + buyer.name;
    return;
  }
}
// ---------- new settlements: some villagers leave to found a village far away ----------
// A new settlement needs a reason and a known land. It only goes where the people have already been (the land around it and the way
// to it are explored), far from the other villages, and either next to a wonder (which then gives that village a gift) or in a
// place that is rich in timber, stone or fertile land.
// Towns are far apart: a few hundred steps, a real journey on foot (about 6 minutes for one town to reach the next).
const TOWN_GAP = 400, WONDER_GAP = 260, TOWN_REACH = 640, TRADE_REACH = 700;
const WFX_PCT = 30; // a village beside a wonder gets +30% of what that wonder gives (or +12% walking speed)
export const townBonus = (T, f) => (T && T.fx === f) ? (f === "speed" ? .12 : f === "come" ? 0 : WFX_PCT / 100) : 0;
function exploredFrac(W, x, y, r) {
  let n = 0, t = 0; const pts = [[0, 0]]; for (let i = 0; i < 6; i++) pts.push([Math.cos(i * 1.047) * r * .5, Math.sin(i * 1.047) * r * .5]); for (let i = 0; i < 8; i++) pts.push([Math.cos(i * .785) * r, Math.sin(i * .785) * r]);
  for (const [dx, dy] of pts) { t++; if (!hidden(W, x + dx, y + dy)) n++; } return n / t;
}
function corridorHidden(W, a, b) {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L; let h = 0, n = 0;
  for (let k = 1; k < 12; k++) for (const o of [-4, 0, 4]) { const x = a.x + (b.x - a.x) * k / 12 + nx * o, y = a.y + (b.y - a.y) * k / 12 + ny * o; if (isWater(x, y)) continue; n++; if (hidden(W, x, y)) h++; }
  return n ? h / n : 0;
}
function siteOk(W, x, y, blind) {
  if (wet(x, y) || isWater(x, y) || heightAt(x, y) > 22 || (!blind && hidden(W, x, y))) return false;
  for (let j = -2; j <= 2; j += 2) for (let k = -2; k <= 2; k += 2) if (wet(x + k, y + j) || lakeV(x + k, y + j) > .62 || steep(x + k, y + j, x + k + 1, y + j) || steep(x + k, y + j, x + k, y + j + 1)) return false;
  return true;
}
function townSite(W) {
  const S = W.S; let best = null;
  const nearestTown = (x, y) => S.towns.reduce((a, t) => Math.hypot(t.x - x, t.y - y) < Math.hypot(a.x - x, a.y - y) ? t : a, S.towns[0]);
  const gapOk = (x, y, g) => S.towns.every(q => Math.hypot(q.x - x, q.y - y) >= g);
  // 1) beside a wonder that no village uses yet
  const wl = [], rl = [];
  for (const w of S.wonders) {
    if (!WONDERS[w.k] || S.towns.some(t => t.wid === w.id)) continue;
    for (let i = 0; i < 12; i++) for (const r of [8, 10, 12]) {
      const a = i / 12 * Math.PI * 2 + (w.x % 7) * .3, x = w.x + Math.cos(a) * r, y = w.y + Math.sin(a) * r;
      if (!gapOk(x, y, WONDER_GAP) || !siteOk(W, x, y)) continue;
      const from = nearestTown(x, y), d = Math.hypot(from.x - x, from.y - y); if (d > TOWN_REACH) continue;
      if (exploredFrac(W, x, y, 8) < .55 || corridorHidden(W, from, { x, y }) > (d > 150 ? .6 : .35)) continue;
      let water = false; for (let q = 0; q < 8 && !water; q++) for (let dd = 3; dd <= 10; dd += 3) if (wet(x + Math.cos(q * .785) * dd, y + Math.sin(q * .785) * dd)) { water = true; break; }
      const sc = 20 - d / 60 + (water ? 1.5 : 0) - r * .1;
      wl.push({ x, y, sc, from, wonder: w, why: "next to " + WONDERS[w.k].name });
    }
  }
  wl.sort((a, b) => b.sc - a.sc); for (const c of wl.slice(0, 4)) if (landRoute(W, c.from, c)) return c;
  // 2) a rich place in land the people already know: scan the known land on a grid, cheap tests first
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const t of S.towns) { x0 = Math.min(x0, t.x); x1 = Math.max(x1, t.x); y0 = Math.min(y0, t.y); y1 = Math.max(y1, t.y); }
  const cands = [];
  for (let y = Math.floor((y0 - TOWN_REACH) / 12) * 12; y <= y1 + TOWN_REACH; y += 12) for (let x = Math.floor((x0 - TOWN_REACH) / 12) * 12; x <= x1 + TOWN_REACH; x += 12) {
    if (hidden(W, x, y)) continue;
    const t = nearestTown(x, y), d = Math.hypot(t.x - x, t.y - y); if (d > TOWN_REACH || !gapOk(x, y, TOWN_GAP) || !siteOk(W, x, y)) continue;
    if (exploredFrac(W, x, y, 10) < .7 || corridorHidden(W, t, { x, y }) > (d > 150 ? .6 : .25)) continue;
    cands.push({ x, y, t, d });
  }
  for (const c of cands) {
    const { x, y, t, d } = c; let water = false;
    for (let q = 0; q < 8 && !water; q++) for (let dd = 3; dd <= 12; dd += 3) if (wet(x + Math.cos(q * .785) * dd, y + Math.sin(q * .785) * dd)) { water = true; break; }
    let tr = 0, rk = 0, bu = 0;
    for (let cy = Math.floor((y - 10) / C); cy <= Math.floor((y + 10) / C); cy++) for (let cx = Math.floor((x - 10) / C); cx <= Math.floor((x + 10) / C); cx++) {
      const ch = getChunk(W, cx, cy, true);
      for (const o of ch.trees) if (Math.abs(o.x - x) < 10 && Math.abs(o.y - y) < 10) tr++;
      for (const o of ch.rocks) if (Math.abs(o.x - x) < 12 && Math.abs(o.y - y) < 12) rk++;
      for (const o of ch.bushes) if (Math.abs(o.x - x) < 10 && Math.abs(o.y - y) < 10) bu++;
    }
    const sc = -(d - TOWN_GAP) * .004 + (water ? 3 : 0) + Math.min(tr, 30) / 10 + (rk ? 1.2 : 0) + Math.min(bu, 6) / 4 + (flowerV(x, y) > .45 || birchV(x, y) > .45 ? .8 : 0);
    if (sc < 5) continue; // not worth leaving home for
    const why = rk >= 4 ? "in rocky hills with plenty of stone" : tr >= 24 ? "in a forest full of timber" : water && bu >= 2 ? "on fertile land by the water" : water ? "by the water" : "on good open land";
    rl.push({ x, y, sc, from: t, why });
  }
  rl.sort((a, b) => b.sc - a.sc); for (const c of rl.slice(0, 4)) if (landRoute(W, c.from, c)) return c;
  return null;
}
function landRoute(W, a, b) { const r = findRoute(W, a.x, a.y, b.x, b.y); return !!r.pts || r.fail === "cap"; }
function expeditions(W) {
  const S = W.S, n = S.people.length;
  if (S.exp) {
    const e = S.exp, mem = S.people.filter(p => e.members.includes(p.id)), lead = mem[0];
    const there = mem.filter(p => p.state === "camp").length, late = S.tick - e.at > 28800;
    if (!lead) { S.exp = null; return; }
    if (there >= Math.min(2, mem.length) || late) {
      const need = (e.wid ? WONDER_GAP : TOWN_GAP) * .9, tooNear = S.towns.some(t => Math.hypot(t.x - lead.x, t.y - lead.y) < need);
      const site = tooNear ? null : findSite(W, "outpost", lead.x, lead.y, 0, 9);
      if (!site) { if (late) { for (const p of mem) { p.state = "idle"; p.pioneer = 0; } S.exp = null; S.lastFound = S.tick; addLog(W, "The pioneers found no good place and came back."); } return; }
      const id = S.towns.length + 1, name = e.name, b = addBuilding(W, "outpost", site.x, site.y, "ai"); b.done = true;
      const src0 = S.towns.find(t => t.name === e.from) || S.towns[0], SR0 = resOf(S, src0), pack = { food: 0, wood: 0, stone: 0 };
      for (const [k, v] of [["food", 40], ["wood", 30], ["stone", 10]]) { const q = Math.max(0, Math.min(v, Math.floor(SR0[k] * .5))); SR0[k] -= q; pack[k] = q; }
      const T2 = { id, name, hall: b.id, x: b.x + 1.5, y: b.y + 1.5, at: S.tick, coin: 0, hungry: false, res: pack, why: e.why || "" };
      if (e.wid) { const wd = S.wonders.find(q => q.id === e.wid); if (wd && WONDERS[wd.k]) { T2.wid = wd.id; T2.fx = WONDERS[wd.k].fx; T2.wk = wd.k; } }
      S.towns.push(T2); b.town = id;
      for (const ch of W.chunks.values()) for (const tr of ch.trees) if (!tr.felled && Math.hypot(tr.x - b.x - 1.5, tr.y - b.y - 1.5) < 3.5) { tr.felled = true; tr.cleared = true; ch.ovDirty = true; }
      reveal(W, b.x + 1.5, b.y + 1.5, 12);
      { const L = Math.max(1, Math.round(Math.hypot(b.x - e.fx, b.y - e.fy) / 5)); for (let k = 1; k < L; k++) reveal(W, e.fx + (b.x - e.fx) * k / L, e.fy + (b.y - e.fy) * k / L, 8); } // the road there is no longer a mystery
      S.wantLand = 0;
      for (const p of mem) { p.home = b.id; p.state = "idle"; p.pioneer = 0; p.t = 1 + rnd(W) * 2; }
      S.exp = null; S.lastFound = S.tick;
      addLog(W, "The pioneers founded " + name + (e.why ? " " + e.why : "") + ", " + Math.round(Math.hypot(b.x - e.fx, b.y - e.fy)) + " steps from " + e.from + "." + (T2.fx ? " The village will have " + wonderFxTown(T2) + "." : ""));
      milestone(W, "town2", "A New Settlement", name + " was founded by pioneers. Villagers will walk between the villages and roads will grow.");
      W.events.push({ k: "town", name, x: b.x + 1.5, y: b.y + 1.5 });
    }
    return;
  }
  if (S.phase !== "settled") return;
  // a full storehouse means the village has outgrown its valley: new settlements follow sooner (at least ~2.5 to 5 hours apart)
  const need = 12 + 6 * (S.towns.length - 1), since = S.tick - (S.lastFound || 0), full = S.towns.some(t => KINDS.filter(k => resOf(S, t)[k] >= capT(W, t) * .8).length >= 2), gap = full ? 36000 : 72000;
  if (n < need || since < gap || S.towns.length >= 10) return;
  const site = townSite(W); if (!site) { S.lastFound = S.tick - gap + 9000; S.wantLand = S.tick; return; } // nothing known is worth it yet: send explorers first
  const src = site.from, cand = S.people.filter(p => townOf(W, p).id === src.id && !p.carry && p.state !== "sleep" && p.role !== "build" && !p.watch && !p.trek);
  if (cand.length < 6) return;
  const mem = cand.slice(-3), used = new Set(S.towns.map(t => t.name)), names = TOWN_NAMES.filter(q => !used.has(q)), name = names[(rnd(W) * names.length) | 0] || "Newtown " + (S.towns.length + 1);
  S.exp = { members: mem.map(p => p.id), x: site.x, y: site.y, at: S.tick, name, from: src.name, fx: src.x, fy: src.y, why: site.why, wid: site.wonder ? site.wonder.id : 0 };
  for (const [i, p] of mem.entries()) { p.obj = null; p.carry = null; p.pack = true; p.state = "pioneer"; p.pioneer = 1; p.tx = site.x + (i - 1) * .8; p.ty = site.y + (i % 2) * .6; p.act = "Pioneer: looking for new land"; p.sit = false; p.inside = false; }
  addLog(W, mem.map(p => p.name).join(", ").replace(/, ([^,]*)$/, " and $1") + " packed their things and set off to settle " + site.why + ".");
  W.events.push({ k: "milestone", title: "Pioneers", txt: "Three villagers set off to found a new settlement." });
}
function arrive(W) {
  const S = W.S, t = S.target; S.phase = "settled";
  S.towns = [];
  const cm = addBuilding(W, "camp", t.x - 1.5, t.y - 1.5, "ai"); cm.done = true;
  S.towns.push({ id: 1, name: TOWN_NAMES[S.seed % TOWN_NAMES.length], hall: cm.id, x: cm.x + 1.5, y: cm.y + 1.5, at: S.tick, coin: 0, hungry: false }); cm.town = 1; S.lastFound = S.tick;
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
  activate(W); const S = W.S;
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
    const c0 = b.cost0 || TYPES[b.type].cost; { const TR = townRes(S, b.town); for (const k in c0) TR[k] += (c0[k] - (b.need[k] || 0)); }
    occupy(W, b, false); S.b.splice(S.b.indexOf(b), 1); for (const p of S.people) if (p.obj && p.obj.b === b.id) { p.obj = null; p.state = "idle"; p.t = .5; }
    addLog(W, "The Mayor cancelled " + an(T.name) + "."); W.events.push({ k: "removed", b }); S.rev++; return null;
  }
  if (a.k === "crop") {
    const b = S.b.find(q => q.id === a.id); if (!b || b.type !== "field" || !CROPS[a.crop]) return "Not a field.";
    b.crop = a.crop; b.auto = false; addLog(W, "The Mayor wants " + CROPS[a.crop].name.toLowerCase() + " on a field."); W.events.push({ k: "field", b }); S.rev++; return null;
  }
  if (a.k === "rally") {
    if (a.type === "off") { if (S.rally) { S.rally = null; addLog(W, "The Mayor called off the rally."); S.rev++; } return null; }
    if (S.phase !== "settled" || !["wood", "food", "stone", "build"].includes(a.type)) return "Not now.";
    S.rally = { type: a.type, t: 0 }; addLog(W, "The Mayor called: all hands on " + a.type + "!");
    milestone(W, "rally", "First Rally", "Your people answered the call.");
    for (const p of S.people) if (p.state === "idle" || (p.state === "go" && p.job === "rest") || (p.state === "work" && p.job === "rest")) { p.obj = null; p.sit = false; p.state = "idle"; p.t = rnd(W) * .6; }
    S.rev++; return null;
  }
  if (a.k === "trek") { activate(W); const err = trekLaunch(W, +a.x, +a.y, "mayor"); if (err) return err; S.rev++; return null; }
  if (a.k === "trekcancel") return trekRecall(W);
  if (a.k === "sail") { activate(W); const err = sailOrder(W, +a.x, +a.y); if (err) return err; S.rev++; return null; }
  if (a.k === "sailcancel") { const bt = S.boats.find(q => q.st === "out"); if (!bt) return "The boat is not out."; bt.st = "back"; bt.rest = 0; addLog(W, "The Mayor called the boat back."); S.rev++; return null; }
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
    const tf = []; ch.trees.forEach(t => { if (t.felled || t.logs < 3 || t.gone || t.i >= ch.nb) tf.push([t.i, t.felled ? 1 : 0, t.logs, Math.round(t.regrow || 0), t.cleared ? 1 : 0, t.sapling ? 1 : 0, t.gone ? 1 : 0, Math.round(t.rot || 0)]); }); if (tf.length) { o.t = tf; any = true; }
    if (ch.trees.length > ch.nb) { o.n = ch.trees.slice(ch.nb).map(t => [Math.round(t.x * 100) / 100, Math.round(t.y * 100) / 100, t.t, Math.round(t.s * 100) / 100, Math.round(t.v * 100) / 100]); any = true; }
    const rs = []; ch.rocks.forEach(r => { const full = r.big ? 6 : 2; if (r.stone !== full || r.regrow > 0) rs.push([r.i, r.stone, Math.round(r.regrow || 0)]); }); if (rs.length) { o.r = rs; any = true; }
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
  if (o.n) for (const [x, y, tt, sz, v] of o.n) ch.trees.push({ x, y, t: tt, s: sz, v, logs: 3, felled: true, regrow: 0, cleared: false, sapling: true, i: ch.trees.length, _k: ch.k, planted: true });
  if (o.t) for (const [i, f, l, r, c, sp, g, rot] of o.t) { const t = ch.trees[i]; if (t) { t.felled = !!f; t.logs = l; t.regrow = r; t.cleared = !!c; t.sapling = !!sp; t.gone = !!g; t.rot = rot || 0; } }
  if (o.r) for (const [i, s, rg] of o.r) { if (ch.rocks[i]) { ch.rocks[i].stone = s; ch.rocks[i].regrow = rg || 0; } }
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
