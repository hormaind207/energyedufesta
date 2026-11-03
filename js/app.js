// 데이터는 data/region_data.json 에서, 3D 모형은 models/town.glb 에서 불러온다.
let REGIONS = null;
const MODEL_URL = "models/town.glb";
const DATA_URL = "data/region_data.json";

/* ================= data ================= */
const DAYS_IN_MONTH=[31,28,31,30,31,30,31,31,30,31,30,31];
function dayLabel(d){let m=0;while(d>=DAYS_IN_MONTH[m]){d-=DAYS_IN_MONTH[m];m++;}return `${m+1}월 ${d+1}일`;}
function decode(b64){const bin=atob(b64);const a=new Float64Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a;}
const cache={};
function regionArrays(name){
  if(cache[name])return cache[name];
  const s=decode(REGIONS[name].s), l=decode(REGIONS[name].l);
  let ss=0,sl=0;for(let i=0;i<8760;i++){ss+=s[i];sl+=l[i];}
  return cache[name]={s,l,ss,sl};
}

const HH=10000, KWH_YEAR=296*12;           // households, kWh per household-year
const ANNUAL=HH*KWH_YEAR;                    // kWh
const state={region:"서울",day:104,hour:12,pv:15,lb:228.6,ls:120,fee:10,ess:false,essPct:20,playing:false};
let sim=null;

function price(sdr,lb,ls){
  if(sdr>1)return {ps:ls,pb:ls};
  const ps=lb*ls/((lb-ls)*sdr+ls); return {ps,pb:ps*sdr+lb*(1-sdr)};
}
function simulate(){
  const R=regionArrays(state.region), N=8760;
  const pv=new Float64Array(N),dm=new Float64Array(N),sup=new Float64Array(N),dem=new Float64Array(N),
        ps=new Float64Array(N),pb=new Float64Array(N),loc=new Float64Array(N),to=new Float64Array(N),fr=new Float64Array(N),
        eb=new Float64Array(N),es=new Float64Array(N),soc=new Float64Array(N);
  const pvA=state.pv/100*ANNUAL, cap=state.ess?state.essPct/100*ANNUAL/365:0, rate=cap/4, eff=0.95;
  let s=cap*0.3, T={cost:0,cost0:0,rev:0,rev0:0,pv:0,dem:0,loc:0,to:0,essProfit:0,essOut:0};
  const {lb,ls,fee}=state;
  // rational ESS: discharge only up to the SDR where marginal revenue = stored-energy cost (ls / round-trip eff)
  const cst=ls/(eff*eff); const sStar=Math.max(0,Math.min(1,(Math.sqrt(lb*ls*ls/cst)-ls)/(lb-ls)));
  for(let t=0;t<N;t++){
    const p=pvA*R.s[t]/R.ss, d=ANNUAL*R.l[t]/R.sl; let buy=0,sell=0;
    if(cap>0){ if(p>d){buy=Math.min(p-d,(cap-s)/eff,rate);s+=buy*eff;} else {sell=Math.min(Math.max(0,sStar*d-p),s*eff,rate);s-=sell/eff;} }
    const S=p+sell, D=d+buy, sdr=D>0?S/D:99, pr=price(sdr,lb,ls), L=Math.min(S,D);
    pv[t]=p;dm[t]=d;sup[t]=S;dem[t]=D;ps[t]=pr.ps;pb[t]=pr.pb;loc[t]=L;to[t]=Math.max(0,S-D);fr[t]=Math.max(0,D-S);eb[t]=buy;es[t]=sell;soc[t]=cap?s/cap:0;
    const lf=D>0?L/D:0;
    T.cost+=d*(pr.pb+fee*lf); T.cost0+=d*lb; T.rev+=p*pr.ps; T.rev0+=p*ls; T.pv+=p; T.dem+=d;
    T.loc+=Math.min(p+sell,d); T.to+=Math.max(0,S-D); T.essProfit+=sell*pr.ps-buy*pr.ps; T.essOut+=sell;
  }
  sim={pv,dm,sup,dem,ps,pb,loc,to,fr,eb,es,soc,T,cap};
}

/* ================= UI ================= */
const $=id=>document.getElementById(id);
const fmtE=v=>v>=1000?(v/1000).toFixed(1)+" MWh":Math.round(v)+" kWh";
const won=v=>v.toFixed(1)+"원";
function fillSelect(){const sel=$("region");Object.keys(REGIONS).forEach(k=>{const o=document.createElement("option");o.value=o.textContent=k;sel.appendChild(o);});sel.value=state.region;}
function updateAnnual(){
  const T=sim.T;
  const save=1-T.cost/T.cost0;
  $("kBuy").textContent=(save>=0?"−":"+")+Math.abs(save*100).toFixed(1)+"%";
  $("kBuy").style.color=save>=0?"var(--local)":"var(--kepco)";
  const avg=T.rev/Math.max(T.pv,1);
  $("kSell").textContent=won(avg);
  $("kSellS").textContent=`SMP ${state.ls}원보다 ${((avg/state.ls-1)*100).toFixed(0)}% 높음`;
  $("kSelf").textContent=(T.loc/T.dem*100).toFixed(1)+"%";
  $("kOut").textContent=(T.to/Math.max(T.pv,1)*100).toFixed(1)+"%";
  $("kCO2").textContent=Math.round(T.pv/1000*0.4173).toLocaleString()+" t";
  if(sim.cap>0){$("kEss").textContent=won(T.essProfit/Math.max(T.essOut,1));$("kEssS").textContent="방전 1kWh당 · 설비비(약 60~119원) 미반영";}
  else{$("kEss").textContent="—";$("kEssS").textContent="ESS를 켜면 계산";}
  $("yrSub").textContent=`${state.region} · 보급률 ${state.pv}%`;
  const st=state.pv<15?0:state.pv<30?1:2;
  [...$("stagebar").children].forEach((c,i)=>c.classList.toggle("on",i===st));
}
function updateNow(){
  const t=state.day*24+state.hour, h=state.hour;
  $("clockT").textContent=String(h).padStart(2,"0")+":00";
  $("clockD").textContent=`${dayLabel(state.day)} · ${state.region}`;
  $("dayO").textContent=dayLabel(state.day); $("hourO").textContent=h+"시";
  const {lb,ls}=state, P=sim.ps[t], B=sim.pb[t];
  $("gHi").textContent=won(lb);$("gLo").textContent=won(ls);$("gS").textContent=won(P);$("gB").textContent=won(B);
  const pos=v=>((v-ls)/(lb-ls)*100);
  $("mkS").style.bottom=pos(P)+"%";$("mkB").style.bottom=pos(B)+"%";
  // flows
  let mx=0;for(let i=0;i<8760;i++)mx=Math.max(mx,sim.sup[i],sim.dem[i]);
  const w=v=>Math.min(100,v/mx*100)+"%";
  const pv=sim.pv[t],d=sim.dm[t];
  $("fPV").style.width=w(pv);$("vPV").textContent=fmtE(pv);
  $("fD").style.width=w(d);$("vD").textContent=fmtE(d);
  $("fL").style.width=w(sim.loc[t]);$("vL").textContent=fmtE(sim.loc[t]);
  $("fTo").style.width=w(sim.to[t]);$("vTo").textContent=fmtE(sim.to[t]);
  $("fFr").style.width=w(sim.fr[t]);$("vFr").textContent=fmtE(sim.fr[t]);
  $("essRow").style.display=sim.cap?"grid":"none";
  if(sim.cap){const e=sim.es[t]-sim.eb[t];$("fE").style.width=(sim.soc[t]*100)+"%";$("vE").textContent=e>0?"방전 "+fmtE(e):e<0?"충전 "+fmtE(-e):"대기";}
  const sdr=sim.dem[t]>0?sim.sup[t]/sim.dem[t]:0;
  $("vSDR").textContent=sdr>9?"9+":sdr.toFixed(2);
  $("sdrNote").textContent=sdr>1?"전기가 남는다. 시세가 하한까지 내려가고, 남는 만큼 한전이 하한가로 사 간다.":
    sdr<0.02?"태양광이 거의 없다. 시세가 상한에 붙고, 대부분 한전에서 상한가로 채운다.":
    "전기가 모자란다. 공급이 적을수록 시세가 상한 쪽으로 올라가고, 모자란 만큼 한전이 채운다.";
  drawDay(); scene3d&&scene3d.update(t);
}
function drawDay(){
  const d0=state.day*24, W=Math.max(320,$("day").clientWidth||600),H=150,pl=34,pr=40,pt=10,pb=22, iw=W-pl-pr, ih=H-pt-pb;
  let mx=0;for(let i=0;i<24;i++)mx=Math.max(mx,sim.pv[d0+i],sim.dm[d0+i]);mx=mx||1;
  const {lb,ls}=state, x=i=>pl+i/23*iw, ye=v=>pt+ih-v/mx*ih, yp=v=>pt+ih-(v-ls*0.8)/(lb*1.05-ls*0.8)*ih;
  let area=`M${x(0)},${ye(0)}`;for(let i=0;i<24;i++)area+=` L${x(i)},${ye(sim.pv[d0+i])}`;area+=` L${x(23)},${ye(0)} Z`;
  let dem="",pri="";for(let i=0;i<24;i++){dem+=(i?" L":"M")+x(i)+","+ye(sim.dm[d0+i]);pri+=(i?" L":"M")+x(i)+","+yp(sim.ps[d0+i]);}
  const cs=getComputedStyle(document.documentElement), c=n=>cs.getPropertyValue(n).trim();
  let ticks="";for(let i=0;i<24;i+=3)ticks+=`<text x="${x(i)}" y="${H-6}" font-size="10" text-anchor="middle" fill="${c('--muted')}">${i}시</text>`;
  $("day").innerHTML=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${dayLabel(state.day)} 하루 공급·수요·시세 그래프">
   <line x1="${pl}" x2="${W-pr}" y1="${yp(lb)}" y2="${yp(lb)}" stroke="${c('--kepco')}" stroke-dasharray="4 4" stroke-width="1.2"/>
   <line x1="${pl}" x2="${W-pr}" y1="${yp(ls)}" y2="${yp(ls)}" stroke="${c('--kepco')}" stroke-dasharray="4 4" stroke-width="1.2"/>
   <path d="${area}" fill="${c('--sell')}" opacity=".35"/>
   <path d="${dem}" fill="none" stroke="${c('--buy')}" stroke-width="2.2"/>
   <path d="${pri}" fill="none" stroke="${c('--price')}" stroke-width="2.6"/>
   <line x1="${x(state.hour)}" x2="${x(state.hour)}" y1="${pt}" y2="${pt+ih}" stroke="${c('--ink')}" stroke-width="1.5"/>
   <circle cx="${x(state.hour)}" cy="${yp(sim.ps[d0+state.hour])}" r="4.5" fill="${c('--price')}" stroke="${c('--panel')}" stroke-width="2"/>
   <text x="${W-pr+4}" y="${yp(lb)+4}" font-size="10" fill="${c('--kepco')}">${Math.round(lb)}원</text>
   <text x="${W-pr+4}" y="${yp(ls)+4}" font-size="10" fill="${c('--kepco')}">${Math.round(ls)}원</text>
   ${ticks}</svg>`;
  $("dayTitle").textContent=`${dayLabel(state.day)} 하루 흐름`;
}
$("day").addEventListener("click",e=>{const r=e.currentTarget.getBoundingClientRect();const W=Math.max(320,r.width);const fx=(e.clientX-r.left)/r.width*W;state.hour=Math.max(0,Math.min(23,Math.round((fx-34)/(W-74)*23)));$("hourR").value=state.hour;updateNow();});
window.addEventListener("resize",()=>drawDay());

function bind(){
  const recalc=()=>{simulate();updateAnnual();updateNow();};
  $("region").onchange=e=>{state.region=e.target.value;recalc();};
  $("dayR").oninput=e=>{state.day=+e.target.value;updateNow();};
  $("hourR").oninput=e=>{state.hour=+e.target.value;updateNow();};
  const SEASONS=[[59,150],[151,242],[243,333],[334,423]];
  document.querySelectorAll("[data-season]").forEach(b=>b.onclick=()=>{const R=regionArrays(state.region);const [a,z]=SEASONS[+b.dataset.season];let best=a,bv=-1;
    for(let dd=a;dd<=z;dd++){const d=dd%365;let v=0;for(let h=0;h<24;h++)v+=R.s[d*24+h];if(v>bv){bv=v;best=d;}}
    state.day=best;$("dayR").value=best;updateNow();});
  $("pvR").oninput=e=>{state.pv=+e.target.value;$("pvO").textContent=state.pv+"%";recalc();};
  $("tier").onchange=e=>{state.lb=+e.target.value;recalc();};
  $("smpR").oninput=e=>{state.ls=+e.target.value;$("smpO").textContent=state.ls+"원";recalc();};
  $("feeR").oninput=e=>{state.fee=+e.target.value;$("feeO").textContent=state.fee+"원";recalc();};
  $("essC").onclick=e=>{state.ess=!state.ess;e.target.setAttribute("aria-pressed",state.ess);e.target.textContent=state.ess?"켜짐":"꺼짐";recalc();};
  $("essR").oninput=e=>{state.essPct=+e.target.value;$("essO").textContent=state.essPct+"%";if(state.ess)recalc();};
  $("pvO").textContent=state.pv+"%";$("smpO").textContent=state.ls+"원";$("feeO").textContent=state.fee+"원";$("essO").textContent=state.essPct+"%";
  let timer=null;
  $("play").onclick=e=>{state.playing=!state.playing;e.target.setAttribute("aria-pressed",state.playing);e.target.textContent=state.playing?"❚❚ 멈춤":"▶ 재생";
    if(state.playing){timer=setInterval(()=>{state.hour++;if(state.hour>23){state.hour=0;state.day=(state.day+1)%365;$("dayR").value=state.day;}$("hourR").value=state.hour;updateNow();},700);}else clearInterval(timer);};
}

/* ================= 3D ================= */
let scene3d=null;
function b2t(x,y,z){return new THREE.Vector3(x,z,-y);}   // Blender (Z-up) -> three (Y-up)
function build3D(){
  if(THREE.ColorManagement) THREE.ColorManagement.legacyMode=false;
  const host=$("view");
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.outputEncoding=THREE.sRGBEncoding; renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  host.prepend(renderer.domElement);
  const scene=new THREE.Scene();
  const cs=getComputedStyle(document.documentElement);
  const dayCol=new THREE.Color(cs.getPropertyValue("--scene-day").trim()), nightCol=new THREE.Color(cs.getPropertyValue("--scene-night").trim());
  scene.background=dayCol.clone();
  const camera=new THREE.PerspectiveCamera(26,1,0.1,400);
  const tgt=b2t(0.6,-0.4,1.2); const az=26*Math.PI/180, el=34*Math.PI/180, dist=37;
  camera.position.copy(tgt).add(new THREE.Vector3(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)).multiplyScalar(dist));
  const controls=new THREE.OrbitControls(camera,renderer.domElement); controls.target.copy(tgt); controls.enableDamping=true;
  controls.maxPolarAngle=Math.PI*0.47; controls.minDistance=14; controls.maxDistance=80; controls.update();
  const hemi=new THREE.HemisphereLight(0xffffff,0x80858c,0.55); scene.add(hemi);
  const amb=new THREE.AmbientLight(0xffffff,0.18); scene.add(amb);
  const sun=new THREE.DirectionalLight(0xfff4e6,1.4); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-14,right:14,top:14,bottom:-14,near:1,far:80}); sun.shadow.bias=-0.0006; scene.add(sun); scene.add(sun.target);
  const ground=new THREE.Mesh(new THREE.CircleGeometry(60,64),new THREE.ShadowMaterial({opacity:0.18})); ground.rotation.x=-Math.PI/2; ground.position.y=-0.75; ground.receiveShadow=true; scene.add(ground);

  const mats={}; let ring=null, ringLo=3.8, ringHi=5.85;
  new THREE.GLTFLoader().load(MODEL_URL,gltf=>{
    const root=gltf.scene; scene.add(root);
    root.traverse(o=>{
      if(o.isMesh&&o.material&&o.material.name==="마을층_반투명판"){o.material.opacity=0.05;o.material.color.set("#ffffff");}
      if(o.isMesh&&o.material&&o.material.name==="지하층_진회색"){o.material.color.set("#2B3036");o.material.roughness=0.9;}
      if(o.isMesh&&o.material&&(o.material.name.includes("간선")||o.material.name.includes("동네거래전선"))){o.material.emissive=new THREE.Color("#18E04A");o.material.emissiveIntensity=0.55;}
      if(o.isMesh&&o.material&&o.material.name==="한전연결선_빨강"){o.material.emissive=new THREE.Color("#FF2A1A");o.material.emissiveIntensity=0.45;}
      if(o.isMesh){o.castShadow=true;o.receiveShadow=true;
        const m=o.material; if(m&&m.name){mats[m.name]=m; if(m.name.includes("반투명")||m.name==="지지봉"){m.transparent=true;m.depthWrite=false;o.castShadow=false;}
          if(m.name==="지하층_진회색"||m.name.includes("간선")||m.name.includes("전선")||m.name.includes("한전연결")){o.receiveShadow=false;}
          if(m.name==="지하층_진회색"){o.castShadow=false;}}}
    });
    ring=root.getObjectByName("price_now");
    const lo=root.getObjectByName("price_low"), hi=root.getObjectByName("price_high");
    if(lo&&hi){ringLo=lo.position.y;ringHi=hi.position.y;}
    $("loading").remove(); ready=true; scene3d.update(state.day*24+state.hour);
  },undefined,err=>{$("loading").textContent="모형을 불러오지 못했다. 로컬 서버(README 참고)로 열었는지 확인해야 한다.";console.error(err);});

  /* ---- network graph (Blender XY coords, same as the model) ---- */
  const ZN=0.07, TRY=[-1.35,2.15], TRX=[-7.2,-2.75,3.55,6.7];
  const nodes={
    sellers:[["주택1",-6.3,3.3],["주택2",-4.5,3.5],["주택3",-6.2,0.6],["주택4",-4.4,0.4],["주택5",-0.6,3.6],["학교",4.6,3.1]],
    buyers:[["101동",-1.0,-3.1,1.0],["102동",0.6,-3.3,1.15],["103동",2.2,-3.0,0.85],["상가",-5.1,-3.1,0.8]],
    ess:["ESS",4.75,-3.45], kepcoJ:[6.7,-1.35], kepco:[7.2,-3.75]
  };
  function nearest(x,y){let best=null;for(const yt of TRY){if(x>=-7.2&&x<=6.7){const d=Math.abs(y-yt);if(!best||d<best[0])best=[d,[x,yt]];}}
    for(const xt of TRX){if(y>=-1.35&&y<=2.15){const d=Math.abs(x-xt);if(!best||d<best[0])best=[d,[xt,y]];}}return best[1];}
  // graph on trunks
  const V=[],key=p=>p[0].toFixed(3)+","+p[1].toFixed(3),idx={};
  const addV=p=>{const k=key(p);if(idx[k]===undefined){idx[k]=V.length;V.push(p);}return idx[k];};
  const lines=[];TRY.forEach(y=>lines.push({h:true,c:y,a:-7.2,b:6.7}));TRX.forEach(x=>lines.push({h:false,c:x,a:-1.35,b:2.15}));
  const onLine=[];lines.forEach(()=>onLine.push([]));
  const put=p=>{lines.forEach((L,i)=>{if(L.h&&Math.abs(p[1]-L.c)<1e-6&&p[0]>=L.a-1e-6&&p[0]<=L.b+1e-6)onLine[i].push(p);if(!L.h&&Math.abs(p[0]-L.c)<1e-6&&p[1]>=L.a-1e-6&&p[1]<=L.b+1e-6)onLine[i].push(p);});};
  TRY.forEach(y=>TRX.forEach(x=>put([x,y])));
  const junc={};
  [...nodes.sellers,...nodes.buyers,nodes.ess].forEach(n=>{const j=nearest(n[1],n[2]);junc[n[0]]=j;put(j);});
  put(nodes.kepcoJ);
  const adj={};const link=(a,b)=>{const ia=addV(a),ib=addV(b),d=Math.hypot(a[0]-b[0],a[1]-b[1]);(adj[ia]=adj[ia]||[]).push([ib,d]);(adj[ib]=adj[ib]||[]).push([ia,d]);};
  onLine.forEach((pts,i)=>{const L=lines[i];pts.sort((p,q)=>L.h?p[0]-q[0]:p[1]-q[1]);for(let k=1;k<pts.length;k++)link(pts[k-1],pts[k]);});
  function shortest(a,b){const s=addV(a),t=addV(b),dist={},prev={},Q=new Set(Object.keys(adj).map(Number));Q.add(s);Q.add(t);
    Q.forEach(v=>dist[v]=Infinity);dist[s]=0;
    while(Q.size){let u=null;Q.forEach(v=>{if(u===null||dist[v]<dist[u])u=v;});Q.delete(u);if(u===t)break;(adj[u]||[]).forEach(([v,w])=>{if(dist[u]+w<dist[v]){dist[v]=dist[u]+w;prev[v]=u;}});}
    const path=[];let u=t;while(u!==undefined){path.unshift(V[u]);u=prev[u];}return path;}
  const route=(from,fj,tj,to)=>{const mid=shortest(fj,tj);return [from,...mid,to];};
  const routes={local:[],toK:[],fromK:[],essIn:[],essOut:[]};
  nodes.sellers.forEach(s=>nodes.buyers.forEach(b=>routes.local.push({pts:route([s[1],s[2]],junc[s[0]],junc[b[0]],[b[1],b[2]]),w:b[3]})));
  const kPath=[nodes.kepcoJ,[6.7,-3.75],nodes.kepco];
  nodes.sellers.forEach(s=>routes.toK.push({pts:[...route([s[1],s[2]],junc[s[0]],nodes.kepcoJ,nodes.kepcoJ),...kPath.slice(1)],w:1}));
  nodes.buyers.forEach(b=>routes.fromK.push({pts:[...kPath.slice().reverse(),...route(nodes.kepcoJ,nodes.kepcoJ,junc[b[0]],[b[1],b[2]]).slice(1)],w:b[3]}));
  const E=nodes.ess;
  nodes.sellers.forEach(s=>routes.essIn.push({pts:route([s[1],s[2]],junc[s[0]],junc[E[0]],[E[1],E[2]]),w:1}));
  nodes.buyers.forEach(b=>routes.essOut.push({pts:route([E[1],E[2]],junc[E[0]],junc[b[0]],[b[1],b[2]]),w:b[3]}));
  Object.values(routes).flat().forEach(r=>{r.v=r.pts.map(p=>b2t(p[0],p[1],ZN+0.03));let L=0;r.cum=[0];for(let i=1;i<r.v.length;i++){L+=r.v[i].distanceTo(r.v[i-1]);r.cum.push(L);}r.len=L;});
  function at(r,s){let i=1;while(i<r.cum.length-1&&r.cum[i]<s)i++;const t=(s-r.cum[i-1])/Math.max(1e-6,r.cum[i]-r.cum[i-1]);return r.v[i-1].clone().lerp(r.v[i],Math.min(1,Math.max(0,t)));}

  /* ---- particles ---- */
  const MAXP=900; const geo=new THREE.SphereGeometry(0.12,12,10);
  const pm=new THREE.MeshBasicMaterial({color:0xffffff});
  const inst=new THREE.InstancedMesh(geo,pm,MAXP); inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  inst.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(MAXP*3),3); inst.frustumCulled=false; scene.add(inst);
  const COL={local:new THREE.Color("#FFFFFF"),toK:new THREE.Color("#FF4A3D"),fromK:new THREE.Color("#FF4A3D"),essIn:new THREE.Color("#7DFFF0"),essOut:new THREE.Color("#7DFFF0")};
  const parts=[]; const dummy=new THREE.Object3D(); let spawnAcc={}; let rates={local:0,toK:0,fromK:0,essIn:0,essOut:0};
  const SPEED=3.2;

  /* ---- labels ---- */
  const tags=[["판매자 · 태양광 주택",[-5.3,2.0,4.4],"var(--sell)"],["판매자 · 학교 옥상",[4.6,3.1,4.6],"var(--sell)"],["구매자 · 아파트",[0.6,-3.2,6.4],"var(--buy)"],
    ["구매자 · 상가",[-5.1,-3.1,4.2],"var(--buy)"],["ESS",[4.75,-3.45,4.1],"var(--ess)"],["한전 · 밴드의 벽",[7.2,-3.75,6.3],"var(--kepco)"],["가격 밴드 탑",[1.0,0.75,6.7],"var(--price)"],["지하 배전망 (기존 배전망)",[-7.6,-4.4,0.2],"var(--local)"]];
  const lab=$("labels"); const tagEls=tags.map(([t,p,c])=>{const d=document.createElement("div");d.className="tag";d.style.setProperty("--c",c);d.textContent=t;lab.appendChild(d);return {d,p:b2t(...p)};});

  let ready=false, cur=null;
  function resize(){const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
    const want=Math.max(37,44/camera.aspect); const dir=camera.position.clone().sub(controls.target).normalize(); camera.position.copy(controls.target).add(dir.multiplyScalar(want)); controls.update();}
  new ResizeObserver(resize).observe(host); resize();

  function update(t){
    cur=t; const lb=state.lb, ls=state.ls;
    const pv=sim.pv[t], d=sim.dm[t], mxD=ANNUAL/8760*2.2;
    rates.local=sim.loc[t]/mxD*48; rates.toK=sim.to[t]/mxD*48; rates.fromK=sim.fr[t]/mxD*30;
    rates.essIn=sim.eb[t]/mxD*48; rates.essOut=sim.es[t]/mxD*48;
    if(!ready)return;
    const R=regionArrays(state.region); const sunN=R.s[t]/255;
    // sky & sun
    const h=state.hour, ang=(h-6)/12*Math.PI; const up=Math.sin(ang);
    scene.background.copy(nightCol).lerp(dayCol,Math.max(0,Math.min(1,up*1.6+0.15)));
    sun.position.set(Math.cos(ang)*30,Math.max(4,up*34),12); sun.intensity=0.2+1.05*Math.max(0,Math.min(1,up))+0.3*sunN;
    hemi.intensity=0.3+0.32*Math.max(0,up);
    // glows
    const glow=(name,col,k)=>{const m=mats[name];if(m){m.emissive=m.emissive||new THREE.Color();m.emissive.set(col);m.emissiveIntensity=k;}};
    glow("판매자_노랑","#FFB000",Math.min(1.2,pv/mxD*1.6));
    glow("구매자_파랑","#1F6BFF",0.15+Math.min(0.9,d/mxD*0.9));
    glow("ESS_청록","#00E0C8",sim.cap?Math.min(1,(sim.eb[t]+sim.es[t])/mxD*3):0);
    glow("한전_빨강","#FF2A1A",Math.min(1.2,(sim.to[t]+sim.fr[t])/mxD*1.4));
    glow("창문_하늘색","#7FB8FF",up<0.1?0.9:0.0);
    glow("가격탑_현재시세_노랑","#FFB000",0.8);
    // price ring
    if(ring){const f=(sim.ps[t]-ls)/(lb-ls);ring.userData.goal=ringLo+Math.max(0,Math.min(1,f))*(ringHi-ringLo);}
  }
  let last=performance.now();
  function frame(now){
    const dt=Math.min(0.05,(now-last)/1000); last=now;
    if(ready){
      // spawn
      Object.keys(rates).forEach(k=>{spawnAcc[k]=(spawnAcc[k]||0)+rates[k]*dt;const rs=routes[k];const tw=rs.reduce((a,r)=>a+r.w,0);
        while(spawnAcc[k]>=1&&parts.length<MAXP){spawnAcc[k]-=1;let x=Math.random()*tw,r=rs[0];for(const q of rs){x-=q.w;if(x<=0){r=q;break;}}parts.push({r,s:0,k});}
        if(spawnAcc[k]>3)spawnAcc[k]=3;});
      for(let i=parts.length-1;i>=0;i--){parts[i].s+=SPEED*dt;if(parts[i].s>=parts[i].r.len)parts.splice(i,1);}
      for(let i=0;i<MAXP;i++){
        if(i<parts.length){const p=parts[i];dummy.position.copy(at(p.r,p.s));const pulse=1+0.25*Math.sin(now/120+i);dummy.scale.setScalar(pulse);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);inst.setColorAt(i,COL[p.k]);}
        else{dummy.scale.setScalar(0);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);}
      }
      inst.instanceMatrix.needsUpdate=true; inst.instanceColor.needsUpdate=true;
      if(ring&&ring.userData.goal!==undefined){ring.position.y+= (ring.userData.goal-ring.position.y)*Math.min(1,dt*4);}
    }
    controls.update(); renderer.render(scene,camera);
    // labels
    const w=host.clientWidth,h=host.clientHeight;
    tagEls.forEach(({d,p})=>{const v=p.clone().project(camera);d.style.left=((v.x+1)/2*w)+"px";d.style.top=((1-v.y)/2*h)+"px";d.style.opacity=(v.z<1&&v.x>-1.1&&v.x<1.1)?1:0;});
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return {update};
}

/* ================= boot ================= */
(async function boot(){
  try{
    const res=await fetch(DATA_URL); REGIONS=await res.json();
  }catch(e){ $("loading").textContent="데이터를 불러오지 못했다. 로컬 서버(README 참고)로 열었는지 확인해야 한다."; console.error(e); return; }
  fillSelect(); bind(); simulate(); updateAnnual(); updateNow();
  try{ scene3d=build3D(); }catch(e){ $("loading").textContent="3D를 표시할 수 없는 환경이다. 오른쪽 숫자와 그래프로 확인할 수 있다."; console.error(e); }
})();
