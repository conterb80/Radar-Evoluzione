"use strict";

document.addEventListener("DOMContentLoaded", async () => {
  const C=[44.45,12.02], RV="https://api.rainviewer.com/public/weather-maps.json";
  const Z=7, IMG=512, STEP=10, FUTURE=9, HISTORY=7, MIN_AREA=7, RADIUS=210, MAX_JUMP=52;
  const $=id=>document.getElementById(id);

  const map=L.map("map",{zoomControl:true}).setView([44.45,11.85],8);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:"© OpenStreetMap"}).addTo(map);
  map.createPane("forecastPane");
  const forecastPane=map.getPane("forecastPane"); forecastPane.style.zIndex="250"; forecastPane.style.pointerEvents="none";
  L.circleMarker(C,{radius:6,weight:2,color:"#fff",fillColor:"#58c7ff",fillOpacity:1}).addTo(map).bindTooltip("Borgo Viazza",{permanent:true,direction:"top",offset:[0,-7],className:"borgo"});

  let host="",past=[],frames=[],idx=0,nowIdx=0,observed=null,forecast=null,playing=false,token=0,track=null,cellMarker=null;
  const fmt=t=>new Intl.DateTimeFormat("it-IT",{hour:"2-digit",minute:"2-digit"}).format(new Date(t));
  function status(kind,title,text){$("led").className="led "+kind;$("statusTitle").textContent=title;$("status").textContent=text}
  function motionUI(state,dir="--",speed="--",conf="--",note=""){ $("motionState").textContent=state;$("motionDir").textContent=dir;$("motionSpeed").textContent=speed;$("motionConf").textContent=conf;if(note)$("motionNote").textContent=note }
  const imageUrl=f=>`${host}${f.path}/${IMG}/${Z}/${C[0]}/${C[1]}/2/1_1.png`;

  async function loadImage(url){
    const r=await fetch(url,{mode:"cors",cache:"no-store"}); if(!r.ok)throw Error(`HTTP ${r.status}`);
    const blob=await r.blob(), u=URL.createObjectURL(blob), img=new Image(); img.decoding="async";
    await new Promise((ok,no)=>{img.onload=ok;img.onerror=()=>no(Error("PNG non decodificato"));img.src=u});
    return {img,u};
  }

  function maskFrom(img){
    const c=document.createElement("canvas");c.width=IMG;c.height=IMG;const ctx=c.getContext("2d",{willReadFrequently:true});ctx.drawImage(img,0,0,IMG,IMG);
    const d=ctx.getImageData(0,0,IMG,IMG).data,m=new Uint8Array(IMG*IMG);for(let i=0,p=0;i<d.length;i+=4,p++)if(d[i+3]>38)m[p]=1;return m;
  }

  function comps(m){
    const seen=new Uint8Array(m.length), out=[], q=[];
    for(let y=0;y<IMG;y++)for(let x=0;x<IMG;x++){
      const s=y*IMG+x;if(!m[s]||seen[s])continue;
      q.length=0;q.push(s);seen[s]=1;let h=0,a=0,sx=0,sy=0;
      while(h<q.length){const p=q[h++],cy=(p/IMG)|0,cx=p-cy*IMG;a++;sx+=cx;sy+=cy;
        for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){if(!ox&&!oy)continue;const nx=cx+ox,ny=cy+oy;if(nx<0||nx>=IMG||ny<0||ny>=IMG)continue;const np=ny*IMG+nx;if(m[np]&&!seen[np]){seen[np]=1;q.push(np)}}
      }
      if(a>=MIN_AREA)out.push({area:a,x:sx/a,y:sy/a});
    }
    return out;
  }

  function choose(list){
    const cx=IMG/2,cy=IMG/2;let best=null,cost=1e9;
    for(const c of list){const d=Math.hypot(c.x-cx,c.y-cy);if(d>RADIUS)continue;const v=d-Math.min(c.area,500)*.025;if(v<cost){cost=v;best=c}}
    return best;
  }

  function match(next,list,pred){
    const tx=pred?pred.x:next.x,ty=pred?pred.y:next.y;let best=null,cost=1e9;
    for(const c of list){const d=Math.hypot(c.x-tx,c.y-ty);if(d>MAX_JUMP)continue;const ratio=Math.max(c.area,next.area)/Math.max(1,Math.min(c.area,next.area));if(ratio>5.5)continue;const v=d+Math.abs(Math.log(c.area/next.area))*11;if(v<cost){cost=v;best=c}}
    return best;
  }

  function fit(points,key){const n=points.length,mt=points.reduce((s,p)=>s+p.t,0)/n,mv=points.reduce((s,p)=>s+p[key],0)/n;let num=0,den=0;for(const p of points){const dt=p.t-mt;num+=dt*(p[key]-mv);den+=dt*dt}const slope=den?num/den:0,intercept=mv-slope*mt;let mse=0;for(const p of points){const e=p[key]-(intercept+slope*p.t);mse+=e*e}return {slope,rmse:Math.sqrt(mse/n)}}
  function project(lat,lon,z){const w=256*(2**z),x=(lon+180)/360*w,s=Math.sin(lat*Math.PI/180),y=(.5-Math.log((1+s)/(1-s))/(4*Math.PI))*w;return[x,y]}
  function unproject(x,y,z){const w=256*(2**z),lon=x/w*360-180,n=Math.PI-2*Math.PI*y/w,lat=180/Math.PI*Math.atan(Math.sinh(n));return[lat,lon]}
  function pxLatLng(x,y){const [cx,cy]=project(C[0],C[1],Z);return unproject(cx+(x-IMG/2),cy+(y-IMG/2),Z)}
  function stats(dx,dy){const mpp=156543.03392*Math.cos(C[0]*Math.PI/180)/(2**Z),east=dx*mpp,north=-dy*mpp,dist=Math.hypot(east,north),speed=dist*6/1000,b=(Math.atan2(east,north)*180/Math.PI+360)%360,names=["N","NE","E","SE","S","SO","O","NO"];return{speed,bearing:b,name:names[Math.round(b/45)%8]}}

  async function trackCell(){
    motionUI("ricerca cella…");const recent=past.slice(-HISTORY),loaded=[];
    try{
      for(const f of recent){const it=await loadImage(imageUrl(f));loaded.push({f,cs:comps(maskFrom(it.img)),u:it.u})}
      const target=choose(loaded.at(-1).cs);if(!target)throw Error("nessuna cella significativa vicina a Borgo Viazza");
      const pts=[{...target,f:loaded.at(-1).f,t:0}];let next=target,dxPrev=0,dyPrev=0;
      for(let i=loaded.length-2;i>=0;i--){const mins=(loaded.at(-1).f.time-loaded[i].f.time)/60,pred=pts.length>=2?{x:next.x-dxPrev,y:next.y-dyPrev}:null,prev=match(next,loaded[i].cs,pred);if(!prev)break;const newer=pts.at(-1);dxPrev=newer.x-prev.x;dyPrev=newer.y-prev.y;pts.push({...prev,f:loaded[i].f,t:-mins});next=prev}
      if(pts.length<3)throw Error(`cella trovata ma seguita solo in ${pts.length} frame`);
      pts.sort((a,b)=>a.t-b.t);const fx=fit(pts,"x"),fy=fit(pts,"y"),dx10=fx.slope*10,dy10=fy.slope*10,st=stats(dx10,dy10),res=Math.hypot(fx.rmse,fy.rmse),coverage=Math.min(1,pts.length/HISTORY),cons=Math.exp(-res/10),areas=pts.map(p=>p.area),mean=areas.reduce((s,a)=>s+a,0)/areas.length,spread=Math.sqrt(areas.reduce((s,a)=>s+(a-mean)**2,0)/areas.length)/Math.max(1,mean),shape=Math.max(0,1-Math.min(1,spread)),conf=Math.max(0,Math.min(1,coverage*.45+cons*.35+shape*.2)),latest=pts.at(-1);
      track={target:latest,pts,dx10,dy10,speed:st.speed,bearing:st.bearing,name:st.name,conf};
      const cl=conf>=.68?"alta":conf>=.42?"media":"bassa",dir=st.speed<3.5?"quasi ferma":`${st.name} · ${Math.round(st.bearing)}°`;
      motionUI("cella agganciata",dir,`${Math.round(st.speed)} km/h`,cl,`Cella seguita in ${pts.length} frame. Il punto giallo indica l'eco scelto automaticamente; il FUTURO usa la traiettoria di questa cella.`);updateMarker(0);return track;
    } finally {for(const x of loaded)try{URL.revokeObjectURL(x.u)}catch(_){}}
  }

  function updateMarker(step){if(!track)return;const ll=pxLatLng(track.target.x+track.dx10*step,track.target.y+track.dy10*step);if(!cellMarker){cellMarker=L.circleMarker(ll,{radius:8,weight:3,color:"#ffcf4d",fillColor:"#ffcf4d",fillOpacity:.12}).addTo(map).bindTooltip("cella seguita",{permanent:true,direction:"right",offset:[10,0],className:"cell-tag"})}else cellMarker.setLatLng(ll)}
  function remObs(){if(observed){try{map.removeLayer(observed)}catch(_){}observed=null}}
  function remFc(){if(forecast){try{map.removeLayer(forecast)}catch(_){}forecast=null}forecastPane.style.marginLeft="0px";forecastPane.style.marginTop="0px"}

  function showObserved(f){remFc();updateMarker(0);return new Promise(resolve=>{const n=L.tileLayer(`${host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`,{maxZoom:18,maxNativeZoom:7,opacity:0,keepBuffer:4,updateWhenZooming:false,updateWhenIdle:true}).addTo(map);let loaded=0,done=false;const finish=ok=>{if(done)return;done=true;if(ok){remObs();observed=n;n.setOpacity(.72)}else try{map.removeLayer(n)}catch(_){}resolve(ok)};n.on("tileload",()=>loaded++);n.once("load",()=>finish(loaded>0));setTimeout(()=>finish(loaded>0),6500)})}
  function ensureForecast(){if(forecast)return;const last=past.at(-1);forecast=L.tileLayer(`${host}${last.path}/256/{z}/{x}/{y}/2/1_1.png`,{pane:"forecastPane",maxZoom:18,maxNativeZoom:7,opacity:.72,keepBuffer:6,updateWhenZooming:false,updateWhenIdle:true}).addTo(map)}
  function apply(step){if(!track)return false;ensureForecast();remObs();const scale=2**(map.getZoom()-Z);forecastPane.style.marginLeft=`${track.dx10*step*scale}px`;forecastPane.style.marginTop=`${track.dy10*step*scale}px`;updateMarker(step);return true}

  async function show(n){const my=++token;idx=Math.max(0,Math.min(frames.length-1,n));$("timeline").value=idx;const f=frames[idx];if(f.kind==="forecast"){$("badge").textContent="PREVISIONE";$("badge").className="badge future";$("clock").textContent=fmt(f.t);$("source").textContent=`Cell Tracking · +${f.step*STEP}m`;if(!track){status("warn","Tracking non disponibile","Nessuna cella è stata agganciata in modo sufficiente.");return false}const ok=apply(f.step),cl=track.conf>=.68?"alta":track.conf>=.42?"media":"bassa";status(ok?"ok":"warn",ok?"Estrapolazione cella caricata":"Estrapolazione non disponibile",ok?`+${f.step*STEP} min · cella verso ${track.name} a circa ${Math.round(track.speed)} km/h · affidabilità ${cl}.`:"Impossibile spostare il layer futuro.");return ok}
    $("badge").textContent="OSSERVATO";$("badge").className="badge";$("clock").textContent=fmt(f.t);$("source").textContent="RainViewer · radar";status("","Caricamento radar",`Frame radar ${fmt(f.t)}…`);const ok=await showObserved(f);if(my!==token)return false;status(ok?"ok":"warn",ok?"Radar reale caricato":"Radar non disponibile",ok?`Osservazione radar delle ${fmt(f.t)}.`:"Il frame RainViewer non ha risposto.");return ok}

  function stop(){playing=false;$("play").textContent="▶ Play"}
  async function start(){if(playing)return;playing=true;$("play").textContent="⏸ Pausa";while(playing){await show(idx>=frames.length-1?0:idx+1);if(!playing)break;await new Promise(r=>setTimeout(r,frames[idx]?.kind==="forecast"?700:850))}}
  $("play").onclick=()=>playing?stop():start();$("prev").onclick=()=>{stop();show(idx-1)};$("next").onclick=()=>{stop();show(idx+1)};$("now").onclick=()=>{stop();show(nowIdx)};$("timeline").oninput=e=>{stop();show(+e.target.value)};map.on("zoomend",()=>{const f=frames[idx];if(f?.kind==="forecast")apply(f.step)});

  try{
    const r=await fetch(RV,{cache:"no-store"});if(!r.ok)throw Error(`HTTP ${r.status}`);const d=await r.json();host=d.host||"https://tilecache.rainviewer.com";const raw=d.radar&&Array.isArray(d.radar.past)?d.radar.past:[];if(!raw.length)throw Error("nessun frame RainViewer");past=raw.map(x=>({kind:"observed",t:x.time*1000,time:x.time,path:x.path}));frames=past.map(x=>({...x}));nowIdx=frames.length-1;const base=frames[nowIdx].t;for(let step=1;step<=FUTURE;step++)frames.push({kind:"forecast",step,t:base+step*STEP*60000});$("timeline").max=frames.length-1;idx=nowIdx;$("timeline").value=idx;await show(idx);setTimeout(()=>map.invalidateSize(),200);
    try{status("","Cell tracking","Cerco e seguo una singola cella negli ultimi frame radar…");await trackCell();const cl=track.conf>=.68?"alta":track.conf>=.42?"media":"bassa";status("ok","Cella agganciata",`Tracking pronto: ${track.pts.length} frame · ${track.name} · ${Math.round(track.speed)} km/h · affidabilità ${cl}. Prova +10/+20/+30 min.`)}catch(e){console.error(e);track=null;motionUI("nessuna cella agganciata","--","--","--",`Tracking non riuscito: ${e.message||e}. L'OSSERVATO continua a funzionare normalmente.`);status("warn","OSSERVATO OK · tracking non riuscito",`${e.message||e}. Serve una cella sufficientemente riconoscibile vicino alla zona.`)}
  }catch(e){console.error(e);status("warn","Errore inizializzazione",`Non riesco ad avviare il radar: ${e.message||e}.`)}
});
