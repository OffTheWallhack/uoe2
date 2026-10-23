// ============================================================
// Usage of Empires II — sprites. Buildings are ray-cast from simple 3D faces
// (pixel exact, no anti-aliasing). Trees, rocks, bushes, props are drawn per pixel.
// ============================================================
import { ih, clamp } from "./sim.js";
export const PAL={
 summer:{g:[[52,104,36],[66,124,44],[84,144,52],[106,164,64]],flo:[[232,150,60],[240,220,90],[236,236,236],[220,120,150]],tree:[[24,64,40],[34,88,50],[52,116,60],[80,142,70]],leaf:[[44,92,36],[64,124,46],[92,156,58],[128,182,80]],dirt:[[112,78,50],[134,94,58],[152,108,66],[170,124,78]],water:[[44,86,112],[58,108,136],[96,150,174]],berry:[60,70,160],snow:0},
 spring:{g:[[62,116,44],[80,138,54],[102,158,66],[128,180,84]],flo:[[244,170,204],[250,250,250],[190,170,240],[250,230,110]],tree:[[28,72,44],[40,98,56],[60,126,66],[90,152,78]],leaf:[[70,130,56],[96,160,70],[130,188,92],[170,210,120]],dirt:[[112,78,50],[134,94,58],[152,108,66],[170,124,78]],water:[[48,92,120],[62,114,142],[104,158,182]],berry:[236,236,236],snow:0},
 autumn:{g:[[76,98,38],[96,116,44],[120,130,52],[148,140,60]],flo:[[210,110,50],[230,170,60],[200,60,40],[240,220,120]],tree:[[28,66,42],[38,86,50],[54,110,58],[78,132,66]],leaf:[[150,70,30],[196,106,40],[222,146,56],[240,186,80]],dirt:[[104,72,46],[126,88,54],[144,102,62],[162,118,74]],water:[[42,80,104],[54,100,128],[90,140,164]],berry:[200,50,40],snow:0},
 winter:{g:[[196,208,218],[214,224,232],[232,238,244],[246,250,253]],flo:[[246,250,253]],tree:[[30,66,50],[42,88,64],[58,110,76],[84,134,92]],leaf:[[96,84,70],[120,106,90],[150,134,114],[200,200,200]],dirt:[[120,100,84],[140,120,100],[160,140,118],[184,164,140]],water:[[150,176,196],[176,200,216],[210,226,238]],berry:null,snow:1}
};
const WALL={cream:[214,196,156],stone:[164,160,150],wood:[140,100,64],red:[160,62,48]};
const ROOF={red:[182,66,52],brown:[118,80,52],teal:[64,122,116],slate:[90,100,122],thatch:[184,152,88]};
const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const mul=(c,m)=>[c[0]*m,c[1]*m,c[2]*m];
const SNOW=[238,243,250];
// ---- face primitives (view ray: p(t)=(x0+t, y0+t, 8t); larger t = nearer) ----
const XP=(c,ylo,yhi,zlo,zhi,col)=>({hit(x0,y0){const t=c-x0,y=y0+t,z=8*t;if(y<ylo||y>yhi||z<zlo)return null;const zh=typeof zhi==="function"?zhi(y):zhi;if(z>zh)return null;return{t,u:y,v:z}},col});
const YP=(c,xlo,xhi,zlo,zhi,col)=>({hit(x0,y0){const t=c-y0,x=x0+t,z=8*t;if(x<xlo||x>xhi||z<zlo)return null;const zh=typeof zhi==="function"?zhi(x):zhi;if(z>zh)return null;return{t,u:x,v:z}},col});
const SL=(a,b,cc,inside,col)=>({hit(x0,y0){const den=8-b-cc;if(den<.0001)return null;const t=(a+b*x0+cc*y0)/den,x=x0+t,y=y0+t,z=8*t;if(z<0||!inside(x,y,z))return null;return{t,u:x,v:y,x,y,z}},col});
function render(faces,bb,outline){
  const sxmin=Math.floor((bb.x0-bb.y1)*8)-2,sxmax=Math.ceil((bb.x1-bb.y0)*8)+2,symin=Math.floor((bb.x0+bb.y0)*4-bb.zmax)-2,symax=Math.ceil((bb.x1+bb.y1)*4)+2;
  const w=sxmax-sxmin,h=symax-symin,cv=document.createElement("canvas");cv.width=w;cv.height=h;
  const cx=cv.getContext("2d"),img=cx.createImageData(w,h),d=img.data;
  for(let py=0;py<h;py++)for(let px=0;px<w;px++){
    const a=(sxmin+px+.5)/8,b=(symin+py+.5)/4,x0=(a+b)/2,y0=(b-a)/2;let best=-1e9,col=null;
    for(const f of faces){const hh=f.hit(x0,y0);if(hh&&hh.t>best){const c=f.col(hh,px,py);if(c){best=hh.t;col=c}}}
    if(col){const o=(py*w+px)*4;d[o]=col[0];d[o+1]=col[1];d[o+2]=col[2];d[o+3]=255}
  }
  if(outline!==false){const al=new Uint8Array(w*h);for(let i=0;i<w*h;i++)al[i]=d[i*4+3]?1:0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(!al[i])continue;
      if(x===0||y===0||x===w-1||y===h-1||!al[i-1]||!al[i+1]||!al[i-w]||!al[i+w]){const o=i*4;d[o]*=.58;d[o+1]*=.56;d[o+2]*=.6}}}
  cx.putImageData(img,0,0);return{canvas:cv,ax:-sxmin,ay:-symin,w,h};
}
const proj=(x,y,z,s)=>[s.ax+(x-y)*8,s.ay+(x+y)*4-z];
function box(x0,y0,x1,y1,z0,z1,colE,colS,colT){return[XP(x1,y0,y1,z0,z1,colE),YP(y1,x0,x1,z0,z1,colS),SL(z1,0,0,(x,y)=>x>=x0&&x<=x1&&y>=y0&&y<=y1,colT)]}
// ---- direct pixel sprites ----
function canvasOf(w,h){const c=document.createElement("canvas");c.width=w;c.height=h;const x=c.getContext("2d");return{c,x,img:x.createImageData(w,h)}}
function put(img,w,x,y,col,a){if(x<0||y<0||x>=w||y>=img.height)return;const o=(y*w+x)*4,d=img.data;d[o]=col[0];d[o+1]=col[1];d[o+2]=col[2];d[o+3]=a===undefined?255:a}
function finishOutline(S,col){
  const {img,x,c}=S,w=c.width,h=c.height,d=img.data,al=new Uint8Array(w*h);
  for(let i=0;i<w*h;i++)al[i]=d[i*4+3]===255?1:0;
  for(let y=0;y<h;y++)for(let xx=0;xx<w;xx++){const i=y*w+xx;if(!al[i])continue;if(xx===0||y===0||xx===w-1||y===h-1||(!al[i-1]&&d[(i-1)*4+3]===0)||(!al[i+1]&&d[(i+1)*4+3]===0)||(!al[i-w]&&d[(i-w)*4+3]===0)){const o=i*4;d[o]*=.62;d[o+1]*=.6;d[o+2]*=.64}}
  x.putImageData(img,0,0);return{canvas:c,ax:w>>1,ay:h-2,w,h,wins:[],chim:null};
}
function spruce(size,v,season){
  const P=PAL[season],hw=Math.round(6*size),h=Math.round(26*size),w=hw*2+3,S=canvasOf(w,h+3),tiers=h>30?4:3,th=(h-6)/tiers,cx=hw+1;
  for(let y=0;y<h-5;y++){
    const ti=Math.min(tiers-1,Math.floor(y/th)),ry=y-ti*th,hwT=(.5+.5*(ti+1)/tiers)*hw,wr=hwT*(.18+.82*ry/th);
    for(let x=Math.ceil(cx-wr);x<=Math.floor(cx+wr);x++){
      const rel=(x-cx)/Math.max(1,hwT);let L=.62-rel*.55-(ry/th)*.18+(ih(x+v*50,y)-.5)*.4;if(ry>th-1.5)L-=.35;
      let c=P.tree[clamp(Math.round(L*3),0,3)];
      if(P.snow&&ry<th*.5&&ih(x*3,y*7+v*9)<.8-rel*.2)c=mix(c,SNOW,.85-ry/th*.5);
      put(S.img,w,x,y,c);
    }
  }
  for(let y=h-6;y<h-1;y++){put(S.img,w,cx,y,[88,60,38]);put(S.img,w,cx+1,y,[62,42,28])}
  for(let x=-hw;x<=hw+1;x++)for(let y=0;y<2;y++){if(Math.abs(x)<hw*.8-y)put(S.img,w,cx+x+3,h-2+y,[0,0,0],46)}
  return finishOutline(S);
}
function oak(size,v,season,birch){
  const P=PAL[season],r=Math.round(8*size),w=r*2+8,h=r*2+14,S=canvasOf(w,h),cx=r+3,cy=r+1;
  const blobs=[[0,0,r],[-r*.55,r*.25,r*.7],[r*.55,r*.2,r*.7],[0,-r*.45,r*.65]];
  const bare=season==="winter";
  for(let y=0;y<h-4;y++)for(let x=0;x<w;x++){
    let best=null;
    for(const b of blobs){const dx=(x-cx-b[0])/b[2],dy=(y-cy-b[1])/b[2],dd=dx*dx+dy*dy;if(dd<1&&(!best||dd<best.dd))best={dd,dx,dy}}
    if(!best)continue;
    if(bare){if(ih(x*3+v*10,y*5)<.18)put(S.img,w,x,y,[90,76,64]);else if(best.dy<-.3&&ih(x,y)<.7)put(S.img,w,x,y,SNOW);continue}
    const L=.55+(-best.dx*.5-best.dy*.6)*.5+(ih(x+v*40,y)-.5)*.5;
    let c=P.leaf[clamp(Math.round(L*3),0,3)];if(birch)c=mix(c,[200,220,120],.3);
    put(S.img,w,x,y,c);
  }
  const tx=cx,ty0=cy+r-2;for(let y=ty0;y<h-2;y++){const c=birch?(y%3?[226,222,214]:[44,40,40]):[90,62,40];put(S.img,w,tx,y,c);put(S.img,w,tx+1,y,mul(c,.7))}
  for(let x=-r;x<=r+2;x++)for(let y=0;y<2;y++)if(Math.abs(x)<r*.9)put(S.img,w,cx+x+2,h-3+y,[0,0,0],46);
  return finishOutline(S);
}
function bush(season,v,berries){const P=PAL[season],w=10,h=8,S=canvasOf(w,h);
  for(let y=0;y<6;y++)for(let x=0;x<w;x++){const dx=(x-4.5)/4.8,dy=(y-3)/3,dd=dx*dx+dy*dy;if(dd<1){const L=.6-dx*.3-dy*.5+(ih(x+v*30,y)-.5)*.4;put(S.img,w,x,y,P.leaf[clamp(Math.round(L*3),0,3)])}}
  if(berries&&P.berry)for(let i=0;i<5;i++)put(S.img,w,2+((ih(i,v*9)*6)|0),1+((ih(v*7,i)*3)|0),P.berry);
  if(P.snow)for(let x=1;x<w-1;x++)put(S.img,w,x,1,SNOW);
  const r=finishOutline(S);r.ay=6;return r}
function rock(v,season,big){const k=big?1.7:1,w=Math.round(9*k)+1,h=Math.round(6*k)+1,S=canvasOf(w,h);
  for(let y=0;y<h-1;y++)for(let x=0;x<w;x++){const dx=(x-(w-1)/2)/(4.4*k),dy=(y-(h-1)/2)/(2.6*k)+(big?Math.sin(x*.9+v*5)*.12:0);if(dx*dx+dy*dy<1){const L=.7-dx*.3-dy*.6+(ih(x,y+v*9)-.5)*.3;put(S.img,w,x,y,mul([152,150,146],.6+L*.7))}}
  if(PAL[season].snow)for(let x=2;x<w-2;x++)put(S.img,w,x,big?1:0,SNOW);
  const r=finishOutline(S);r.ay=h-1;return r}
// ---- covered wagon (long side along world x) ----
function wagonModel(season){
  const L=2.4,W=1.3,ym=W/2,z0=8,k=10,r=.62,snow=PAL[season].snow;
  const plank=(sh)=>(h,px,py)=>{const c=(Math.floor(h.v/1.6)&1)?[150,104,64]:[128,88,54];return mul(c,sh*(.92+ih(px,py)*.14))};
  const cloth=(sh)=>(h,px,py)=>{let c=[226,214,186];const rib=Math.abs(((h.x||h.u)*2.2)%1-.5)<.07;if(rib)c=[170,150,120];if(snow&&h.z>z0+k*r*.7&&ih(px,py*3)<.8)c=[240,244,250];return mul(c,sh*(.94+ih(px*5,py)*.1))};
  const f=[];
  box(0,0,L,W,3,z0,plank(.72),plank(1),()=>[110,78,50]).forEach(q=>f.push(q));
  // canvas cover: half cylinder along x
  f.push({hit(x0,y0){const A=1+64/(k*k),B=2*(y0-ym)-16*z0/(k*k),C=(y0-ym)**2+z0*z0/(k*k)-r*r,D=B*B-4*A*C;if(D<0)return null;
    const t=(-B+Math.sqrt(D))/(2*A),x=x0+t,y=y0+t,z=8*t;if(z<z0||x<.15||x>L-.15)return null;return{t,u:x,v:z,x,y,z}},
    col:(h,px,py)=>{const sh=.72+.38*clamp((h.y-ym)/r*.5+.5,0,1);return cloth(sh)(h,px,py)}});
  f.push(XP(L-.15,ym-r,ym+r,z0,y=>z0+k*Math.sqrt(Math.max(0,r*r-(y-ym)**2)),(h,px,py)=>{const dd=Math.hypot(h.u-ym,(h.v-z0)/k);return dd<r*.55?[52,38,28]:cloth(.8)(h,px,py)}));
  const s=render(f,{x0:0,y0:0,x1:L,y1:W,zmax:z0+k*r+2});
  // wheels on the south side
  const c=s.canvas.getContext("2d");
  for(const wx of [.45,L-.45]){const [cx,cy]=proj(wx,W+.02,3.2,s);
    for(let a=0;a<6.3;a+=.12){const px=Math.round(cx+Math.cos(a)*3.2),py=Math.round(cy+Math.sin(a)*3.4);c.fillStyle="#3a281a";c.fillRect(px,py,1,1)}
    c.fillStyle="#5a4028";c.fillRect(Math.round(cx)-1,Math.round(cy)-3,1,7);c.fillRect(Math.round(cx)-3,Math.round(cy),7,1);c.fillStyle="#2a1c12";c.fillRect(Math.round(cx)-1,Math.round(cy),2,1)}
  s.wins=[];s.chim=null;s.L=L;s.W=W;return s;
}
// ---- A-frame tent of the wagon camp ----
function tentModel(season){
  const a=2.6,b=2.1,rr=13,ym=b/2,ov=.12,k=(rr)/(ym+ov),snow=PAL[season].snow;
  const cl=(sh)=>(h,px,py)=>{const s=Math.abs(h.v-ym);let c=[218,204,172];if(Math.floor(h.u*3)%2)c=mul(c,.95);if(s<.1)c=[176,150,112];if(snow&&ih(px*3,py*5)<.85-s*.3)c=[238,243,250];return mul(c,sh*(.94+ih(px,py)*.1))};
  const f=[];
  f.push(XP(a,0,b,0,y=>rr*(1-Math.abs(y-ym)/ym),(h,px,py)=>{const d=Math.abs(h.u-ym);if(d<.32&&h.v<rr*(1-d/ym)-3)return d<.05?[120,90,60]:[70,52,36];return cl(.74)(h,px,py)}));
  f.push(SL(rr+k*ym,0,-k,(x,y)=>y>=ym&&y<=b+ov&&x>=-ov&&x<=a+ov,(h,px,py)=>cl(1)({u:h.u,v:h.v},px,py)));
  f.push(SL(rr-k*ym,0,k,(x,y)=>y<=ym&&y>=-ov&&x>=-ov&&x<=a+ov,(h,px,py)=>cl(.7)({u:h.u,v:h.v},px,py)));
  box(a-.05,ym-.05,a+.05,ym+.05,rr-1,rr+4,()=>[90,62,40],()=>[110,78,50],()=>[120,88,56]).forEach(q=>f.push(q));
  const s=render(f,{x0:-ov,y0:-ov,x1:a+ov,y1:b+ov,zmax:rr+5});s.wins=[proj(a,ym,3,s)];s.chim=null;return s;
}
// ---- small props drawn per pixel ----
function firepit(season){const w=13,h=7,S=canvasOf(w,h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const dx=(x-6)/6.3,dy=(y-3)/3.3,dd=dx*dx+dy*dy;
    if(dd<1&&dd>.42){if(ih(x*5,y*3)<.85)put(S.img,w,x,y,mul([150,146,138],.7+(1-dy)*.25+ih(x,y)*.12))}else if(dd<=.42)put(S.img,w,x,y,[52,44,40])}
  if(PAL[season].snow)for(let x=2;x<w-2;x++)if(ih(x,9)<.6)put(S.img,w,x,0,[238,243,250]);
  const r=finishOutline(S);r.ax=6;r.ay=3;return r}
function stump(season){const w=6,h=5,S=canvasOf(w,h);
  for(let x=0;x<w;x++)for(let y=1;y<h;y++)put(S.img,w,x,y,y===1?[176,138,92]:[96,66,42]);
  for(let x=1;x<w-1;x++)put(S.img,w,x,0,PAL[season].snow?[238,243,250]:[196,160,110]);put(S.img,w,2,1,[140,104,66]);
  const r=finishOutline(S);r.ax=3;r.ay=4;return r}
function woodpile(n){const w=8+n*4,h=4+n*3,S=canvasOf(w,h);
  for(let row=0;row<n;row++){const y0=h-4-row*3,cnt=n-row+1;for(let i=0;i<cnt;i++){const x0=row*2+i*4;
    for(let x=0;x<4;x++)for(let y=0;y<3;y++){const e=(x===0||x===3||y===0||y===2);put(S.img,w,x0+x,y0+y,e?[120,82,50]:(x===1&&y===1?[150,108,66]:[204,160,104]))}}}
  const r=finishOutline(S);r.ax=w>>1;r.ay=h-1;return r}
function stoneheap(n){const w=8+n*3,h=4+n*2,S=canvasOf(w,h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const dx=(x-(w-1)/2)/((w)/2),dy=(y-h)/(h),dd=dx*dx+dy*dy;if(dd<1){const c=ih(Math.floor(x/2)+n,Math.floor(y/2));put(S.img,w,x,y,mul([150,148,144],.62+c*.4+(1+dy)*.1))}}
  const r=finishOutline(S);r.ax=w>>1;r.ay=h-1;return r}
function baskets(n){const w=6+n*5,h=7,S=canvasOf(w,h);
  for(let i=0;i<=n;i++){const x0=i*5;for(let x=0;x<5;x++)for(let y=2;y<7;y++)put(S.img,w,x0+x,y,(y+x)%2?[176,132,72]:[150,108,58]);
    for(let x=1;x<4;x++)put(S.img,w,x0+x,1,i%2?[200,60,50]:[90,80,170]);put(S.img,w,x0+2,0,i%2?[220,90,70]:[110,100,190])}
  const r=finishOutline(S);r.ax=w>>1;r.ay=h-1;return r}
// ---- house / barn ----
function houseModel(o,season){
  const a=o.a,b=o.b,H=o.H,rr=o.rr,ov=.14,wc=WALL[o.wall],rc=ROOF[o.roof],P=PAL[season],snow=P.snow;
  const rx=o.ridge==="x",span=rx?b/2:a/2,k=(rr+1.2)/(span+ov),ym=b/2,xm=a/2,barn=o.k==="barn";
  const wins=[];
  const zG=(c)=>c; 
  // window layouts (u along wall, z range)
  const swWin=barn||o.nowin?[]:(a>=4?[[.55,1.0],[a-1.0,a-.55]]:a>=3?[[.45,.9],[a-.9,a-.45]]:[]);
  const door=barn?[xm-.95,xm+.95,0,Math.min(11,H-1)]:[xm-.26,xm+.26,0,Math.min(9,H+2)];
  const seWin=barn?[[b/2-.2,b/2+.2]]:o.nowin?[]:(b>=4?[[.7,1.1],[b-1.1,b-.7]]:[[b/2-.2,b/2+.2]]);
  function wallColor(shade,isSW){
    return(h,px,py)=>{
      const u=h.u,v=h.v,n=1+(ih(px,py)-.5)*.1;
      if(isSW){
        if(u>=door[0]&&u<=door[1]&&v<=door[3]){
          const dd=(u-door[0])/(door[1]-door[0]);let c;
          if(barn){const cross=Math.abs(dd-v/door[3])<.07||Math.abs(dd-(1-v/door[3]))<.07,frame=dd<.05||dd>.95||v>door[3]-1.2||Math.abs(dd-.5)<.03;c=(cross||frame)?[232,222,200]:mul(wc,.5)}
          else{const fr=u<door[0]+.1||u>door[1]-.1||v>door[3]-1.2;c=fr?[60,38,24]:[92,60,38]}
          return mul(c,shade*n)}
        for(const w of swWin)if(u>w[0]&&u<w[1]&&v>5&&v<9)return mul((v<5.8||v>8.2||u<w[0]+.07||u>w[1]-.07)?[238,226,200]:[60,76,98],shade);
      }else{
        for(const w of seWin)if(u>w[0]&&u<w[1]&&v>5&&v<9)return mul((v<5.8||v>8.2||u<w[0]+.07||u>w[1]-.07)?[238,226,200]:[60,76,98],shade);
      }
      let c=wc;
      if(o.wall==="wood"||barn){if(Math.floor(u*4)%2===0)c=mul(c,.92)}
      else if(o.wall==="stone"){const r=Math.floor(v/3),s=(Math.floor(u*3+(r&1)*.5));c=mul(c,(ih(r,s)*.2+.9))}
      if(v<2)c=mul(c,.78);
      if(v>H-1.2&&!barn)c=mul(c,.9);
      return mul(c,shade*n);
    };
  }
  const zhiX=o.ridge==="x"?(y=>H+rr*(1-Math.abs(y-ym)/ym)):H;   // x-planes: gable if ridge along x
  const zhiY=o.ridge==="y"?(x=>H+rr*(1-Math.abs(x-xm)/xm)):H;
  const faces=[XP(a,0,b,0,zhiX,wallColor(.74,false)),YP(b,0,a,0,zhiY,wallColor(1,true))];
  function roofCol(shade,distFn){
    return(h,px,py)=>{
      const s=distFn(h),row=Math.floor(s*5),n=1+(ih(px,py)-.5)*.12;let c=rc;
      if(o.roof==="thatch"){c=mul(c,.86+ih(px,Math.floor(py/2))*.26);if(row%2===0&&ih(px*7,py)<.3)c=mul(c,.82)}else c=mul(c,(row&1)?1:.88);if(s<.14)c=mul(c,1.16);
      if(snow){const f=clamp(.95-(s/(span+ov))*.45,0,1);if(ih(px*3,py*5)<f)c=mix(c,SNOW,.9)}
      return mul(c,shade*n);
    };
  }
  if(rx){
    const A=H+rr+k*ym,A2=H+rr-k*ym;
    faces.push(SL(A,0,-k,(x,y)=>y>=ym&&y<=b+ov&&x>=-ov&&x<=a+ov,roofCol(1,h=>h.v-ym)));
    faces.push(SL(A2,0,k,(x,y)=>y<=ym&&y>=-ov&&x>=-ov&&x<=a+ov,roofCol(.7,h=>ym-h.v)));
  }else{
    const A=H+rr+k*xm,A2=H+rr-k*xm;
    faces.push(SL(A,-k,0,(x,y)=>x>=xm&&x<=a+ov&&y>=-ov&&y<=b+ov,roofCol(.8,h=>h.u-xm)));
    faces.push(SL(A2,k,0,(x,y)=>x<=xm&&x>=-ov&&y>=-ov&&y<=b+ov,roofCol(.62,h=>xm-h.u)));
  }
  let chim=null;
  if(!barn&&!o.nochim){
    const cx=rx?a*.72:xm,cy=rx?ym:b*.28,zc=H+rr+4,cc=[148,112,96];
    box(cx-.25,cy-.25,cx+.25,cy+.25,0,zc,
      (h,px,py)=>mul(cc,.7*(1+(ih(px,py)-.5)*.1)),(h,px,py)=>mul(cc,.92*(1+(ih(px,py)-.5)*.1)),
      (h,px,py)=>h.z>zc-.1?mul(cc,.45):null).forEach(f=>faces.push(f));
    chim=[cx,cy,zc+1];
  }
  const bb={x0:-ov,y0:-ov,x1:a+ov,y1:b+ov,zmax:H+rr+6};
  const s=render(faces,bb);
  if(!barn){for(const w of swWin)wins.push(proj((w[0]+w[1])/2,b,7,s));for(const w of seWin)wins.push(proj(a,(w[0]+w[1])/2,7,s));if(!wins.length)wins.push(proj(a/2,b,3,s))}
  else{wins.push(proj(a/2,b,15,s))}
  s.wins=wins;s.chim=chim?proj(chim[0],chim[1],chim[2],s):null;s.door=null;return s;
}
function wellModel(season){
  const st=(m)=>(h,px,py)=>mul([150,148,142],m*(.9+ih(px,py)*.2));
  const f=[];
  box(0,0,1.4,1.4,0,5,st(.72),st(1),(h,px,py)=>{const x=h.x-.7,y=h.y-.7;return(Math.abs(x)<.45&&Math.abs(y)<.45)?[36,60,84]:st(1.1)(h,px,py)}).forEach(q=>f.push(q));
  box(.05,.05,.2,.2,5,15,()=>[90,62,40],()=>[110,78,50],()=>[120,88,56]).forEach(q=>f.push(q));
  box(1.2,1.2,1.35,1.35,5,15,()=>[90,62,40],()=>[110,78,50],()=>[120,88,56]).forEach(q=>f.push(q));
  box(.05,.05,1.35,1.35,15,17,()=>[120,60,46],()=>[168,84,62],()=>[190,98,70]).forEach(q=>f.push(q));
  const s=render(f,{x0:0,y0:0,x1:1.4,y1:1.4,zmax:18});s.wins=[];s.chim=null;return s;
}

// ---- extra props ----
function rack(season){const w=14,h=12,S=canvasOf(w,h);
  for(let y=1;y<h-1;y++){put(S.img,w,1,y,[96,66,40]);put(S.img,w,12,y,[96,66,40])}
  for(let x=1;x<13;x++)put(S.img,w,x,1,[120,84,52]);
  for(let i=0;i<4;i++){const x=3+i*2.5|0;for(let y=2;y<6;y++)put(S.img,w,x,y,y<3?[90,90,90]:[150,160,170])}
  for(let x=2;x<12;x++)for(let y=7;y<9;y++)if((x+y)%2)put(S.img,w,x,y,[200,190,160]);
  const r=finishOutline(S);r.ax=7;r.ay=h-1;return r}
function scarecrow(season){const w=9,h=14,S=canvasOf(w,h);
  for(let y=3;y<h;y++)put(S.img,w,4,y,[100,70,44]);for(let x=1;x<8;x++)put(S.img,w,x,5,[100,70,44]);
  for(let y=4;y<9;y++)for(let x=3;x<6;x++)put(S.img,w,x,y,[150,60,50]);for(let x=3;x<6;x++)for(let y=1;y<4;y++)put(S.img,w,x,y,[220,190,120]);for(let x=2;x<7;x++)put(S.img,w,x,1,[120,90,50]);
  const r=finishOutline(S);r.ax=4;r.ay=h-1;return r}
function bench(season){const w=12,h=7,S=canvasOf(w,h);
  for(let x=0;x<12;x++){put(S.img,w,x,2,[176,128,80]);put(S.img,w,x,3,[140,98,60])}for(const x of [1,10])for(let y=4;y<7;y++)put(S.img,w,x,y,[90,62,40]);
  if(PAL[season].snow)for(let x=1;x<11;x++)put(S.img,w,x,1,[238,243,250]);
  const r=finishOutline(S);r.ax=6;r.ay=h-1;return r}
function torchPost(season){const w=5,h=16,S=canvasOf(w,h);
  for(let y=4;y<h;y++){put(S.img,w,2,y,[96,66,40]);put(S.img,w,3,y,[70,48,30])}for(let x=1;x<4;x++)put(S.img,w,x,3,[60,44,30]);
  const r=finishOutline(S);r.ax=2;r.ay=h-1;r.flame=[2,1];return r}
// ---- windmill ----
function millModel(o,season){
  const H=o.H,hw0=1.35,hw1=.82,cx=o.a/2,cy=o.b/2,rr=o.rr,P=PAL[season],snow=P.snow,sl=(hw1-hw0)/H,rc=ROOF[o.roof];
  const hw=z=>hw0+sl*z,wc=WALL.stone;
  const col=(shade,sw)=>(h,px,py)=>{
    const z=h.z,u=h.u;let c=wc;const br=Math.floor(z/2.5),bs=Math.floor(u*3+(br&1)*.5);c=mul(c,.88+ih(br,bs)*.22);
    if(z<2)c=mul(c,.78);
    if(sw&&Math.abs(u-cx)<.28&&z<10)c=(z>9.1||Math.abs(u-cx)>.2)?[58,40,28]:[96,64,42];
    else if(Math.abs(Math.abs(u-cx)-0)<.2&&z>14&&z<19&&sw)c=[60,76,98];
    else if(!sw&&Math.abs(u-cy)<.2&&z>14&&z<19)c=[60,76,98];
    return mul(c,shade*(1+(ih(px,py)-.5)*.1));};
  const TX={hit(x0,y0){const den=1-8*sl;const t=(cx+hw0-x0)/den,z=8*t,y=y0+t;if(z<0||z>H)return null;if(Math.abs(y-cy)>hw(z))return null;return{t,u:y,v:z,z}},col:col(.74,false)};
  const TY={hit(x0,y0){const den=1-8*sl;const t=(cy+hw0-y0)/den,z=8*t,x=x0+t;if(z<0||z>H)return null;if(Math.abs(x-cx)>hw(z))return null;return{t,u:x,v:z,z}},col:col(1,true)};
  const hwr=hw1+.28,A=H+rr,Z0=H-1.2,kk=(A-Z0)/hwr;
  const rcol=(sh,dist)=>(h,px,py)=>{const s=dist(h),row=Math.floor(s*4);let c=mul(rc,(row&1)?1:.88);if(s<.2)c=mul(c,1.15);if(snow&&ih(px*3,py*5)<.75-s*.4)c=mix(c,SNOW,.9);return mul(c,sh*(1+(ih(px,py)-.5)*.12))};
  const faces=[TX,TY,
    SL(A+kk*cx/1,-kk/1*0+0,0,()=>false,()=>null)];
  faces.length=2;
  faces.push(SL(A+kk*cx,-kk,0,(x,y)=>x-cx>=Math.abs(y-cy)&&x-cx<=hwr,rcol(.8,h=>h.u-cx)));
  faces.push(SL(A+kk*cy,0,-kk,(x,y)=>y-cy>=Math.abs(x-cx)&&y-cy<=hwr,rcol(1,h=>h.v-cy)));
  faces.push(SL(A-kk*cx,kk,0,(x,y)=>cx-x>=Math.abs(y-cy)&&cx-x<=hwr,rcol(.6,h=>cx-h.u)));
  faces.push(SL(A-kk*cy,0,kk,(x,y)=>cy-y>=Math.abs(x-cx)&&cy-y<=hwr,rcol(.66,h=>cy-h.v)));
  const hubZ=H-5;
  box(cx+hw(hubZ)-.05,cy-.18,cx+hw(hubZ)+.42,cy+.18,hubZ-3,hubZ+3,()=>[110,76,50],()=>[130,92,60],()=>[150,110,74]).forEach(f=>faces.push(f));
  const bb={x0:cx-hw0-.3,y0:cy-hw0-.3,x1:cx+hw0+.6,y1:cy+hw0+.3,zmax:H+rr+4};
  const s=render(faces,bb);
  s.hub=proj(cx+hw(hubZ)+.5,cy,hubZ,s);s.wins=[proj(cx,cy+hw(17),17,s)];s.chim=null;return s;
}

// ---- pyramid-roofed square tower (chapel bell tower, watchtower roof) ----
function spire(o,season){
  const w=o.w,H=o.H,rr=o.rr,cx=w/2,cy=w/2,snow=PAL[season].snow,rc=ROOF[o.roof],wc=WALL[o.wall],f=[];
  const wall=(sh)=>(h,px,py)=>{let c=wc;if(o.wall==="stone"){const r=Math.floor(h.v/3),s2=Math.floor(h.u*3+(r&1)*.5);c=mul(c,.86+ih(r,s2)*.22)}else if(Math.floor(h.u*4)%2===0)c=mul(c,.92);
    if(o.bell&&h.v>H-7&&h.v<H-2&&Math.abs(h.u-(o.sw?cx:cy))<.25)c=[40,30,24];if(h.v<2)c=mul(c,.8);return mul(c,sh*(1+(ih(px,py)-.5)*.1))};
  if(!o.legs){f.push(XP(w,0,w,0,H,wall(.74)),YP(w,0,w,0,H,(h,px,py)=>wall(1)({u:h.u,v:h.v},px,py)))}
  else{for(const [lx,ly] of [[.1,.1],[w-.35,.1],[.1,w-.35],[w-.35,w-.35]])box(lx,ly,lx+.25,ly+.25,0,H,()=>[96,66,40],()=>[120,84,52],()=>[130,92,58]).forEach(q=>f.push(q));
    box(.05,.05,w-.05,w-.05,H-1,H+1,()=>[100,70,44],()=>[132,94,60],()=>[150,110,70]).forEach(q=>f.push(q));
    for(const zz of [H*.35,H*.7])box(.12,w-.3,w-.12,w-.12,zz,zz+.8,()=>[96,66,40],()=>[120,84,52],()=>[130,92,58]).forEach(q=>f.push(q));
    f.push(XP(w-.05,.05,w-.05,H+1,H+5,(h,px,py)=>mul([140,100,62],.74*(Math.floor(h.u*4)%2?1:.9))),YP(w-.05,.05,w-.05,H+1,H+5,(h,px,py)=>mul([140,100,62],Math.floor(h.u*4)%2?1:.9)))}
  const Z=o.legs?H+5:H,hw=w/2+.15,A=Z+rr,kk=rr/hw;
  const rcol=(sh,dist)=>(h,px,py)=>{const s=dist(h),row=Math.floor(s*4);let c=o.roof==="thatch"?mul(rc,.86+ih(px,Math.floor(py/2))*.26):mul(rc,(row&1)?1:.88);if(snow&&ih(px*3,py*5)<.75-s*.3)c=mix(c,SNOW,.9);return mul(c,sh*(1+(ih(px,py)-.5)*.12))};
  f.push(SL(A+kk*cx,-kk,0,(x,y)=>x-cx>=Math.abs(y-cy)&&x-cx<=hw,rcol(.8,h=>h.u-cx)));
  f.push(SL(A+kk*cy,0,-kk,(x,y)=>y-cy>=Math.abs(x-cx)&&y-cy<=hw,rcol(1,h=>h.v-cy)));
  f.push(SL(A-kk*cx,kk,0,(x,y)=>cx-x>=Math.abs(y-cy)&&cx-x<=hw,rcol(.6,h=>cx-h.u)));
  f.push(SL(A-kk*cy,0,kk,(x,y)=>cy-y>=Math.abs(x-cx)&&cy-y<=hw,rcol(.66,h=>cy-h.v)));
  if(o.cross){box(cx-.04,cy-.04,cx+.04,cy+.04,A,A+6,()=>[60,50,40],()=>[90,76,60],()=>[90,76,60]).forEach(q=>f.push(q));box(cx-.04,cy-.2,cx+.04,cy+.2,A+3.5,A+4.3,()=>[60,50,40],()=>[90,76,60],()=>[90,76,60]).forEach(q=>f.push(q))}
  const s=render(f,{x0:-.2,y0:-.2,x1:w+.2,y1:w+.2,zmax:A+8});s.wins=o.legs?[proj(w/2,w/2,H+3,s)]:[];s.chim=null;return s;
}
function skeps(season){const w=22,h=12,S=canvasOf(w,h),snow=PAL[season].snow;
  for(let x=0;x<w;x++){put(S.img,w,x,9,[132,94,60]);put(S.img,w,x,10,[96,66,40])}for(const x of [1,20])put(S.img,w,x,11,[80,56,36]);
  for(const cx of [4,11,18])for(let y=1;y<9;y++)for(let x=cx-3;x<=cx+3;x++){const dx=(x-cx)/3.5,dy=(y-8.5)/7.5;if(dx*dx+dy*dy<1){let c=(y%2)?[214,174,90]:[186,146,70];if(x>cx+1)c=mul(c,.82);if(y===7&&x===cx)c=[40,28,16];if(snow&&y<4)c=SNOW;put(S.img,w,x,y,c)}}
  const r=finishOutline(S);r.ax=11;r.ay=10;return r}
function innSign(season){const w=9,h=16,S=canvasOf(w,h);for(let y=2;y<h;y++)put(S.img,w,1,y,[90,62,40]);for(let x=1;x<8;x++)put(S.img,w,x,2,[90,62,40]);
  for(let y=4;y<10;y++)for(let x=3;x<9;x++)put(S.img,w,x,y,y===4||y===9||x===3||x===8?[90,62,40]:[196,150,80]);for(let y=5;y<9;y++){put(S.img,w,5,y,[240,220,170]);put(S.img,w,6,y,[240,220,170])}put(S.img,w,7,6,[240,220,170]);
  const r=finishOutline(S);r.ax=1;r.ay=h-1;return r}
function sapling(size,v,season){return v?oak(size,v,season):spruce(size,0,season)}
// ---- building sprites by type ----
const MODELS={
  pit:{k:"hut",a:2,b:2,H:4,rr:12,ridge:"x",wall:"wood",roof:"thatch",nowin:true},
  hut:{k:"hut",a:3,b:3,H:11,rr:10,ridge:"y",wall:"cream",roof:"thatch"},
  store:{k:"barn",a:3,b:2,H:13,rr:8,ridge:"x",wall:"wood",roof:"brown"},
  wcut:{k:"hut",a:2,b:2,H:9,rr:8,ridge:"y",wall:"wood",roof:"thatch",nowin:true},
  forage:{k:"hut",a:2,b:2,H:9,rr:8,ridge:"x",wall:"cream",roof:"thatch",nowin:true},
  fisher:{k:"hut",a:2,b:2,H:9,rr:8,ridge:"x",wall:"wood",roof:"thatch",nowin:true},
  quarry:{k:"hut",a:2,b:2,H:7,rr:6,ridge:"y",wall:"stone",roof:"slate",nowin:true,nochim:true},
  longhouse:{k:"hut",a:6,b:3,H:8,rr:14,ridge:"x",wall:"wood",roof:"thatch"},
  tavern:{k:"hut",a:4,b:3,H:12,rr:9,ridge:"x",wall:"cream",roof:"brown"},
  chapel:{k:"hut",a:4,b:3,H:13,rr:10,ridge:"x",wall:"cream",roof:"slate",nochim:true},
  harbor:{k:"hut",a:3,b:2,H:9,rr:7,ridge:"x",wall:"wood",roof:"slate",nowin:true,nochim:true},
  shed:{k:"hut",a:2,b:1,H:7,rr:5,ridge:"x",wall:"wood",roof:"thatch",nowin:true,nochim:true},
};
export function buildingSprites(season){
  const o={};
  for(const k in MODELS)o[k]=houseModel(MODELS[k],season);
  o.mill=millModel({a:3,b:3,H:30,rr:12,roof:"red"},season);o.belltower=spire({w:1.3,H:30,rr:12,wall:"stone",roof:"slate",bell:1,sw:1,cross:1},season);
  o.tower=spire({w:2,H:18,rr:9,wall:"wood",roof:"thatch",legs:1},season);o.skeps=skeps(season);o.sign=innSign(season);
  o.sapling=[spruce(.32,0,season),spruce(.5,1,season),oak(.4,1,season),oak(.62,2,season)];
  o.well=wellModel(season);o.tent=tentModel(season);o.rack=rack(season);o.scarecrow=scarecrow(season);o.bench=bench(season);o.torch=torchPost(season);
  return o;
}
// ---- dwarf pine (kosodrevina): low, wide, dark ----
function dwarf(size,v,season){
  const P=PAL[season],w=Math.round(18*size),h=Math.round(9*size)+2,S=canvasOf(w,h),blobs=[[.3,.55,.32],[.62,.5,.36],[.48,.32,.3],[.8,.62,.22],[.15,.68,.2]];
  for(let y=0;y<h-2;y++)for(let x=0;x<w;x++){let best=null;for(const b of blobs){const dx=(x/w-b[0])/b[2],dy=(y/(h-2)-b[1])/(b[2]*1.6),dd=dx*dx+dy*dy;if(dd<1&&(!best||dd<best.dd))best={dd,dx,dy}}
    if(!best)continue;const L=.5-best.dx*.35-best.dy*.5+(ih(x+v*31,y*3)-.5)*.6;let c=P.tree[clamp(Math.round(L*3),0,3)];if((x+y*2)%5===0)c=mul(c,.82);
    if(P.snow&&best.dy<-.2&&ih(x*3,y+v*7)<.75)c=mix(c,SNOW,.85);put(S.img,w,x,y,c)}
  for(let x=2;x<w-2;x++)put(S.img,w,x,h-2,[0,0,0],40);
  const r=finishOutline(S);r.ay=h-3;return r}
// ---- mushrooms in the birch grove ----
function mush(season,v,full){const w=10,h=7,S=canvasOf(w,h);
  if(!full||PAL[season].snow){for(let i=0;i<3;i++)put(S.img,w,2+i*3,5,[200,190,170]);const r=finishOutline(S);r.ay=6;return r}
  const caps=[[2,3,[150,96,52]],[5,2,[176,40,32]],[7,4,[132,84,46]]];
  for(const [cx,cy,col] of caps){for(let y=cy+1;y<6;y++)put(S.img,w,cx,y,[232,224,206]);for(let x=cx-1;x<=cx+1;x++)put(S.img,w,x,cy,col);put(S.img,w,cx,cy-1,mix(col,[255,255,255],.25));if(col[0]===176){put(S.img,w,cx-1,cy,[240,240,240]);}}
  for(let x=1;x<9;x++)put(S.img,w,x,6,[0,0,0],40);
  const r=finishOutline(S);r.ay=6;return r}
const cache={};
export function buildSprites(season){
  if(cache[season])return cache[season];
  const o={wagon:wagonModel(season),tent:tentModel(season),pit:firepit(season),stump:stump(season),
    spruce:[0,1,2].flatMap(v=>[spruce(.8,v,season),spruce(1,v,season),spruce(1.3,v,season)]),
    oak:[0,1,2].flatMap(v=>[oak(.8,v,season),oak(1,v,season),oak(1.25,v,season)]),birch:[0,1].map(v=>oak(.9,v,season,true)),
    bush:[0,1,2].map(v=>bush(season,v,true)),bushBare:[0,1,2].map(v=>bush(season,v,false)),dwarf:[0,1,2].flatMap(v=>[dwarf(.8,v,season),dwarf(1,v,season),dwarf(1.25,v,season)]),mush:[0,1,2].map(v=>mush(season,v,true)),mushBare:[0,1,2].map(v=>mush(season,v,false)),
    rock:[0,1,2].map(v=>rock(v,season,false)),bigRock:[0,1,2].map(v=>rock(v,season,true)),
    wood:[1,2,3].map(woodpile),stone:[1,2,3].map(stoneheap),food:[0,1,2].map(baskets),bld:buildingSprites(season)};
  const m=document.createElement("canvas");m.width=o.wagon.w;m.height=o.wagon.h;const mx=m.getContext("2d");mx.translate(m.width,0);mx.scale(-1,1);mx.drawImage(o.wagon.canvas,0,0);
  o.wagonM={canvas:m,ax:o.wagon.w-o.wagon.ax,ay:o.wagon.ay,w:o.wagon.w,h:o.wagon.h};
  cache[season]=o;return o;
}
export { mix };
