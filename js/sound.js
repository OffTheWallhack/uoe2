// ============================================================
// Very gentle sound: soft ambience made in the browser (wind, rain, birds at day, crickets at night),
// a few quiet chimes, and an optional music player that plays whatever is listed in assets/music/list.json.
// Nothing loud, everything fades in and out. Starts after the first tap (browsers need that).
// ============================================================
let ac = null, master = null, sfxG = null, ambG = null, musG = null, noiseBuf = null;
const L = { wind: null, rain: null, sea: null, crick: null }; let env = { night: 0, rain: 0, snow: 0, water: 0, warm: 1, frozen: 0, day: 1 };
let vol = { sfx: .35, music: .25 }; try { const v = JSON.parse(localStorage.getItem("uoe2-vol") || "null"); if (v) vol = { sfx: +v.sfx, music: +v.music }; } catch { }
export const getVol = () => ({ ...vol });
export function setVol(k, v) { vol[k] = Math.max(0, Math.min(1, v)); try { localStorage.setItem("uoe2-vol", JSON.stringify(vol)); } catch { } apply(); }
function apply() { if (!ac) return; const t = ac.currentTime; sfxG.gain.setTargetAtTime(vol.sfx, t, .2); ambG.gain.setTargetAtTime(vol.sfx, t, .4); musG.gain.setTargetAtTime(vol.music * .5, t, .6); }
function noise() { if (noiseBuf) return noiseBuf; const n = ac.sampleRate * 3, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0); let l = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; l = (l + .02 * w) / 1.02; d[i] = l * 3.5 * .5 + w * .35; } return noiseBuf = b; }
function layer(type, f1, f2, q) { const s = ac.createBufferSource(); s.buffer = noise(); s.loop = true; const a = ac.createBiquadFilter(); a.type = type; a.frequency.value = f1; if (q) a.Q.value = q; let last = a; s.connect(a); if (f2) { const b = ac.createBiquadFilter(); b.type = "lowpass"; b.frequency.value = f2; a.connect(b); last = b; } const g = ac.createGain(); g.gain.value = 0; last.connect(g); g.connect(ambG); s.start(); return { g, f: a }; }
export function initSound() {
  if (ac) { if (ac.state === "suspended") ac.resume(); return; }
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  master = ac.createGain(); master.gain.value = 1; master.connect(ac.destination);
  sfxG = ac.createGain(); ambG = ac.createGain(); musG = ac.createGain(); sfxG.connect(master); ambG.connect(master); musG.connect(master); sfxG.gain.value = 0; ambG.gain.value = 0; musG.gain.value = 0; apply();
  L.wind = layer("lowpass", 380); L.rain = layer("highpass", 1500, 7000); L.sea = layer("lowpass", 700, 1500);
  // crickets: a quiet high tone, switched on and off very fast
  const co = ac.createOscillator(); co.frequency.value = 4300; const cg = ac.createGain(); cg.gain.value = 0; const lfo = ac.createOscillator(); lfo.frequency.value = 17; const lg = ac.createGain(); lg.gain.value = .5; const off = ac.createConstantSource ? ac.createConstantSource() : null;
  lfo.connect(lg); lg.connect(cg.gain); co.connect(cg); const cmaster = ac.createGain(); cmaster.gain.value = 0; cg.connect(cmaster); cmaster.connect(ambG); co.start(); lfo.start(); L.crick = { g: cmaster }; cg.gain.value = .5;
  const t = ac.currentTime; ambG.gain.setValueAtTime(0, t); apply(); tick(); loadMusic();
}
const set = (l, v, tc = 2) => { if (l) l.g.gain.setTargetAtTime(v, ac.currentTime, tc); };
// the game tells us what it looks like outside now (called about once a second)
export function setEnv(e) { env = { ...env, ...e }; if (!ac) return; const e2 = env;
  set(L.wind, .05 + .03 * e2.night + .06 * e2.rain + (e2.frozen ? .05 : 0)); if (L.wind) L.wind.f.frequency.setTargetAtTime(300 + 400 * e2.rain + 200 * e2.frozen, ac.currentTime, 2);
  set(L.rain, e2.rain * .09); set(L.sea, e2.water * .06); set(L.crick, e2.night * e2.warm * (1 - e2.rain) * .0045 * (e2.water ? .5 : 1)); }
function chirp(f0, dur, amp) { const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime; o.type = "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 1.35, t + dur * .6); o.frequency.exponentialRampToValueAtTime(f0 * .9, t + dur); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(g); g.connect(ambG); o.start(t); o.stop(t + dur + .05); }
function tick() { // birds at day, now and then
  setTimeout(tick, 2500 + Math.random() * 6000); if (!ac || document.hidden) return;
  if (env.day > .5 && env.rain < .3 && !env.frozen && !env.snow) { const n = 2 + (Math.random() * 3 | 0), f = 2600 + Math.random() * 1800; for (let i = 0; i < n; i++) setTimeout(() => chirp(f * (1 + (i % 2) * .08), .09 + Math.random() * .05, .012), i * 140); }
}
function note(f, t0, dur, amp, type = "triangle", out) { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0, ac.currentTime + t0); g.gain.linearRampToValueAtTime(amp, ac.currentTime + t0 + .02); g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + t0 + dur); o.connect(g); g.connect(out || sfxG); o.start(ac.currentTime + t0); o.stop(ac.currentTime + t0 + dur + .1); }
const N = { C5: 523.3, E5: 659.3, G5: 784, C6: 1046.5, D5: 587.3, A4: 440, G4: 392 };
export function sfx(name) {
  if (!ac || vol.sfx <= 0) return;
  if (name === "wonder") { [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => note(f, i * .16, 1.4, .09)); }
  else if (name === "treasure") { note(N.G5, 0, .9, .08); note(N.C6, .14, 1.1, .07); }
  else if (name === "scroll") { [N.A4, N.D5, N.A4 * 1.5].forEach((f, i) => note(f, i * .2, 1.2, .07)); }
  else if (name === "milestone") { note(N.E5, 0, 1, .06); note(N.G5, .12, 1, .05); }
  else if (name === "horn") { note(150, 0, 1.2, .07, "sine"); note(225, .05, 1.1, .04, "sine"); }
  else if (name === "thunder") { const s = ac.createBufferSource(); s.buffer = noise(); const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 220; const g = ac.createGain(), t = ac.currentTime + .3; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.35, t + .1); g.gain.exponentialRampToValueAtTime(.001, t + 2.6); s.connect(f); f.connect(g); g.connect(sfxG); s.start(t); s.stop(t + 3); }
  else if (name === "tap") { note(660, 0, .12, .025, "sine"); }
}
// ---- optional music: put files in assets/music/ and list them in assets/music/list.json, e.g. ["calm1.mp3","calm2.mp3"] ----
let list = [], cur = null, mi = 0;
async function loadMusic() { try { const r = await fetch("assets/music/list.json", { cache: "no-cache" }); if (!r.ok) return; list = (await r.json()).filter(x => typeof x === "string"); if (list.length) { mi = Math.floor(Math.random() * list.length); playNext(); } } catch { } }
function playNext() {
  if (!list.length) return; const a = new Audio("assets/music/" + list[mi % list.length]); mi++; a.crossOrigin = "anonymous"; a.volume = 1; cur = a;
  try { const src = ac.createMediaElementSource(a); src.connect(musG); } catch { }
  a.addEventListener("ended", () => setTimeout(playNext, 8000 + Math.random() * 20000)); a.addEventListener("error", () => setTimeout(playNext, 20000)); a.play().catch(() => { });
}
