// Small pixel icons for the UI (12x12, drawn 2x). One letter = one pixel colour.
const PAL = { k: "#24160c", w: "#a8743e", W: "#d6a464", h: "#6a4a2c", g: "#5a9a3a", G: "#2f6a2a", r: "#c84a36", R: "#7a2a20", s: "#9a9890", S: "#d0cec6", d: "#5e5c58", y: "#f0c860", Y: "#b8902c", b: "#5a8ad0", B: "#2e5a9a", f: "#e8b890", c: "#8a5aa0", m: "#c8c8d0", e: "#f3e6c4", n: "#3a2a1c" };
const I = {
  wood: ["............", "............", "..kkkkkkkk..", ".kWwwwwwwWk.", ".kWhwwwwwWk.", "..kkkkkkkk..", ".kkkkkkkk...", "kWwwwwwwWk..", "kWwwwhwwWk..", ".kkkkkkkk...", "............", "............"],
  food: ["............", "....rr.bb...", "...rRrbBbb..", "....rr.bb...", "..kkkkkkkkk.", "..kWwWwWwWk.", "..kwWwWwWwk.", "...kWwWwWk..", "...kwWwWwk..", "....kkkkk...", "............", "............"],
  stone: ["............", "............", "....kkkk....", "...kSSssk...", "..kSsssssk..", ".kSssssdssk.", ".kssssddssk.", ".ksssdddddk.", "..kkkkkkkk..", "............", "............", "............"],
  pop: ["............", ".....kk.....", "....kffk....", "....kffk....", ".....kk.....", "...kccccck..", "..kcccccck..", "..kfcccckf..", "....kcck....", "....kk.kk...", "....kk.kk...", "............"],
  store: ["............", "..kkkkkkkk..", "..kWwWwWwk..", "..kwkkkkWk..", "..kWwWwWwk..", "..kwkkkkWk..", "..kWwWwWwk..", "..kkkkkkkk..", "............", "............", "............", "............"],
  build: ["............", "..kkkkk.....", ".kmmmmmk....", ".kmmmmmkk...", "..kkkkhhk...", ".....khhk...", "......khhk..", ".......khhk.", "........khk.", ".........k..", "............", "............"],
  axe: ["............", "...kkk......", "..kmmmk.....", ".kmmmmhk....", ".kmmmkhhk...", "..kkk.khhk..", "......khhk..", ".......khhk.", "........khk.", ".........k..", "............", "............"],
  pick: ["............", "..kkkkkkk...", ".kmmmmmmmk..", "kmk..khk.kmk", "k....khk...k", ".....khk....", ".....khk....", ".....khk....", ".....khk....", ".....kkk....", "............", "............"],
  basket: ["............", "....kkkk....", "...k....k...", "..k.rrbb.k..", ".kkkkkkkkkk.", ".kWwWwWwWwk.", ".kwWwWwWwWk.", "..kWwWwWwk..", "..kwWwWwWk..", "...kkkkkk...", "............", "............"],
  flag: ["............", "..kkkkkkk...", "..kryrrrrk..", "..krrryrk...", "..krrrrrrk..", "..kkkkkkk...", "..kh........", "..kh........", "..kh........", "..kh........", "..kk........", "............"],
  menu: ["............", "............", ".kkkkkkkkkk.", ".keeeeeeeek.", ".kkkkkkkkkk.", ".keeeeeeeek.", ".kkkkkkkkkk.", ".keeeeeeeek.", ".kkkkkkkkkk.", "............", "............", "............"],
  book: ["............", "..kkkkkkkk..", ".kRrrrrrrRk.", ".kRrykkyrRk.", ".kRrrrrrrRk.", ".kRrykkyrRk.", ".kRrrrrrrRk.", ".kReeeeeeek.", ".kkkkkkkkkk.", "............", "............", "............"],
  coin: ["............", "....kkkk....", "...kYyyYk...", "..kYyYYyYk..", "..kyYykyYk..", "..kyYykyYk..", "..kYyYYyYk..", "...kYyyYk...", "....kkkk....", "............", "............", "............"],
  market: ["............", ".kkkkkkkkkk.", ".krrerrerrk.", ".krrerrerrk.", ".kkkkkkkkkk.", ".kh......hk.", ".kh.yy.y.hk.", ".khkkkkkkhk.", ".khWwWwWwhk.", ".kkkkkkkkkk.", "............", "............"],
  scroll: ["............", ".kkkkkkkkk..", "kWeeeeeeeWk.", ".keknnnkek..", ".keeeeeeek..", ".keknnnnek..", ".keeeeeeek..", ".keknnnkek..", "kWeeeeeeeWk.", ".kkkkkkkkk..", "............", "............"],
  plus: ["............", "............", ".....kk.....", ".....ee.....", ".....ee.....", "..kkeeeekk..", "..kkeeeekk..", ".....ee.....", ".....ee.....", ".....kk.....", "............", "............"],
  minus: ["............", "............", "............", "............", "............", "..keeeeeek..", "..keeeeeek..", "............", "............", "............", "............", "............"],
  globe: ["............", "....kkkk....", "..kkbgbbkk..", ".kbggbbbbbk.", ".kbgggbbgbk.", "kbbggbbbggbk", "kbbbgbbbggbk", ".kbbbbbbgbk.", ".kbbbbbbbbk.", "..kkbbbbkk..", "....kkkk....", "............"],
  home: ["............", ".....kk.....", "....kYYk....", "...kYYYYk...", "..kYYYYYYk..", ".kkkkkkkkkk.", "..kWwWwWwk..", "..kWkkwWwk..", "..kWkkwWwk..", "..kkkkkkkk..", "............", "............"],
  full: ["............", ".kkkk..kkkk.", ".keek..keek.", ".kek....kek.", ".kk......kk.", "............", "............", ".kk......kk.", ".kek....kek.", ".keek..keek.", ".kkkk..kkkk.", "............"],
  back: ["............", "....kk......", "...kek......", "..keekkkkk..", ".keeeeeeeek.", "..keekkkek..", "...kek..kek.", "....kk..kek.", "........kk..", "............", "............", "............"],
  x: ["............", "..kk....kk..", "..kek..kek..", "...kekkek...", "....keek....", "....keek....", "...kekkek...", "..kek..kek..", "..kk....kk..", "............", "............", "............"],
  lock: ["............", "....kkkk....", "...k....k...", "...k....k...", "..kkkkkkkk..", "..kyyyyyyk..", "..kyykkyyk..", "..kyykkyyk..", "..kyyyyyyk..", "..kkkkkkkk..", "............", "............"],
};
const cache = new Map();
export function icon(name, scale = 2) {
  const key = name + scale; if (cache.has(key)) return cache.get(key);
  const m = I[name] || I.x, c = document.createElement("canvas"); c.width = 12 * scale; c.height = 12 * scale; const x = c.getContext("2d");
  for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) { const ch = m[j][i]; if (ch === "." || !PAL[ch]) continue; x.fillStyle = PAL[ch]; x.fillRect(i * scale, j * scale, scale, scale); }
  const url = c.toDataURL(); cache.set(key, url); return url;
}
export function iconEl(name, scale) { const im = document.createElement("img"); im.src = icon(name, scale); im.alt = ""; im.className = "pi"; im.draggable = false; return im; }
