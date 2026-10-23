// ============================================================
// Usage of Empires II — app: modes (live / sandbox), UI, input, network.
// ============================================================
import * as M from "./sim.js";
import * as G from "./render.js";
import { CONFIG } from "./config.js";
const $ = id => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const LIVE = !!CONFIG.url && !qs.has("sandbox");
let ownerKey = null;
try { const h = new URLSearchParams(location.hash.slice(1)); if (h.get("owner")) { localStorage.setItem("uoe2-owner", h.get("owner")); history.replaceState(null, "", location.pathname + location.search); } ownerKey = localStorage.getItem("uoe2-owner"); } catch (e) { }
const OWNER = !LIVE || !!ownerKey;
let W = null, speed = 1, acc = 0, mode = null, buildType = null, selId = 0, lastFull = 0, lastPoll = 0, busyAct = false, seenKey = LIVE ? "uoe2-seen-live" : "uoe2-seen-sandbox";
const view = G.view;
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
function afterAct(a) { if (a.k === "place") { buildType = null; view.ghost = null; showPlace(false); } if (a.k === "settle") { view.ghost = null; $("settle").hidden = true; mode = "follow"; } refreshSel(); }
function say(t) { toast("", t); }
// ---------- sandbox persistence ----------
function saveSandbox() { if (LIVE || !W) return; try { localStorage.setItem("uoe2-sandbox", JSON.stringify(M.serialize(W))); } catch (e) { } }
function newSandbox(seed) { W = M.createWorld(seed, Date.now()); G.setWorld(W); centerOn(W.S.wagon.x, W.S.wagon.y); renderLog(true); }
// ---------- UI ----------
let toasts = [], toastT = 0;
function toast(title, txt) { toasts.push({ title, txt }); }
function banner(t, sub) { const b = $("banner"); b.textContent = ""; if (!t) { b.hidden = true; return; } b.hidden = false; const s = document.createElement("span"); s.textContent = t; b.appendChild(s); if (sub) { const i = document.createElement("i"); i.textContent = sub; b.appendChild(i); } }
function hhmm(h) { const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0"); }
function renderLog(force) {
  const S = W.S, ul = $("feed"); if (!force && ul.dataset.n === String(S.log.length) + ":" + (S.log[0] && S.log[0].tk)) return;
  ul.dataset.n = String(S.log.length) + ":" + (S.log[0] && S.log[0].tk); ul.textContent = "";
  for (const l of S.log.slice(0, 14)) { const li = document.createElement("li"), b = document.createElement("b"); b.textContent = hhmm(M.clockOf(S, l.tk).hour) + " "; li.append(b, document.createTextNode(l.t)); ul.appendChild(li); }
}
function ui() {
  const S = W.S, cap = M.capOf(W), beds = M.bedsTotal(W);
  $("rfood").textContent = S.res.food; $("rwood").textContent = S.res.wood; $("rstone").textContent = S.res.stone; $("rpop").textContent = S.people.length + (S.phase === "settled" ? "/" + beds : "");
  $("cap").textContent = "/" + cap; $("food").classList.toggle("low", S.hungry);
  const clk = M.clockOf(S), hour = view.hourOverride ?? clk.hour, sea = view.seasonOverride || M.seasonOf(clk.month), wk = view.weatherOverride || S.weather.kind;
  $("hud").textContent = hhmm(hour) + " · " + sea[0].toUpperCase() + sea.slice(1) + " · " + wk[0].toUpperCase() + wk.slice(1) + (S.weather.temp != null && !view.weatherOverride ? " " + Math.round(S.weather.temp) + "°C" : "") + (speed > 1 ? " · ×" + speed : "");
  $("zl").textContent = (view.zoom >= 1 ? view.zoom : view.zoom.toFixed(2).replace(/0$/, "")) + "×";
  const settled = S.phase === "settled";
  $("rally").hidden = !(OWNER && settled); $("buildbtn").hidden = !(OWNER && settled);
  $("actions").hidden = !!buildType || !$("settle").hidden;
  if (S.phase === "choose") { if (OWNER) { if (!view.ghost) banner("Your wagon has arrived. Tap a spot to settle."); } else banner("The settlers are waiting for the Mayor to choose a place."); }
  else if (S.phase === "travel") banner("The wagon is on its way…");
  else if (buildType) banner("Place: " + M.TYPES[buildType].name, view.ghost ? (view.ghost.ok ? "Tap Place to confirm, or tap elsewhere." : view.ghost.why) : "Tap where it should stand.");
  else if (S.rally) { const r = M.rallyStr(S); banner("All hands: " + S.rally.type + "!", r >= 1 ? "Everyone who can is helping." : "The rush is calming down…"); }
  else banner(null);
  for (const b of document.querySelectorAll("#rally button")) b.classList.toggle("on", !!S.rally && S.rally.type === b.dataset.r);
  toastT -= .25; if (toastT <= 0) { const tb = $("toast"); if (toasts.length) { const t = toasts.shift(); tb.textContent = ""; if (t.title) { const b = document.createElement("b"); b.textContent = t.title; tb.appendChild(b); } const s = document.createElement("span"); s.textContent = t.txt; tb.appendChild(s); tb.hidden = false; tb.classList.remove("in"); void tb.offsetWidth; tb.classList.add("in"); toastT = 4; } else tb.hidden = true; }
  renderLog(false); refreshSel(true);
  if (!$("buildmenu").hidden) fillBuildMenu();
}
function fillBuildMenu() {
  const S = W.S, box = $("blist"); const sig = JSON.stringify([S.res, S.ms]); if (box.dataset.sig === sig) return; box.dataset.sig = sig; box.textContent = "";
  for (const t of M.BUILD_MENU) {
    const T = M.TYPES[t], locked = T.unlock && !S.ms[T.unlock], cost = Object.entries(T.cost).map(([k, v]) => v + " " + k).join(", "), afford = Object.entries(T.cost).every(([k, v]) => S.res[k] >= v * .5);
    const b = document.createElement("button"); b.className = "bitem" + (locked ? " locked" : "") + (buildType === t ? " on" : ""); b.disabled = locked;
    const n = document.createElement("b"); n.textContent = T.name; const c = document.createElement("small"); c.textContent = locked ? M.UNLOCK_TEXT[T.unlock] : cost + (T.beds ? " · " + T.beds + " beds" : "") + (afford ? "" : " · villagers will gather it");
    b.append(n, c); b.addEventListener("click", () => { buildType = t; view.ghost = null; $("buildmenu").hidden = true; showPlace(true); }); box.appendChild(b);
  }
}
function showPlace(on) { $("placebar").hidden = !on; $("placebtn").disabled = !(view.ghost && view.ghost.ok); }
function refreshSel(soft) {
  const p = $("sel"); const b = selId && W.S.b.find(q => q.id === selId);
  if (!b || !OWNER) { p.hidden = true; return; }
  const T = M.TYPES[b.type], sig = [b.id, b.done, b.stage, b.crop, Math.round((b.prog || 0) * 20)].join(); if (soft && p.dataset.sig === sig) return; p.dataset.sig = sig;
  p.hidden = false; p.textContent = "";
  const h = document.createElement("b"); h.textContent = T.name; const d = document.createElement("p");
  d.textContent = b.done ? (b.type === "field" ? ["Plowed, waiting to be sown.", "Sown.", "Growing.", "Ripe, ready to harvest."][b.stage] + " " + (b.auto ? "The villagers picked the crop." : "You picked the crop.") : T.d) : "Being built: " + Math.round(b.prog * 100) + "%. " + (b.by === "mayor" ? "Your order." : "The villagers' own idea.");
  p.append(h, d);
  if (b.type === "field") { const row = document.createElement("div"); row.className = "crops"; for (const c in M.CROPS) { const bt = document.createElement("button"); bt.textContent = M.CROPS[c].name; if (b.crop === c && !b.auto) bt.className = "on"; bt.addEventListener("click", () => doAct({ k: "crop", id: b.id, crop: c })); row.appendChild(bt); } p.appendChild(row); const n = document.createElement("small"); n.textContent = "The new crop is sown after the next harvest."; p.appendChild(n); }
  if (!b.done) { const bt = document.createElement("button"); bt.className = "cancel"; bt.textContent = "Cancel construction"; bt.addEventListener("click", () => { doAct({ k: "cancel", id: b.id }); selId = 0; }); p.appendChild(bt); }
  const x = document.createElement("button"); x.className = "close"; x.textContent = "×"; x.setAttribute("aria-label", "Close"); x.addEventListener("click", () => { selId = 0; p.hidden = true; }); p.appendChild(x);
}
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
function showTip(info, cx, cy) { if (!info) { tip.hidden = true; return; } tip.textContent = ""; const b = document.createElement("b"); b.textContent = info.t; tip.append(b, document.createTextNode(info.d)); tip.hidden = false; const r = $("stage").getBoundingClientRect(); tip.style.left = M.clamp(cx - r.left + 14, 4, r.width - tip.offsetWidth - 4) + "px"; tip.style.top = M.clamp(cy - r.top + 14, 4, r.height - tip.offsetHeight - 4) + "px"; }
cv.addEventListener("pointerdown", e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; down = null; } else down = { x: e.clientX, y: e.clientY, moved: false }; });
cv.addEventListener("pointermove", e => {
  const p = ptrs.get(e.pointerId);
  if (!p) { const w = G.toWorld(e.clientX, e.clientY); view.hover = { vx: w.vx, vy: w.vy }; showTip(G.hitAt(w.vx, w.vy), e.clientX, e.clientY); return; }
  if (pinch && ptrs.size === 2) { p.x = e.clientX; p.y = e.clientY; const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (d / pinch.d > 1.35) { zoomStep(1); pinch.d = d; } else if (d / pinch.d < .74) { zoomStep(-1); pinch.d = d; } return; }
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { down.moved = true; cv.classList.add("drag"); tip.hidden = true; mode = null; }
  if (down && down.moved) { const k = G.artPerCss(); view.cam.x -= (e.clientX - p.x) * k; view.cam.y -= (e.clientY - p.y) * k; }
  p.x = e.clientX; p.y = e.clientY;
});
cv.addEventListener("pointerup", e => {
  ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; cv.classList.remove("drag");
  if (down && !down.moved) tap(e.clientX, e.clientY); down = null;
});
cv.addEventListener("pointercancel", e => { ptrs.delete(e.pointerId); down = null; pinch = null; });
cv.addEventListener("pointerleave", () => { view.hover = null; if (!ptrs.size) tip.hidden = true; });
cv.addEventListener("wheel", e => { e.preventDefault(); zoomStep(e.deltaY < 0 ? 1 : -1); }, { passive: false });
function tap(cx, cy) {
  const w = G.toWorld(cx, cy), S = W.S;
  if (OWNER && S.phase === "choose") { const why = M.judgeSettle(W, w.x, w.y); view.ghost = { kind: "settle", x: w.x, y: w.y, ok: !why }; banner(why || "A good place. Settle here?", why ? "Pick another spot." : "Trees nearby will be cleared."); $("settle").hidden = !!why; return; }
  if (OWNER && buildType) { const T = M.TYPES[buildType], x = Math.round(w.x - T.a / 2), y = Math.round(w.y - T.b / 2), why = M.canPlace(W, buildType, x, y, true); view.ghost = { kind: "build", type: buildType, x, y, ok: !why, why }; showPlace(true); return; }
  const info = G.hitAt(w.vx, w.vy);
  if (OWNER && info && info.b) { selId = info.b; refreshSel(); tip.hidden = true; return; }
  showTip(info, cx, cy); clearTimeout(tipTimer); tipTimer = setTimeout(() => tip.hidden = true, 3500);
}
$("zin").addEventListener("click", () => zoomStep(1)); $("zout").addEventListener("click", () => zoomStep(-1)); $("zworld").addEventListener("click", fitWorld);
$("settle").addEventListener("click", () => { const g = view.ghost; if (g && g.ok) doAct({ k: "settle", x: g.x, y: g.y }); });
for (const b of document.querySelectorAll("#rally button")) b.addEventListener("click", () => doAct({ k: "rally", type: b.dataset.r }));
$("buildbtn").addEventListener("click", () => { const m = $("buildmenu"); m.hidden = !m.hidden; if (!m.hidden) { $("blist").dataset.sig = ""; fillBuildMenu(); } });
$("bclose").addEventListener("click", () => $("buildmenu").hidden = true);
$("placebtn").addEventListener("click", () => { const g = view.ghost; if (g && g.ok) doAct({ k: "place", type: g.type, x: g.x, y: g.y }); });
$("placecancel").addEventListener("click", () => { buildType = null; view.ghost = null; showPlace(false); });
$("center").addEventListener("click", () => { const c = M.camp(W); if (c) centerOn(c.x + 1.5, c.y + 1.5); else centerOn(W.S.wagon.x, W.S.wagon.y); if (view.zoom < 2) setZoom(3); });
// sandbox controls
if (!LIVE) {
  $("dev").hidden = false;
  $("speed").addEventListener("change", e => speed = +e.target.value);
  $("tsl").addEventListener("input", e => { view.hourOverride = parseFloat(e.target.value); $("real").checked = false; });
  $("real").addEventListener("change", e => { if (e.target.checked) view.hourOverride = null; });
  $("season").addEventListener("change", e => view.seasonOverride = e.target.value || null);
  $("weather").addEventListener("change", e => view.weatherOverride = e.target.value || null);
  $("neww").addEventListener("click", () => { if (!confirmNew()) return; newSandbox((Math.random() * 1e9) | 0); });
}
function confirmNew() { return true; }
// ---------- welcome back ----------
function welcomeBack() {
  let seen = null; try { seen = JSON.parse(localStorage.getItem(seenKey) || "null"); } catch (e) { }
  const S = W.S; if (!seen || seen.seed !== S.seed || S.tick - seen.tick < 4 * 60 * 20) return;
  const mins = Math.round((S.tick - seen.tick) / 240), dur = mins >= 60 ? Math.floor(mins / 60) + " h " + (mins % 60) + " min" : mins + " min";
  const lines = S.log.filter(l => l.tk > seen.tick).map(l => l.t).reverse();
  const d = (k) => S.res[k] - (seen.res[k] || 0), sgn = v => (v >= 0 ? "+" : "") + v;
  $("wbtitle").textContent = "While you were away (" + dur + ")";
  const ul = $("wblist"); ul.textContent = "";
  const add = t => { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); };
  add("Food " + sgn(d("food")) + " · Wood " + sgn(d("wood")) + " · Stone " + sgn(d("stone")) + " · Villagers " + sgn(S.people.length - seen.pop));
  for (const t of lines.slice(-8)) add(t);
  if (!lines.length) add("A quiet time. The villagers went about their days.");
  $("wb").hidden = false;
}
$("wbok").addEventListener("click", () => $("wb").hidden = true);
function markSeen() { try { const S = W.S; localStorage.setItem(seenKey, JSON.stringify({ seed: S.seed, tick: S.tick, res: S.res, pop: S.people.length })); } catch (e) { } }
// ---------- main loop ----------
let last = performance.now(), uiAcc = 0, saveAcc = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const rdt = Math.min(.25, (now - last) / 1000); if (now - last < 30) return; last = now;
  if (!W) return;
  if (LIVE) M.advance(W, M.tickNow(W.S, Date.now()), 80);
  else { acc += rdt * speed / M.DT; const n = Math.min(400, Math.floor(acc)); acc -= n; for (let i = 0; i < n; i++) M.step(W); }
  for (const e of W.events) {
    if (e.k === "milestone") toast(e.title, e.txt);
    else if (e.k === "gain" && view.zoom >= 2) G.addFloat(e.x, e.y, "+" + e.amt + " " + e.type, e.type === "wood" ? "#e0b070" : e.type === "stone" ? "#d0d0d0" : "#f08a70");
  }
  if (mode === "follow") { const wg = W.S.wagon; view.cam.x += (G.sx(wg.x, wg.y) - view.cam.x) * .06; view.cam.y += (G.sy(wg.x, wg.y) - 10 - view.cam.y) * .06; if (W.S.phase === "settled") mode = null; }
  G.frame(now, rdt);
  uiAcc += rdt; if (uiAcc > .25) { uiAcc = 0; ui(); }
  saveAcc += rdt; if (saveAcc > 15) { saveAcc = 0; saveSandbox(); markSeen(); }
  if (LIVE && Date.now() - lastPoll > 15000) { lastPoll = Date.now(); poll(); }
}
addEventListener("pagehide", () => { saveSandbox(); markSeen(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) { saveSandbox(); markSeen(); } else if (LIVE) poll(); });
// ---------- start ----------
async function start() {
  G.init(cv); new ResizeObserver(() => G.resize()).observe($("stage")); G.resize();
  $("modeline").textContent = LIVE ? (OWNER ? "Live world · you are the Mayor" : "Live world · watching") : "Sandbox · only in this browser";
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
  requestAnimationFrame(loop);
}
window.UOE = { get W() { return W; }, M, G, doAct, setZoom, fitWorld, view, setSpeed: s => speed = s };
start();
