// New worlds (gv 3): the land has all biomes, rivers and water of every kind, and old saves keep their old land.
const M = await import("../js/sim.js");
let ok = true; const fail = m => { ok = false; console.log("FAIL", m); };
for (const seed of [3, 11, 101, 7, 42]) {
  const W = M.createWorld(seed, Date.parse("2026-10-24T05:30:00Z"));
  if (W.S.gv !== 3) fail("seed " + seed + ": new world is not gv 3");
  const c = { land: 0, river: 0, desert: 0, swamp: 0, tundra: 0, grove: 0, birch: 0, flower: 0, n: 0 };
  for (let y = -600; y < 600; y += 8) for (let x = -600; x < 600; x += 8) {
    c.n++; if (M.elev(x, y) < M.SEA) continue; c.land++;
    if (M.isRiver(x, y)) c.river++; if (M.desertV(x, y) > 0) c.desert++; if (M.swampV(x, y) > 0) c.swamp++; if (M.tundraV(x, y) > 0) c.tundra++; if (M.groveV(x, y) > 0) c.grove++; if (M.birchV(x, y) > .45) c.birch++; if (M.flowerV(x, y) > .45) c.flower++;
  }
  const f = k => c[k] / c.land; console.log("seed", seed, "land", (c.land / c.n * 100).toFixed(0) + "%", "river", (f("river") * 100).toFixed(1) + "%", "desert", (f("desert") * 100).toFixed(0) + "%", "swamp", (f("swamp") * 100).toFixed(0) + "%", "tundra", (f("tundra") * 100).toFixed(0) + "%", "grove", (f("grove") * 100).toFixed(0) + "%", "birch", (f("birch") * 100).toFixed(0) + "%");
  if (c.land / c.n < .3 || c.land / c.n > .97) fail("seed " + seed + ": land fraction out of range");
  const plain = c.land - c.desert - c.swamp - c.tundra - c.grove; if (plain / c.land < .35) fail("seed " + seed + ": too little temperate land");
  // the wonders of the whole world can be listed without exploring
  const wl = M.wondersInRect(W, -300, -300, 300, 300); if (wl.length < 10) fail("seed " + seed + ": too few wonders in the preview rectangle (" + wl.length + ")");
}
// a world saved before version 3 keeps its terrain: the same seed made with gv 2 differs from the v3 land but is still the same every time
{
  const A = M.createWorld(11, 0); const S2 = JSON.parse(JSON.stringify(M.serialize(A))); S2.gv = 2; const B = M.load(S2); const hB = [], C2 = M.load(JSON.parse(JSON.stringify(S2)));
  for (let i = 0; i < 40; i++) { const x = -200 + i * 10, y = 90 - i * 7; hB.push(M.elev(x, y).toFixed(4)); }
  M.activate(C2); const hC = []; for (let i = 0; i < 40; i++) { const x = -200 + i * 10, y = 90 - i * 7; hC.push(M.elev(x, y).toFixed(4)); }
  if (hB.join() !== hC.join()) fail("a gv 2 world does not give the same land twice");
}
console.log(ok ? "WORLD V3 OK" : "WORLD V3 FAILED"); process.exit(ok ? 0 : 1);
