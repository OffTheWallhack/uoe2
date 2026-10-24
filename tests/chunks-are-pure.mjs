import fs from "fs";
const M = await import("../js/sim.js");
const fp = ch => JSON.stringify([ch.trees.map(t=>[t.x.toFixed(3),t.y.toFixed(3),t.t,t.s.toFixed(3),t.felled]), ch.rocks.map(t=>[t.x.toFixed(3),t.y.toFixed(3),t.stone,t.big]), ch.bushes.map(t=>[t.x.toFixed(3),t.y.toFixed(3),!!t.gone]), ch.shore.map(t=>[t.x,t.y])]);
function gen(W, order){ const m=new Map(); for(const [cx,cy] of order){ m.set(cx+","+cy, fp(M.getChunk(W,cx,cy,true))); } return m; }
let allOk=true;
for (const seed of [3,11,101]) {
  const R=6, order=[]; for(let cy=-R;cy<=R;cy++)for(let cx=-R;cx<=R;cx++)order.push([cx,cy]);
  const A=M.createWorld(seed, Date.parse("2026-10-23T05:30:00Z")); const ma=gen(A,order);
  const B=M.createWorld(seed, Date.parse("2026-10-23T05:30:00Z"));
  // villagers have changed the land: fills and bridges over every water tile near the start, gravel roads
  let k=0; for (let y=-150;y<150;y+=1) for(let x=-150;x<150;x+=1){ if(M.isWater(x+.5,y+.5) && ((x*7+y*13)%5===0)) { B.over[x+":"+y]={k:(k++%2?"f":"b"),z:2,d:0}; } }
  const B2=M.load(JSON.parse(JSON.stringify(M.serialize(B)))); for(const key in B.over) B2.over[key]=B.over[key]; B2.S.over=B.over; M.activate(B2);
  const ord2=order.slice().reverse(); const mb=gen(B2,ord2);
  let diff=0; for(const [kk,v] of ma) if(mb.get(kk)!==v) diff++;
  console.log("seed",seed,"chunks",ma.size,"over tiles",Object.keys(B2.over).length,"differing chunks",diff); if(diff) allOk=false;
}
console.log(allOk?"PURE":"NOT PURE");
{
  const seed=11, R=6, order=[]; for(let cy=-R;cy<=R;cy++)for(let cx=-R;cx<=R;cx++)order.push([cx,cy]);
  const A=M.createWorld(seed, Date.parse("2026-10-23T05:30:00Z")); const ma=gen(A,order);
  const B=M.createWorld(seed, Date.parse("2026-10-23T05:30:00Z")); let k=0; for (let y=-150;y<150;y+=1) for(let x=-150;x<150;x+=1){ if(M.isWater(x+.5,y+.5) && ((x*7+y*13)%5===0)) { B.over[x+":"+y]={k:(k++%2?"f":"b"),z:2,d:0}; } }
  const B2=M.load(JSON.parse(JSON.stringify(M.serialize(B)))); for(const key in B.over) B2.over[key]=B.over[key]; M.activate(B2); const mb=gen(B2,order.slice().reverse());
