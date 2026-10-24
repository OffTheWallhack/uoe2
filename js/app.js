// ============================================================
// Usage of Empires II — app: modes (live / sandbox), UI, input, network.
// ============================================================
import * as M from "./sim.js";
import * as G from "./render.js";
import { CONFIG } from "./config.js";
import { icon, iconEl } from "./icons.js";
import * as SND from "./sound.js";
const $ = id => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const LIVE = !!CONFIG.url && !qs.has("sandbox");
let ownerKey = null;
try { const h = new URLSearchParams(location.hash.slice(1)); if (h.get("owner")) { localStorage.setItem("uoe2-owner", h.get("owner")); history.replaceState(null, "", location.pathname + location.search); } ownerKey = localStorage.getItem("uoe2-owner"); } catch (e) { }
const OWNER = !LIVE || !!ownerKey;
let W = null, speed = 1, acc = 0, mode = null, buildType = null, selId = 0, lastFull = 0, lastPoll = 0, busyAct = false, seenKey = LIVE ? "uoe2-seen-live" : "uoe2-seen-sandbox";
const view = G.view; let envAcc = 0; view.sfx = SND.sfx;
function soundEnv() {
  const S = W.S, clk = M.clockOf(S), hour = view.hourOverride ?? clk.hour, wk = view.weatherOverride || S.weather.kind, wx = (view.cam.x / 8 + view.cam.y / 4) / 2, wy = (view.cam.y / 4 - view.cam.x / 8) / 2, night = G.nightOf(hour);
  SND.setEnv({ night, day: 1 - night, rain: wk === "rain" ? 1 : 0, snow: wk === "snow" ? 1 : 0, water: M.isWater(wx, wy) || M.isWater(wx + 6, wy + 6) ? 1 : 0, warm: M.seasonOf(clk.month) === "winter" ? 0 : 1, frozen: M.tundraV(wx, wy) > 0 ? 1 : 0 });
}
for (const ev of ["pointerdown", "keydown"]) window.addEventListener(ev, () => SND.initSound(), { once: true });
const ZOOMS = [5, 4, 3, 2, 1, .75, .5, .33, .25];
// ---------- gzip helpers ----------
async function gz64(str) { const cs = new Blob([str]).stream().pipeThrough(new CompressionStream("gzip")); const buf = new Uint8Array(await new Response(cs).arrayBuffer()); let s = ""; for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode.apply(null, buf.subarray(i, i + 8192)); return btoa(s); }
async function ungz64(b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const ds = new Blob([u]).stream().pipeThrough(new DecompressionStream("gzip")); return await new Response(ds).text(); }
// ---------- network (live) ----------
const H = () => ({ apikey: CONFIG.key, Authorization: "Bearer " + CONFIG.key });
async function fetchMeta() { const r = await fetch(CONFIG.url + "/rest/v1/uoe2_world?id=eq." + CONFIG.world + "&select=rev,ver,tick,saved_at", { headers: H() }); const j = await r.json(); return j[0]; }
async function fetchFull() { const r = await fetch(CONFIG.url + "/rest/v1/uoe2_world?id=eq." + CONFIG.world + "&select=state,rev,ver", { headers: H() }); const j = await r.json(); if (!j[0]) throw new Error("No world yet"); return { S: JSON.parse(await ungz64(j[0].state)), rev: j[0].rev, ver: j[0].ver }; }
async function callFn(body) { const r = await fetch(CONFIG.url + "/functions/v1/" + CONFIG.fn, { method: "POST", headers: { ...H(), "Content-Type": "application/json" }, body: JSON.stringify(body) }); return r.json(); }
let liveRev = -1, liveVer = -1;
async function syncFull(first) {
  const { S, rev, ver } = await fetchFull(); liveRev = rev; liveVer = ver;
  const nw = M.load(S); const target = M.tickNow(nw.S, Date.now()); M.advance(nw, target, first ? 4800 : 4800);
  const old = W; W = nw; G.setWorld(W, old); lastFull = Date.now(); renderLog(true);
}
async function poll() {
  try { const m = await fetchMeta(); if (!m) return; if (m.rev !== liveRev || Date.now() - lastFull > 300000) await syncFull(false); $("net").textContent = "live"; $("net").className = "net ok"; }
  catch (e) { $("net").textContent = "offline"; $("net").className = "net bad"; }
}
// ---------- actions ----------
async function doAct(a) {
  if (!OWNER) return;
  if (!LIVE) { const err = M.act(W, a); if (err) say(err); else afterAct(a); return; }
  if (busyAct) return; busyAct = true; $("busyact").hidden = false;
  try { const r = await callFn({ op: "act", key: ownerKey, action: a }); if (r.error) say(r.error); else { await syncFull(false); afterAct(a); } }
  catch (e) { say("Could not reach the server. Try again."); }
  busyAct = false; $("busyact").hidden = true;
}
function afterAct(a) { if (a.k === "trek" || a.k === "sail") { exploreMode = false; view.ghost = null; showPlace(false); gridSig = ""; } if (a.k === "trekcancel") gridSig = ""; if (a.k === "place") { buildType = null; view.ghost = null; showPlace(false); gridSig = ""; } if (a.k === "settle") { view.ghost = null; $("settlebar").hidden = true; mode = "follow"; } refreshSel(); }
function say(t) { feed("💬", t); }
// ---------- sandbox persistence ----------
function saveSandbox(idle) { if (LIVE || !W) return; if (idle && window.requestIdleCallback) { requestIdleCallback(() => saveSandbox(), { timeout: 3000 }); return; } try { localStorage.setItem("uoe2-sandbox", JSON.stringify(M.serialize(W))); } catch (e) { } }
// the test world has its own clock: real time plus a shift that can be moved (and that fast-forward carries along)
function setClock(S, hour, nearest) {
  const cur = M.clockOf(S).hour; let d = nearest ? ((hour - cur + 36) % 24) - 12 : (hour - cur + 24) % 24; if (!nearest && d < .02) d = 24;
  S.clockShift = (S.clockShift || 0) + d * 3600000; S.t0 += d * 3600000;
}
function newSandbox(seed) { W = M.createWorld(seed, Date.now()); setClock(W.S, 7.5, true); G.setWorld(W); centerOn(W.S.wagon.x, W.S.wagon.y); renderLog(true); }
// ---------- UI ----------
let gridMode = "main", gridSig = "", selKey = null;
function toast(title, txt) { feed(title ? "🏆" : "💬", title || txt, title ? txt : ""); }
// small "kill feed" in the top-left corner: one line per event, fades on its own, tap to dismiss
function feed(emo, txt, more) {
  const box = $("kf"), li = document.createElement("li"), e = document.createElement("span"), t = document.createElement("span");
  e.className = "e"; e.textContent = emo; t.textContent = txt; li.append(e, t); if (more) li.title = more;
  li.addEventListener("click", ev => { ev.stopPropagation(); li.remove(); });
  box.prepend(li); while (box.children.length > 5) box.lastChild.remove();
  setTimeout(() => li.classList.add("out"), 7000); setTimeout(() => li.remove(), 7800);
}
function banner(t, sub) { const b = $("banner"); b.textContent = ""; if (!t) { b.hidden = true; return; } b.hidden = false; const s = document.createElement("span"); s.textContent = t; b.appendChild(s); if (sub) { const i = document.createElement("i"); i.textContent = sub; b.appendChild(i); } }
function hhmm(h) { const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0"); }
const cap1 = s => s[0].toUpperCase() + s.slice(1);
for (const im of document.querySelectorAll("img[data-ic]")) im.src = icon(im.dataset.ic, 2);
function renderLog(force) {
  const S = W.S, ul = $("feed"); const sig = String(S.log.length) + ":" + (S.log[0] && S.log[0].tk); if (!force && ul.dataset.n === sig) return;
  ul.dataset.n = sig; ul.textContent = "";
  for (const l of S.log.slice(0, 40)) { const li = document.createElement("li"), b = document.createElement("b"); b.textContent = hhmm(M.clockOf(S, l.tk).hour); li.append(b, document.createTextNode(l.t)); ul.appendChild(li); }
}
function ui() {
  const S = W.S, cap = S.towns.length > 1 ? M.capOf(W) + "×" + S.towns.length : M.capOf(W), beds = M.bedsTotal(W), TR = M.totalRes(S), coins = S.towns.reduce((n, t) => n + (t.coin || 0), 0);
  $("rfood").textContent = Math.round(TR.food); $("rwood").textContent = Math.round(TR.wood); $("rstone").textContent = Math.round(TR.stone);
  $("coinr").hidden = !(S.phase === "settled" && (coins > 0.0049 || S.trade.n)); $("rcoin").textContent = coins.toFixed(coins < 10 ? 2 : 1); $("cap").parentElement.hidden = !$("coinr").hidden; $("rpop").textContent = S.people.length + (S.phase === "settled" ? "/" + beds : "");
  $("cap").textContent = cap; $("food").classList.toggle("low", S.hungry);
  const clk = M.clockOf(S), hour = view.hourOverride ?? clk.hour, sea = view.seasonOverride || M.seasonOf(clk.month), wk = view.weatherOverride || S.weather.kind;
  $("hud").textContent = cap1(sea) + " · " + hhmm(hour) + " · " + cap1(wk) + (S.weather.temp != null && !view.weatherOverride ? " " + Math.round(S.weather.temp) + "°C" : "") + (speed > 1 ? " · ×" + speed : "") + (LIVE ? (OWNER ? " · Mayor" : " · Watching") : " · Test world");
  $("zl").textContent = (view.zoom >= 1 ? view.zoom : view.zoom.toFixed(2).replace(/0$/, "")) + "×";
  if (S.phase === "choose") { if (OWNER) { if (!view.ghost) banner("Your wagon has arrived. Tap a spot to settle."); } else banner("The settlers are waiting for the Mayor to choose a place."); }
  else if (S.phase === "travel") banner("The wagon is on its way…");
  else if (exploreMode) banner("Explore: where to?", view.ghost ? (view.ghost.ok ? "Tap Send them to confirm." : view.ghost.why) : "Tap a far spot on land (walk) or on the sea (boat).");
  else if (buildType) banner("Place: " + M.TYPES[buildType].name, view.ghost ? (view.ghost.ok ? "Tap Place to confirm, or tap elsewhere." : view.ghost.why) : "Tap where it should stand.");
  else if (S.rally) { const r = M.rallyStr(S), nm = { wood: "Wood", food: "Food", stone: "Stone", build: "Builders" }[S.rally.type]; banner("Rally: all hands on " + nm.toLowerCase() + "!", (r >= 1 ? "Everyone who can is helping." : "The rush is calming down…") + " Tap " + nm + " again to stop."); }
  else banner(null);
  { const T0 = S.towns && S.towns[0]; $("vname").textContent = S.phase === "settled" ? (T0 ? T0.name : "Village") + (S.towns && S.towns.length > 1 ? " +" + (S.towns.length - 1) : "") : "Settlers"; }
  renderLog(false); fillGrid(); fillSel(); if (!$("booksheet").hidden) fillBook();
}
// ---- command buttons (AoE-style grid) ----
function cbtn(label, ic, on, fn, opt = {}) {
  const b = document.createElement("button"); b.className = "cb" + (opt.on ? " on" : "") + (opt.locked ? " locked" : ""); b.title = opt.title || label; b.setAttribute("aria-label", opt.title || label);
  if (ic instanceof HTMLCanvasElement) b.appendChild(ic); else b.appendChild(iconEl(ic, 2));
  const s = document.createElement("span"); s.textContent = label; b.appendChild(s);
  if (opt.locked) { const l = iconEl("lock", 1); l.classList.add("lk"); b.appendChild(l); }
  if (opt.badge) { const t = document.createElement("i"); t.className = "st"; t.textContent = opt.badge; b.appendChild(t); }
  if (opt.meter != null) { const m = document.createElement("i"); m.className = "mt"; m.style.width = Math.round(opt.meter * 100) + "%"; b.appendChild(m); }
  b.addEventListener("click", e => { e.stopPropagation(); if (!opt.locked) fn(); else toast("", opt.title); }); return b;
}
let exploreMode = false; const thumbs = {};
function fillGrid() {
  const S = W.S, g = $("grid"), settled = S.phase === "settled";
  const sig = [gridMode, OWNER, settled, buildType, S.rally && S.rally.type, S.rally && Math.floor(S.rally.t / 6), JSON.stringify(S.ms), !!S.trek, exploreMode].join("|"); if (sig === gridSig) return; gridSig = sig; g.textContent = "";
  if (!OWNER) { const p = document.createElement("p"); p.className = "meta"; p.style.cssText = "grid-column:1/-1;margin:4px;font-size:12px;color:var(--muted)"; p.textContent = "You are watching. Only the Mayor can give orders."; g.appendChild(p); return; }
  if (!settled) { const p = document.createElement("p"); p.style.cssText = "grid-column:1/-1;margin:4px;font-size:12px;color:var(--muted)"; p.textContent = S.phase === "choose" ? "Tap the land to pick where your people settle." : "On the way…"; g.appendChild(p); return; }
  if (gridMode === "main") {
    g.appendChild(cbtn("Build", "build", 0, () => { gridMode = "build"; gridSig = ""; }));
    g.appendChild(S.trek ? cbtn("Recall", "back", 0, () => doAct({ k: "trekcancel" }), { title: "Call the explorers back home" }) : cbtn("Explore", "globe", 0, () => { exploreMode = true; buildType = null; view.ghost = null; gridSig = ""; showPlace(true); }, { on: exploreMode, title: "Send a few villagers on an expedition to find wonders" }));
    const lbl = document.createElement("div"); lbl.className = "glab"; lbl.textContent = "Rally"; g.appendChild(lbl);
    for (const [t, ic, lab] of [["wood", "axe", "Wood"], ["food", "basket", "Food"], ["stone", "pick", "Stone"], ["build", "flag", "Builders"]]) {
      const on = !!(S.rally && S.rally.type === t);
      g.appendChild(cbtn(lab, ic, 0, () => doAct({ k: "rally", type: on ? "off" : t }), { on, badge: on ? "ON" : "OFF", meter: on ? Math.max(0, 1 - S.rally.t / 120) : null, title: on ? "Rally on " + lab + " is running. Tap to stop it." : "Rally: send everyone to " + lab.toLowerCase() + " for a while" }));
    }
  } else {
    g.appendChild(cbtn("Back", "back", 0, () => { gridMode = "main"; buildType = null; view.ghost = null; showPlace(false); gridSig = ""; }));
    for (const t of M.BUILD_MENU) {
      const T = M.TYPES[t], locked = T.unlock && !S.ms[T.unlock]; if (!thumbs[t]) thumbs[t] = G.thumb(t, 44);
      const cost = Object.entries(T.cost).map(([k, v]) => v + " " + k).join(", ");
      const short = { pit: "Pit", hut: "Hut", longhouse: "Long", store: "Store", wcut: "Wood", forage: "Forage", fisher: "Fish", quarry: "Quarry", field: "Field", mill: "Mill", fold: "Sheep", apiary: "Bees", well: "Well", tavern: "Tavern", chapel: "Chapel", tower: "Tower", bridge: "Bridge", fill: "Fill", torch: "Torch", bench: "Bench" }[t] || t;
      const c = document.createElement("canvas"); c.width = 44; c.height = 44; c.getContext("2d").drawImage(thumbs[t], 0, 0);
      g.appendChild(cbtn(short, c, 0, () => { buildType = t; if (t === "bridge") toast("", "Tap on the water at the narrow spot where the bridge should go."); if (t === "fill") toast("", "Tap on shallow water right by the shore."); view.ghost = null; showPlace(true); gridSig = ""; selId = 0; selKey = null; }, { on: buildType === t, locked, title: locked ? M.UNLOCK_TEXT[T.unlock] : T.name + " · " + cost }));
    }
  }
}
// ---- the big world map ----
function drawWMap(force) {
  if (!W || $("wmapsheet").hidden) return; const S = W.S, c = $("wmapc"); if (!G.worldMap(c, force)) return;
  const kinds = new Set((S.wonders || []).map(w => w.k)).size, total = M.WONDER_KINDS.length;
  $("wmapinfo").textContent = "★ wonders " + (S.wonders || []).length + " (" + kinds + "/" + total + " kinds) · gold dot: settlements · blue square: harbour · white arrow: boat · red dot: expedition. Tap the map to go there.";
}
$("wmapc").addEventListener("click", e => { const r = e.currentTarget.getBoundingClientRect(), c = e.currentTarget, p = G.wmToWorld((e.clientX - r.left) / r.width * c.width, (e.clientY - r.top) / r.height * c.height); if (p) { centerOn(p.x, p.y); $("wmapsheet").hidden = true; if (view.zoom < 1) setZoom(1.5); } });
setInterval(() => drawWMap(false), 2500);
// ---- selection info (left well) ----
let selInfo = null;
function fillSel() {
  const S = W.S, box = $("sel"); let key, build;
  const b = selId && S.b.find(q => q.id === selId);
  if (buildType) { const T = M.TYPES[buildType]; key = "bt" + buildType + JSON.stringify(S.res); build = () => { h3(box, T.name); para(box, T.d); para(box, "Costs " + (Object.entries(T.cost).map(([k, v]) => v + " " + k).join(", ") || "nothing") + (T.beds ? " · " + T.beds + " beds" : "") + ". Villagers fetch what is missing.", "meta"); }; }
  else if (b) {
    const T = M.TYPES[b.type]; key = ["b", b.id, b.done, b.stage, b.crop, b.auto, Math.round((b.prog || 0) * 50)].join();
    build = () => {
      h3(box, T.name);
      if (!b.done) { para(box, "Being built · " + Math.round(b.prog * 100) + "% · " + (b.by === "mayor" ? "your order" : "the villagers' own idea"), "meta"); const bar = document.createElement("div"); bar.className = "bar"; const i = document.createElement("i"); i.style.width = Math.round(b.prog * 100) + "%"; bar.appendChild(i); box.appendChild(bar); }
      else if (b.type === "field") para(box, ["Plowed, waiting to be sown.", "Sown. Small sprouts.", "Growing.", "Ripe, ready to harvest."][b.stage] + " " + M.CROPS[b.crop].name + (b.auto ? " (their choice)." : " (your choice)."));
      else para(box, T.d);
      if (b.upTo) para(box, "Being rebuilt into a " + M.TYPES[b.upTo].name + " · " + Math.round(b.prog * 100) + "%", "meta");
      if (OWNER) {
        const row = document.createElement("div"); row.className = "row";
        if (b.type === "field") for (const c in M.CROPS) { const bt = document.createElement("button"); bt.className = "btn" + (b.crop === c && !b.auto ? " on" : ""); bt.textContent = M.CROPS[c].name; bt.addEventListener("click", () => doAct({ k: "crop", id: b.id, crop: c })); row.appendChild(bt); }
        if (!b.done) { const bt = document.createElement("button"); bt.className = "btn"; bt.textContent = "Cancel building"; bt.addEventListener("click", () => { doAct({ k: "cancel", id: b.id }); selId = 0; }); row.appendChild(bt); }
        if (row.childNodes.length) box.appendChild(row);
      }
    };
  } else if (selInfo) { key = "i" + selInfo.t + selInfo.d; build = () => { h3(box, selInfo.t); para(box, selInfo.d); }; }
  else {
    const n = S.people.length, by = {}; for (const p of S.people) by[p.role] = (by[p.role] || 0) + 1;
    key = ["v", n, S.phase, JSON.stringify(by), S.b.filter(q => !q.done).length].join();
    key += "|" + (S.log[0] && S.log[0].tk);
    build = () => {
      if (S.phase !== "settled") { h3(box, "The settlers"); para(box, "Five settlers, an ox, a dog and a wagon full of tools."); return; }
      h3(box, "Tap anything to see what it is");
      const l = S.log[0]; if (l) para(box, l.t, "meta");
    };
  }
  if (key === selKey) return; selKey = key; box.textContent = ""; build();
}
// ---- the Book: wonders album, treasures, village overview ----
let bookTab = "wonders", bookSig = "", selWonder = null, selTreasure = null;
const elx = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
function artCanvas(k, found, maxW, maxH) {
  const a = G.wonderArt(k), c = document.createElement("canvas"); if (!a) return c; const sc = Math.min(maxW / a.w, maxH / a.h); c.width = Math.round(a.w * sc); c.height = Math.round(a.h * sc);
  const x = c.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(a.canvas, 0, 0, c.width, c.height); if (!found) { x.globalCompositeOperation = "source-in"; x.fillStyle = "#5a3a22"; x.fillRect(0, 0, c.width, c.height); } return c;
}
const dirFrom = (S, x, y) => { const t = S.towns && S.towns[0]; if (!t) return ""; const d = Math.round(Math.hypot(x - t.x, y - t.y)); return d < 10 ? "close to " + t.name : "about " + d + " tiles " + M.compass(x - t.x, y - t.y) + " of " + t.name; };
function fillBook() {
  const S = W.S; for (const b of $("btabs").children) b.classList.toggle("on", b.dataset.tab === bookTab);
  for (const t of ["wonders", "treasures", "market", "village"]) $("pane-" + t).hidden = t !== bookTab;
  if (bookTab === "village") { fillVillage(); return; }
  if (bookTab === "market") { fillMarket(); return; }
  const sig = [bookTab, (S.wonders || []).length, (S.treasures || []).length, S.scrollDone ? 1 : 0, selWonder, selTreasure, M.WONDER_KINDS.length].join("|"); if (sig === bookSig) return; bookSig = sig;
  if (bookTab === "wonders") {
    const total = M.wonderTotal(S), found = new Map((S.wonders || []).map(w => [w.k, w])), list = $("wlist"), det = $("wdetail"); list.textContent = ""; det.textContent = "";
    $("wcount").textContent = "Found " + found.size + " of " + (total == null ? "?" : total);
    if (total == null) list.appendChild(elx("p", "meta", found.size ? "Somewhere an old scroll tells how many wonders the world holds. Send expeditions to look for its pieces." : "Nothing found yet. Wonders hide far away. Send an expedition, or a boat, and the villagers will find them."));
    for (const b of M.BIOMES) {
      const kinds = Object.keys(M.WONDERS).filter(k => M.WONDERS[k].biome === b.id), have = kinds.filter(k => found.has(k)); if (total == null && !have.length) continue;
      list.appendChild(elx("h4", null, b.name + (total != null ? "  " + have.length + "/" + kinds.length : ""))); const g = elx("div", "slots");
      for (const k of (total != null ? kinds : have)) { const f = found.has(k), sl = elx("button", "slot" + (f ? "" : " unk") + (selWonder === k ? " on" : "")); sl.appendChild(artCanvas(k, f, 64, 48)); sl.appendChild(elx("b", null, f ? M.WONDERS[k].name : "???")); sl.addEventListener("click", () => { selWonder = k; bookSig = ""; fillBook(); if (innerWidth < 700) $("wdetail").scrollIntoView({ behavior: "smooth", block: "start" }); }); g.appendChild(sl); }
      list.appendChild(g);
    }
    const k = selWonder && M.WONDERS[selWonder] ? selWonder : (S.wonders && S.wonders.length ? S.wonders[S.wonders.length - 1].k : null);
    if (!k) det.appendChild(elx("p", "meta", "Tap a wonder to read about it."));
    else { const f = found.get(k), d = M.WONDERS[k], bm = M.BIOMES.find(b => b.id === d.biome); det.appendChild(elx("h3", null, f ? d.name : "Unknown wonder")); const big = elx("div", "dbig"); big.appendChild(artCanvas(k, !!f, 260, 200)); det.appendChild(big);
      det.appendChild(elx("p", "meta", "Land: " + (bm ? bm.name : "")));
      if (f) { det.appendChild(elx("p", null, d.d)); det.appendChild(elx("p", "meta", "Gives the village " + M.wonderFxText(k) + ".")); det.appendChild(elx("p", "meta", "Found by " + f.by + ", " + dirFrom(S, f.x, f.y) + ".")); const go = elx("button", "btn", "Show on the map"); go.addEventListener("click", () => { centerOn(f.x, f.y); $("booksheet").hidden = true; if (view.zoom < 2) setZoom(3); }); det.appendChild(go); }
      else det.appendChild(elx("p", null, "Not found yet. It hides somewhere in this kind of land. Only your people can find it, by walking (or sailing) there.")); }
  } else {
    const list = $("tlist"), det = $("tdetail"); list.textContent = ""; det.textContent = ""; const tr = S.treasures || [], kinds = new Map();
    for (const t of tr) if (t.k !== "scroll") kinds.set(t.k, (kinds.get(t.k) || 0) + 1);
    $("tcount").textContent = "Found " + kinds.size + " of ?";
    const items = [...kinds.keys()].filter(k => !M.TREASURES[k].place), places = [...kinds.keys()].filter(k => M.TREASURES[k].place);
    const mk = (k, n) => { const d = M.TREASURES[k], sl = elx("button", "slot" + (selTreasure === k ? " on" : "")); sl.appendChild(elx("div", "em", d.e)); sl.appendChild(elx("b", null, d.name)); if (n > 1) sl.appendChild(elx("span", "n", "×" + n)); sl.addEventListener("click", () => { selTreasure = k; bookSig = ""; fillBook(); if (innerWidth < 700) $("tdetail").scrollIntoView({ behavior: "smooth", block: "start" }); }); return sl; };
    if (!kinds.size) list.appendChild(elx("p", "meta", "Nothing yet. Treasures lie buried or forgotten far from the village. Expeditions and boats find them as they walk past."));
    if (items.length) { list.appendChild(elx("h4", null, "Treasures")); const g = elx("div", "slots"); for (const k of items) g.appendChild(mk(k, kinds.get(k))); list.appendChild(g); }
    if (places.length) { list.appendChild(elx("h4", null, "Hidden places")); const g = elx("div", "slots"); for (const k of places) g.appendChild(mk(k, kinds.get(k))); list.appendChild(g); }
    // the scroll
    const got = tr.filter(t => t.k === "scroll"), n = got.length; det.appendChild(elx("h3", null, "Scroll of the Wonders")); det.appendChild(elx("p", "bsub", S.scrollDone ? "Complete" : n + " of 3 pieces"));
    const pc = elx("div", "pieces"); for (let i = 0; i < 3; i++) { const g = got.find(t => t.i === i), sl = elx("div", "slot" + (g ? "" : " unk")); sl.appendChild(elx("div", "em", g ? "📜" : "❔")); sl.appendChild(elx("b", null, g ? M.SCROLL_NAME[i] : "???")); pc.appendChild(sl); } det.appendChild(pc);
    det.appendChild(elx("p", "meta", S.scrollDone ? "The pieces fit together. The scroll names every wonder of the world, so the Wonders page now shows how many are left." : "Three pieces of an old scroll lie in far places. Put them together and the Book will tell how many wonders the world holds."));
    const k = selTreasure && kinds.has(selTreasure) ? selTreasure : null;
    if (k) { const d = M.TREASURES[k], t = tr.filter(q => q.k === k)[0]; det.appendChild(elx("h4", null, d.name)); const big = elx("div", "dbig"); big.appendChild(elx("div", "em", d.e)); det.appendChild(big); det.appendChild(elx("p", null, d.d)); det.appendChild(elx("p", "meta", "Found by " + t.by + ", " + dirFrom(S, t.x, t.y) + ". Gave " + Object.entries(d.fx).map(([a, b]) => "+" + b + " " + a).join(", ") + "."));
      if (d.place) { const go = elx("button", "btn", "Show on the map"); go.addEventListener("click", () => { centerOn(t.x, t.y); $("booksheet").hidden = true; if (view.zoom < 2) setZoom(3); }); det.appendChild(go); } }
  }
}
// ---- village overview sheet (opened from the top bar) ----
let vilSig = "";
const ROLE_NAMES = { wood: "Woodcutters & foresters", food: "Farmers & gatherers", stone: "Stone workers", build: "Builders", scout: "Scouts" };
let mktSig = "";
function fillMarket() {
  const S = W.S, box = $("mktbody"), towns = S.towns || [];
  const sig = [towns.map(t => { const r = M.resOf(S, t); return [Math.round(r.food / 10), Math.round(r.wood / 10), Math.round(r.stone / 10), (t.coin || 0).toFixed(2)].join(","); }).join(";"), S.trade.n, JSON.stringify(S.price), S.people.filter(p => p.trade).length].join("|"); if (sig === mktSig) return; mktSig = sig; box.textContent = "";
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  if (S.phase !== "settled") { para(box, "There is nothing to trade yet.", "meta"); return; }
  const h = t => box.appendChild(el("h4", null, t));
  para(box, "What does not fit into a storehouse is sold: 10,000 spare goods bring 5 coins. A village with plenty sends goods to a village that is short, and the price follows supply and demand.", "meta");
  h("Prices (coins per 1,000)");
  const stats = el("div", "vstats");
  for (const k of M.KINDS) { const d = el("div", "vs"), pr = S.price[k]; d.append(iconEl(k, 2), el("b", null, pr.toFixed(2)), el("small", null, (pr > 1.25 ? "dear " : pr < .8 ? "cheap " : "fair ") + cap1(k))); stats.appendChild(d); }
  box.appendChild(stats);
  h("Settlements");
  for (const T of towns) {
    const r = M.resOf(S, T), cp = M.capT(W, T), row = el("div", "vtown"), info = el("div");
    info.append(el("b", null, T.name + (T.hungry ? " (hungry)" : "")), el("span", "meta", "Food " + Math.round(r.food) + " · Wood " + Math.round(r.wood) + " · Stone " + Math.round(r.stone) + " (room for " + cp + " each)"), el("span", "meta", "Treasury: " + (T.coin || 0).toFixed(2) + " coins"));
    for (const sp of info.querySelectorAll(".meta")) sp.style.display = "block";
    row.appendChild(info); box.appendChild(row);
  }
  h("Trade");
  const tr = S.trade, onRoad = S.people.filter(p => p.trade).length;
  if (!tr.n) para(box, towns.length < 2 ? "Trade starts when there is more than one village." : "No goods have changed hands yet. Trade begins when one village is short of something and another has plenty.", "meta");
  else {
    para(box, tr.n + " deliveries · " + tr.vol.food + " food, " + tr.vol.wood + " wood, " + tr.vol.stone + " stone · " + tr.coins.toFixed(2) + " coins paid (" + tr.tax.toFixed(2) + " lost as market tax)" + (onRoad ? " · " + onRoad + " on the road now" : ""), "meta");
    const names = id => (towns.find(t => t.id === id) || {}).name;
    for (const [key, n] of Object.entries(S.pact).sort((a, b) => b[1] - a[1]).slice(0, 8)) { const [a, b] = key.split("-").map(Number); para(box, names(a) + " ⇄ " + names(b) + " · " + n + " deliveries · " + (n >= 40 ? "close friends" : n >= 12 ? "good neighbours" : "acquaintances"), "meta"); }
  }
}
function fillVillage() {
  const S = W.S, box = $("vilbody"), towns = S.towns || [];
  const sig = [S.people.length, S.b.length, S.b.filter(b => b.done).length, towns.length, JSON.stringify(M.totalRes(S)), S.towns.map(t => (t.coin || 0).toFixed(1)).join(), !!S.exp, (S.wonders || []).length, S.trek ? S.trek.i : -1, (S.boats || []).map(b => b.st + b.voy).join(), S.rumor ? S.rumor.id : 0, Math.floor(S.tick / 240)].join("|"); if (sig === vilSig) return; vilSig = sig; box.textContent = "";
  if (S.phase !== "settled") { para(box, "The settlers have not picked a place yet."); return; }
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const cap = M.capOf(W);
  const stats = el("div", "vstats");
  const TR = M.totalRes(S);
  for (const [ic, v, l] of [["food", Math.round(TR.food), "Food"], ["wood", Math.round(TR.wood), "Wood"], ["stone", Math.round(TR.stone), "Stone"], ["pop", S.people.length + "/" + M.bedsTotal(W), "Villagers"], ["store", cap, "Storage each"]]) { const d = el("div", "vs"); d.append(iconEl(ic, 2), el("b", null, String(v)), el("small", null, l)); stats.appendChild(d); }
  box.appendChild(stats);
  const h = t => box.appendChild(el("h4", null, t));
  h(towns.length > 1 ? "Settlements" : "Settlement");
  for (const T of towns) {
    const ppl = S.people.filter(p => M.townOf(W, p).id === T.id && !p.pioneer), bs = S.b.filter(b => b.town === T.id), done = bs.filter(b => b.done && !["torch", "bench"].includes(b.type)), sites = bs.filter(b => !b.done);
    const beds = done.reduce((n, b) => n + (M.TYPES[b.type].beds || 0), 0);
    const row = el("div", "vtown"), info = el("div");
    info.append(el("b", null, T.name), el("span", "meta", ppl.length + " villagers · " + beds + " beds · " + done.length + " buildings" + (sites.length ? " · " + sites.length + " being built" : "")));
    if (T.fx && T.wk) { const gift = el("span", "meta", "✨ Gift of the " + M.WONDERS[T.wk].name + ": " + M.wonderFxTown(T)); gift.style.display = "block"; info.appendChild(gift); }
    else if (T.why) { const why = el("span", "meta", "Founded " + T.why); why.style.display = "block"; info.appendChild(why); }
    const go = el("button", "btn", "Show"); go.addEventListener("click", () => { centerOn(T.x, T.y); $("booksheet").hidden = true; });
    row.append(info, go); box.appendChild(row);
  }
  if (S.exp) para(box, "🧭 Pioneers from " + S.exp.from + " are on their way to found " + S.exp.name + ".", "meta");
  if (S.trek || S.rumor || (S.wonders || []).length || (S.boats || []).length) {
    h("Expeditions & wonders");
    if (S.trek) { const T = S.trek, names = S.people.filter(q => T.members.includes(q.id)).map(q => q.name).join(", "); para(box, "🧭 " + T.name + " (" + names + "), heading " + T.dir + ". " + (S.people.find(q => q.id === T.members[0]) || {}).act + ".", "meta"); }
    for (const bt of S.boats || []) { const nm = S.people.filter(q => bt.crew.includes(q.id)).map(q => q.name).join(", "); const row = el("div", "vtown"), info = el("div"); info.append(el("b", null, "⛵ Boat"), el("span", "meta", bt.st === "dock" ? "Moored at the harbour · " + bt.voy + " trips so far" : nm + (bt.rest > 0 ? " are fishing and looking around" : bt.st === "back" ? " are sailing home" : " are sailing out"))); row.append(info); if (bt.st !== "dock" && OWNER) { const bb = el("button", "btn", "Call back"); bb.addEventListener("click", () => doAct({ k: "sailcancel" })); row.append(bb); } box.appendChild(row); }
    if (S.trek) { } else if (S.rumor) para(box, "🗣️ Rumor: " + M.WONDERS[S.rumor.k].rumor + ", far to the " + S.rumor.dir + ".", "meta");
    for (const w of S.wonders || []) { const row = el("div", "vtown"), info = el("div"); info.append(el("b", null, M.WONDERS[w.k].name), el("span", "meta", "Found by " + w.by + " · " + M.wonderFxText(w.k))); const go = el("button", "btn", "Show"); go.addEventListener("click", () => { centerOn(w.x, w.y); $("booksheet").hidden = true; if (view.zoom < 2) setZoom(3); }); row.append(info, go); box.appendChild(row); }
  }
  h("Who does what");
  const by = {}; for (const p of S.people) if (!p.pioneer) by[p.role] = (by[p.role] || 0) + 1;
  const ul = el("ul", "vlist"); for (const [k, v] of Object.entries(by).sort((a, b) => b[1] - a[1])) { const li = el("li"); li.append(el("b", null, String(v)), document.createTextNode(" " + (ROLE_NAMES[k] || cap1(k)))); ul.appendChild(li); } box.appendChild(ul);
  h("Buildings");
  const cnt = {}; for (const b of S.b) if (b.done) cnt[b.type] = (cnt[b.type] || 0) + 1;
  const ul2 = el("ul", "vlist cols"); for (const [k, v] of Object.entries(cnt).sort((a, b) => b[1] - a[1])) { const li = el("li"); li.append(el("b", null, String(v)), document.createTextNode(" " + M.TYPES[k].name)); ul2.appendChild(li); } box.appendChild(ul2);
  const sites = S.b.filter(b => !b.done); if (sites.length) { h("Being built"); for (const b of sites.slice(0, 8)) para(box, M.TYPES[b.upTo || b.type].name + " · " + Math.round((b.prog || 0) * 100) + "% · " + (b.by === "mayor" ? "your order" : "their own idea"), "meta"); }
}
// ---- town name labels over the map ----
const labelEls = new Map();
function townLabels() {
  const S = W.S, box = $("labels"), on = S.phase === "settled"; if (!on) { box.hidden = true; return; } box.hidden = false;
  const Z = view.zoom, L0 = cv.offsetLeft, T0 = cv.offsetTop, CWd = cv.clientWidth, CHd = cv.clientHeight, ui = view.ui || 1;
  for (const T of S.towns || []) {
    let e = labelEls.get(T.id); if (!e) { e = document.createElement("div"); e.className = "tl"; box.appendChild(e); labelEls.set(T.id, e); }
    if (e.textContent !== T.name) e.textContent = T.name;
    const [x, y] = G.screenOf(T.x, T.y), lx = x + L0, ly = y + T0 - Math.max(18, 30 * Math.min(Z, 3) / ui);
    const vis = Z < 3 && lx > -60 && ly > T0 - 10 && lx < CWd + 60 && ly < T0 + CHd && !M.hidden(W, T.x, T.y);
    e.hidden = !vis; if (vis) { e.style.transform = "translate(" + Math.round(lx) + "px," + Math.round(ly) + "px) translate(-50%,-100%)"; e.classList.toggle("sm", Z >= 2); }
  }
}
function h3(box, t) { const h = document.createElement("h3"); h.textContent = t; box.appendChild(h); }
function para(box, t, cls) { const p = document.createElement("p"); if (cls) p.className = cls; p.textContent = t; box.appendChild(p); }
function showPlace(on) { $("placebar").hidden = !on; $("placebtn").disabled = !(view.ghost && view.ghost.ok); $("placebtn").textContent = exploreMode ? "Send them" : "Place"; }
function refreshSel() { selKey = null; }
// ---------- camera & zoom ----------
function centerOn(x, y) { view.cam.x = G.sx(x, y); view.cam.y = G.sy(x, y) - 10; }
function setZoom(z) { view.zoom = z; G.resize(); }
function zoomStep(d) { let i = ZOOMS.findIndex(z => Math.abs(z - view.zoom) < .01); if (i < 0) i = ZOOMS.findIndex(z => z < view.zoom); i = Math.max(0, Math.min(ZOOMS.length - 1, i - d)); setZoom(ZOOMS[i]); }
function fitWorld() {
  const b = G.exploredBounds(), s = G.cssSize(); if (b.x0 > b.x1) return;
  let z = Math.min(s.w / (b.x1 - b.x0), s.h / (b.y1 - b.y0 + 60)) * .95; z = z >= 1 ? Math.floor(z) : Math.max(.12, z);
  view.cam.x = (b.x0 + b.x1) / 2; view.cam.y = (b.y0 + b.y1) / 2 - 20; setZoom(z); mode = null;
}
// ---------- input ----------
const cv = $("cv"), tip = $("tip"), ptrs = new Map(); let down = null, pinch = null, tipTimer = 0;
function showTip(info, cx, cy) { if (!info) { tip.hidden = true; return; } tip.textContent = ""; const b = document.createElement("b"); b.textContent = info.t; tip.append(b, document.createTextNode(info.d)); tip.hidden = false; const st = $("stage"), r = st.getBoundingClientRect(), f = r.width / (st.clientWidth || r.width) || 1; tip.style.left = M.clamp((cx - r.left) / f + 14, 4, st.clientWidth - tip.offsetWidth - 4) + "px"; tip.style.top = M.clamp((cy - r.top) / f + 14, 4, st.clientHeight - tip.offsetHeight - 4) + "px"; }
cv.addEventListener("pointerdown", e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; down = null; } else down = { x: e.clientX, y: e.clientY, moved: false }; });
cv.addEventListener("pointermove", e => {
  const p = ptrs.get(e.pointerId);
  if (!p) { if (e.pointerType === "mouse") { const w = G.toWorld(e.clientX, e.clientY); view.hover = { vx: w.vx, vy: w.vy }; showTip(G.hitAt(w.vx, w.vy), e.clientX, e.clientY); } return; }
  if (pinch && ptrs.size === 2) { p.x = e.clientX; p.y = e.clientY; const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (d / pinch.d > 1.35) { zoomStep(1); pinch.d = d; } else if (d / pinch.d < .74) { zoomStep(-1); pinch.d = d; } return; }
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) { down.moved = true; cv.classList.add("drag"); tip.hidden = true; mode = null; }
  if (down && down.moved) { const k = G.artPerCss(); view.cam.x -= (e.clientX - p.x) * k; view.cam.y -= (e.clientY - p.y) * k; }
  p.x = e.clientX; p.y = e.clientY;
});
cv.addEventListener("pointerup", e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; cv.classList.remove("drag"); if (down && !down.moved) tap(e.clientX, e.clientY); down = null; });
cv.addEventListener("pointercancel", e => { ptrs.delete(e.pointerId); down = null; pinch = null; });
cv.addEventListener("pointerleave", () => { view.hover = null; if (!ptrs.size) tip.hidden = true; });
cv.addEventListener("wheel", e => { e.preventDefault(); zoomStep(e.deltaY < 0 ? 1 : -1); }, { passive: false });
// no browser zoom, no double-tap zoom, no text selection: we are in a game
for (const ev of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener("dblclick", e => e.preventDefault(), { passive: false });
let lastTouchEnd = 0; document.addEventListener("touchend", e => { const now = Date.now(); if (now - lastTouchEnd < 350) e.preventDefault(); lastTouchEnd = now; }, { passive: false });
document.addEventListener("touchmove", e => { if (e.touches.length > 1 || !e.target.closest(".sheet,.sel,.grid")) e.preventDefault(); }, { passive: false });
addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && ["+", "-", "=", "0"].includes(e.key)) { e.preventDefault(); zoomStep(e.key === "-" ? -1 : 1); } });
function tap(cx, cy) {
  const w = G.toWorld(cx, cy), S = W.S;
  if (OWNER && S.phase === "choose") { const why = M.judgeSettle(W, w.x, w.y); view.ghost = { kind: "settle", x: w.x, y: w.y, ok: !why }; banner(why || "A good place. Settle here?", why ? "Pick another spot." : "Trees nearby will be cleared."); $("settlebar").hidden = !!why; return; }
  if (OWNER && exploreMode) { const c = M.camp(W) || W.S.wagon, d = Math.hypot(w.x - c.x, w.y - c.y), sea = M.isWater(w.x, w.y), hb = W.S.b.find(b => b.type === "harbor" && b.done), bt = hb && W.S.boats.find(q => q.hb === hb.id);
    const why = sea ? (!hb ? "That is water. Build a harbour to sail there." : !bt ? "The boat is not ready yet." : bt.st !== "dock" ? "The boat is already out." : d < 10 ? "Too close. Pick a place farther out." : null) : d < 18 ? "Too close. Pick a place farther away." : d > 240 ? "Too far for one trip." : W.S.res.food < 24 ? "Not enough food to pack (24 needed)." : null;
    view.ghost = { kind: "trek", x: w.x, y: w.y, ok: !why, why, sea }; showPlace(true); return; }
  if (OWNER && buildType) { const sh = M.planShape(W, buildType, w.x, w.y, true), T = M.TYPES[buildType]; view.ghost = { kind: "build", type: buildType, x: sh.x ?? Math.round(w.x), y: sh.y ?? Math.round(w.y), a: sh.a || T.a, b: sh.b || T.b, ok: !sh.err, why: sh.err, tx: w.x, ty: w.y }; showPlace(true); return; }
  const info = G.hitAt(w.vx, w.vy); tip.hidden = true;
  if (info && info.b) { selId = info.b; selInfo = null; } else { selId = 0; selInfo = info; }
  selKey = null; fillSel();
}
// minimap
$("mm").addEventListener("pointerdown", e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(), c = e.currentTarget, u = (e.clientX - r.left) / r.width * c.width, v = (e.clientY - r.top) / r.height * c.height, p = G.minimapToWorld(u, v); if (p) { centerOn(p.x, p.y); mode = null; } });
$("zin").addEventListener("click", () => zoomStep(1)); $("zout").addEventListener("click", () => zoomStep(-1)); $("zworld").addEventListener("click", () => { sheet("wmapsheet"); if (!$("wmapsheet").hidden) drawWMap(true); });
$("settle").addEventListener("click", () => { const g = view.ghost; if (g && g.ok) doAct({ k: "settle", x: g.x, y: g.y }); });
$("placebtn").addEventListener("click", () => { const g = view.ghost; if (g && g.kind === "trek") { if (g.ok) doAct({ k: g.sea ? "sail" : "trek", x: g.x, y: g.y }); return; } if (g && g.ok) doAct({ k: "place", type: g.type, x: g.tx, y: g.ty }); });
$("placecancel").addEventListener("click", () => { exploreMode = false; buildType = null; view.ghost = null; showPlace(false); gridSig = ""; });
$("center").addEventListener("click", () => { const c = M.camp(W); if (c) centerOn(c.x + 1.5, c.y + 1.5); else centerOn(W.S.wagon.x, W.S.wagon.y); if (view.zoom < 2) setZoom(3); });
const sheet = id => { for (const s of ["logsheet", "menusheet", "booksheet", "wmapsheet"]) $(s).hidden = s !== id || !$(s).hidden; };
const openBook = tab => { if (!$("booksheet").hidden && bookTab === tab) { $("booksheet").hidden = true; return; } sheet("booksheet"); $("booksheet").hidden = false; bookTab = tab; bookSig = ""; vilSig = ""; fillBook(); };
$("vilbtn").addEventListener("click", () => openBook("village")); $("resbar").addEventListener("click", () => openBook("village")); $("bookbtn").addEventListener("click", () => openBook("wonders"));
{ const v = SND.getVol(), a = $("vsfx"), b = $("vmus"); a.value = Math.round(v.sfx * 100); b.value = Math.round(v.music * 100); a.addEventListener("input", () => { SND.initSound(); SND.setVol("sfx", a.value / 100); }); b.addEventListener("change", () => SND.setVol("music", b.value / 100)); b.addEventListener("input", () => SND.setVol("music", b.value / 100)); }
$("btabs").addEventListener("click", e => { const b = e.target.closest("button[data-tab]"); if (b) { bookTab = b.dataset.tab; bookSig = ""; vilSig = ""; fillBook(); } });
$("logbtn").addEventListener("click", () => { sheet("logsheet"); renderLog(true); });
$("menubtn").addEventListener("click", () => sheet("menusheet"));
for (const b of document.querySelectorAll("[data-close]")) b.addEventListener("click", () => $(b.dataset.close).hidden = true);
const canFS = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
// ---- interface size: phones get a narrower layout viewport (everything scales, layout adapts),
// desktop browsers ignore that, so there the page is zoomed. The map keeps its own zoom.
const UI_SIZES = [.9, 1, 1.15, 1.3, 1.5];
let uiScale = 1.3; try { const v = parseFloat(localStorage.getItem("uoe2-ui")); if (v >= .8 && v <= 1.6) uiScale = v; } catch (e) { }
const touchDev = matchMedia("(pointer:coarse)").matches;
function applyUI() {
  if (touchDev) {
    const sw = Math.min(screen.width, screen.height), sh = Math.max(screen.width, screen.height), land = innerWidth > innerHeight, w = Math.round((land ? sh : sw) / uiScale);
    $("vpmeta").setAttribute("content", "width=" + w + ",initial-scale=" + uiScale + ",minimum-scale=" + uiScale + ",maximum-scale=" + uiScale + ",user-scalable=no,viewport-fit=cover");
    view.ui = uiScale;
  } else { document.documentElement.style.zoom = uiScale === 1 ? "" : String(uiScale); view.ui = uiScale; }
  const box = $("uisz"); box.textContent = "";
  for (const v of UI_SIZES) { const b = document.createElement("button"); b.className = "btn" + (Math.abs(v - uiScale) < .01 ? " on" : ""); b.textContent = Math.round(v * 100) + "%"; b.addEventListener("click", () => { uiScale = v; try { localStorage.setItem("uoe2-ui", String(v)); } catch (e) { } applyUI(); }); box.appendChild(b); }
  requestAnimationFrame(() => G.resize()); setTimeout(() => G.resize(), 300);
}
applyUI();
// ---- graphics: Auto starts with full detail and steps down by itself if the far view is slow; the player can also pick a level
const GFX_OPTS = [["auto", "Auto"], ["0", "Full"], ["1", "Simple"], ["2", "Very simple"]];
let gfxPref = "auto"; try { const v = localStorage.getItem("uoe2-gfx"); if (GFX_OPTS.some(o => o[0] === v)) gfxPref = v; } catch (e) { }
let gfxAuto = 0, slowT = 0, calmT = 0, ema = 33;
function applyGfx(init) {
  const g = gfxPref === "auto" ? gfxAuto : +gfxPref; if ((view.gfx || 0) !== g) { view.gfx = g; if (!init) G.resize(); }
  const box = $("gfxsz"); box.textContent = "";
  for (const [v, name] of GFX_OPTS) { const b = document.createElement("button"); b.className = "btn" + (v === gfxPref ? " on" : ""); b.textContent = name; b.addEventListener("click", () => { gfxPref = v; slowT = 0; try { localStorage.setItem("uoe2-gfx", v); } catch (e) { } applyGfx(); }); box.appendChild(b); }
}
applyGfx(true);
function watchSpeed(dt) { // called once per drawn frame
  ema += (dt * 1000 - ema) * .08;
  if (gfxPref !== "auto" || gfxAuto >= 2 || speed > 20 || view.zoom >= 1 || document.hidden || dt > .2) { slowT = 0; return; }
  if (ema > 45) slowT += dt; else slowT = Math.max(0, slowT - dt * .5);
  if (slowT > 5) { slowT = 0; ema = 33; gfxAuto++; applyGfx(); feed("🖼️", "Graphics made simpler", "The far view was slow. Change it in the Menu under Graphics."); }
}
addEventListener("orientationchange", () => setTimeout(applyUI, 250));
$("fsbtn").addEventListener("click", () => {
  const d = document, el = d.documentElement;
  if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
  else if (canFS) (el.requestFullscreen || el.webkitRequestFullscreen).call(el).catch?.(() => { $("fshint").hidden = false; });
  else $("fshint").hidden = false;
});
if (!canFS) $("fshint").hidden = false;
// sandbox controls
if (!LIVE) {
  $("dev").hidden = false;
  $("speed").addEventListener("change", e => speed = +e.target.value);
  $("tsl").addEventListener("input", e => { view.hourOverride = parseFloat(e.target.value); $("real").checked = false; });
  $("real").addEventListener("change", e => { if (e.target.checked) view.hourOverride = null; });
  $("season").addEventListener("change", e => view.seasonOverride = e.target.value || null);
  $("clockjump").addEventListener("click", e => { const b = e.target.closest("button[data-h]"); if (!b) return; view.hourOverride = null; $("real").checked = true; const S = W.S; if (b.dataset.h === "real") { S.t0 -= S.clockShift || 0; S.clockShift = 0; } else setClock(S, +b.dataset.h, false); });
  $("weather").addEventListener("change", e => view.weatherOverride = e.target.value || null);
  $("neww").addEventListener("click", () => { newSandbox((Math.random() * 1e9) | 0); gridSig = ""; selKey = null; $("menusheet").hidden = true; });
}
// ---------- welcome back ----------
function welcomeBack() {
  let seen = null; try { seen = JSON.parse(localStorage.getItem(seenKey) || "null"); } catch (e) { }
  const S = W.S; if (!seen || seen.seed !== S.seed || S.tick - seen.tick < 4 * 60 * 20) return;
  const mins = Math.round((S.tick - seen.tick) / 240), dur = mins >= 60 ? Math.floor(mins / 60) + " h " + (mins % 60) + " min" : mins + " min";
  const lines = S.log.filter(l => l.tk > seen.tick).map(l => l.t).reverse();
  const TRn = M.totalRes(S), d = (k) => Math.round(TRn[k] - (seen.res[k] || 0)), sgn = v => (v >= 0 ? "+" : "") + v;
  $("wbtitle").textContent = "While you were away (" + dur + ")";
  const ul = $("wblist"); ul.textContent = "";
  const add = t => { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); };
  add("Food " + sgn(d("food")) + " · Wood " + sgn(d("wood")) + " · Stone " + sgn(d("stone")) + " · Villagers " + sgn(S.people.length - seen.pop));
  for (const t of lines.slice(-8)) add(t);
  if (!lines.length) add("A quiet time. The villagers went about their days.");
  $("wb").hidden = false;
}
$("wbok").addEventListener("click", () => $("wb").hidden = true);
function markSeen() { try { const S = W.S; localStorage.setItem(seenKey, JSON.stringify({ seed: S.seed, tick: S.tick, res: M.totalRes(S), pop: S.people.length })); } catch (e) { } }
// ---------- main loop ----------
let SIMBUDGET = +(new URLSearchParams(location.search).get("sb") || 26), last = performance.now(), uiAcc = 0, saveAcc = 0, mmAcc = 1;
function loop(now) {
  requestAnimationFrame(loop);
  const rdt = Math.min(.25, (now - last) / 1000); if (now - last < (view.fast ? 50 : view.gfx >= 2 && view.zoom < 1 ? 45 : 30)) return; last = now; watchSpeed(rdt);
  if (!W) return;
  if (LIVE) M.advance(W, M.tickNow(W.S, Date.now()), 80);
  else {
    acc += rdt * speed / M.DT; const n = Math.min(400, Math.floor(acc)); acc -= n; const t0 = performance.now();
    for (let i = 0; i < n; i++) { M.step(W); if ((i & 3) === 3 && performance.now() - t0 > SIMBUDGET) { acc = 0; break; } } // fast-forward never starves the picture: what does not fit is dropped
    view.fast = speed > 20;
    // At 1x the clock is the real time of day. In fast-forward the clock runs fast too, so a test world can be sped through
    // the night into the morning (villagers keep their real day and night rhythm, only quicker).
    if (speed === 1) W.S.t0 = Date.now() - W.S.tick * 250 + (W.S.clockShift || 0); else W.S.clockShift = W.S.t0 + W.S.tick * 250 - Date.now();
  }
  for (const e of W.events) {
    if (e.k === "milestone") { feed("🏆", e.title, e.txt); SND.sfx("milestone"); }
    else if (e.k === "arrive" && e.p) feed("👋", e.p.name + " moved in");
    else if (e.k === "built" && e.b && M.TYPES[e.b.type] && !["torch", "bench", "field"].includes(e.b.type)) feed("🔨", M.TYPES[e.b.upTo || e.b.type].name + " finished");
    else if (e.k === "wonder") { feed("🗿", "Wonder found: " + M.WONDERS[e.w.k].name); SND.sfx("wonder"); }
    else if (e.k === "treasure") { if (e.t.k === "scroll") { feed("📜", "Piece of an old scroll (" + e.scroll + "/3)"); SND.sfx("scroll"); } else { feed(M.TREASURES[e.t.k].e, (M.TREASURES[e.t.k].place ? "Hidden place: " : "Treasure: ") + M.TREASURES[e.t.k].name); SND.sfx("treasure"); } }
    else if (e.k === "storm") feed("⛈️", "Storm at sea. The boat heads home");
    else if (e.k === "rumor") feed("🗣️", "Rumor: something far to the " + e.dir);
    else if (e.k === "trek") feed(e.what === "start" ? "🧭" : "🏠", e.what === "start" ? "Expedition set out " + e.dir : "Expedition is back" + (e.n ? " · " + e.n + " wonder" + (e.n > 1 ? "s" : "") : ""));
    else if (e.k === "boat") { if (e.what === "start") SND.sfx("horn"); feed("⛵", e.what === "start" ? "The boat sailed out" : "The boat is back" + (e.n ? " · " + e.n + " wonder" + (e.n > 1 ? "s" : "") : "")); }
    else if (e.k === "town") feed("🏕️", e.name + " was founded");
    else if (e.k === "gain" && view.zoom >= 2 && speed <= 20) G.addFloat(e.x, e.y, "+" + e.amt + " " + e.type, e.type === "wood" ? "#e0b070" : e.type === "stone" ? "#d0d0d0" : "#f08a70");
  }
  if (mode === "follow") { const wg = W.S.wagon; view.cam.x += (G.sx(wg.x, wg.y) - view.cam.x) * .06; view.cam.y += (G.sy(wg.x, wg.y) - 10 - view.cam.y) * .06; if (W.S.phase === "settled") mode = null; }
  G.frame(now, rdt); townLabels();
  uiAcc += rdt; if (uiAcc > .25) { uiAcc = 0; ui(); }
  envAcc += rdt; if (envAcc > 1) { envAcc = 0; soundEnv(); }
  mmAcc += rdt; if (mmAcc > (view.gfx ? 3 : 1)) { mmAcc = 0; G.minimap($("mm")); }
  saveAcc += rdt; if (saveAcc > 20) { saveAcc = 0; saveSandbox(true); markSeen(); }
  if (LIVE && Date.now() - lastPoll > 15000) { lastPoll = Date.now(); poll(); }
}
addEventListener("pagehide", () => { saveSandbox(); markSeen(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) { saveSandbox(); markSeen(); } else if (LIVE) poll(); });
// ---------- start ----------
async function start() {
  G.init(cv); new ResizeObserver(() => G.resize()).observe($("stage")); G.resize();

  $("net").hidden = !LIVE;
  try {
    if (LIVE) { await syncFull(true); }
    else {
      let S = null; try { S = JSON.parse(localStorage.getItem("uoe2-sandbox") || "null"); } catch (e) { }
      if (S && S.v === 1) { W = M.load(S); M.advance(W, Math.max(W.S.tick, M.tickNow(W.S, Date.now())), 14400); G.setWorld(W); }
      else newSandbox(window.UOE_SEED || ((Math.random() * 1e9) | 0));
    }
    const c = M.camp(W); if (c) centerOn(c.x + 1.5, c.y + 1.5); else centerOn(W.S.wagon.x, W.S.wagon.y);
    welcomeBack(); markSeen();
  } catch (e) { banner("The world could not be loaded.", String(e.message || e)); console.error(e); }
  $("busy").style.display = "none";
  view.warm = performance.now() + 2500; // bake the ground faster for the first moments
  requestAnimationFrame(loop);
}
window.UOE = { get gfxInfo() { return { gfxPref, gfxAuto, slowT, ema, speed }; }, get W() { return W; }, M, G, doAct, setZoom, fitWorld, view, setSpeed: s => speed = s };
start();
