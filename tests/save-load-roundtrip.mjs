const M = await import("../js/sim.js");
const seed=+process.argv[2]||11, HRS=+process.argv[3]||30;
const W = M.createWorld(seed, Date.parse("2026-10-23T05:30:00Z")); const wg=W.S.wagon; let ok=false;
for (let r=2;r<14&&!ok;r++)for(let a=0;a<12&&!ok;a++){const x=Math.round(wg.x+Math.cos(a)*r),y=Math.round(wg.y+Math.sin(a)*r); if(!M.act(W,{k:"settle",x,y}))ok=true;}
const per=3600/M.DT; for(let h=0;h<HRS;h++) for(let i=0;i<per;i++) M.step(W);
const fpc=ch=>JSON.stringify([ch.trees.map(t=>[+t.x.toFixed(2),+t.y.toFixed(2),!!t.felled,!!t.sapling,!!t.gone,t.logs,Math.round((t.regrow||0)/5)*5,!!t.cleared]), ch.rocks.map(t=>[+t.x.toFixed(2),+t.y.toFixed(2),t.stone,Math.round((t.regrow||0)/5)*5]), ch.bushes.map(t=>[+t.x.toFixed(2),+t.y.toFixed(2),!!t.gone,t.berries])]);
const before=new Map(); for(const [k,ch] of W.chunks) before.set(k,fpc(ch));
const W2=M.load(JSON.parse(JSON.stringify(M.serialize(W))));
let diff=0, n=0, ex=[]; for(const [k,v] of before){ const ch=M.getChunk(W2,...k.split(",").map(Number),true); n++; if(fpc(ch)!==v){ diff++; if(ex.length<3) ex.push(k);} }
console.log("seed",seed,"hours",HRS,"chunks",n,"differing after save+load",diff,ex.join(" "), "pop",W.S.people.length,"bld",W.S.b.length);
for (const k of ex) { const a=JSON.parse(before.get(k)), b=JSON.parse(fpc(M.getChunk(W2,...k.split(",").map(Number),true))); for(let l=0;l<3;l++){ const sa=new Set(a[l].map(e=>JSON.stringify(e))), sb=new Set(b[l].map(e=>JSON.stringify(e))); const oa=[...sa].filter(e=>!sb.has(e)), ob=[...sb].filter(e=>!sa.has(e)); if(oa.length||ob.length) console.log(k,"list",l,"len",a[l].length,b[l].length,"onlyBefore",oa.slice(0,3),"onlyAfter",ob.slice(0,3)); } }
