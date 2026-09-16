"use strict";

document.addEventListener("DOMContentLoaded", async () => {
  const C = [44.45, 12.02];
  const RV_MANIFEST = "https://api.rainviewer.com/public/weather-maps.json";
  const ANALYSIS_Z = 7;
  const ANALYSIS_IMG = 512;
  const CROP = 360;
  const SMALL = 180;
  const FUTURE_STEP_MIN = 10;
  const FUTURE_STEPS = 9;
  const PAIRS_TO_USE = 5;

  const $ = id => document.getElementById(id);

  const map = L.map("map", {zoomControl:true}).setView([44.45,11.85],8);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
    maxZoom:18,attribution:"© OpenStreetMap"
  }).addTo(map);

  map.createPane("forecastPane");
  const forecastPane = map.getPane("forecastPane");
  forecastPane.style.zIndex = "250";
  forecastPane.style.pointerEvents = "none";

  L.circleMarker(C,{radius:6,weight:2,color:"#fff",fillColor:"#58c7ff",fillOpacity:1})
    .addTo(map).bindTooltip("Borgo Viazza",{permanent:true,direction:"top",offset:[0,-7],className:"borgo"});

  let rvHost="", past=[], frames=[], idx=0, nowIdx=0;
  let observedLayer=null, forecastLayer=null, playing=false, renderToken=0;
  let motion=null;

  const fmt=t=>new Intl.DateTimeFormat("it-IT",{hour:"2-digit",minute:"2-digit"}).format(new Date(t));

  function status(kind,title,text){
    $("led").className="led "+kind;
    $("statusTitle").textContent=title;
    $("status").textContent=text;
  }

  function setMotionUI(state,dir="--",speed="--",conf="--",note=""){
    $("motionState").textContent=state;
    $("motionDir").textContent=dir;
    $("motionSpeed").textContent=speed;
    $("motionConf").textContent=conf;
    if(note)$("motionNote").textContent=note;
  }

  function coordImageUrl(frame){
    return `${rvHost}${frame.path}/${ANALYSIS_IMG}/${ANALYSIS_Z}/${C[0]}/${C[1]}/2/1_1.png`;
  }

  async function loadImage(url,timeoutMs=8000){
    const ac=new AbortController();
    const timer=setTimeout(()=>ac.abort(),timeoutMs);
    try{
      const r=await fetch(url,{mode:"cors",cache:"no-store",signal:ac.signal});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const blob=await r.blob();
      const objectURL=URL.createObjectURL(blob);
      const img=new Image();
      img.decoding="async";
      await new Promise((resolve,reject)=>{
        img.onload=resolve;
        img.onerror=()=>reject(new Error("PNG non decodificato"));
        img.src=objectURL;
      });
      return {img,objectURL};
    }finally{clearTimeout(timer)}
  }

  function makeField(img){
    const src=document.createElement("canvas");
    src.width=ANALYSIS_IMG; src.height=ANALYSIS_IMG;
    const sctx=src.getContext("2d",{willReadFrequently:true});
    sctx.drawImage(img,0,0,ANALYSIS_IMG,ANALYSIS_IMG);

    const crop=document.createElement("canvas");
    crop.width=SMALL; crop.height=SMALL;
    const ctx=crop.getContext("2d",{willReadFrequently:true});

    const o=(ANALYSIS_IMG-CROP)/2;
    ctx.drawImage(src,o,o,CROP,CROP,0,0,SMALL,SMALL);

    const rgba=ctx.getImageData(0,0,SMALL,SMALL).data;
    const f=new Uint8Array(SMALL*SMALL);
    const active=[];

    for(let i=0,p=0;i<rgba.length;i+=4,p++){
      const a=rgba[i+3];
      if(a>36){
        f[p]=1;
        active.push(p);
      }
    }
    return {f,active};
  }

  function shiftScore(A,B,dx,dy){
    if(!A.active.length||!B.active.length)return 0;
    let hit=0;
    const bf=B.f;

    for(const p of A.active){
      const y=(p/SMALL)|0;
      const x=p-y*SMALL;
      const xx=x+dx, yy=y+dy;
      if(xx<0||xx>=SMALL||yy<0||yy>=SMALL)continue;
      if(bf[yy*SMALL+xx])hit++;
    }
    return hit/Math.sqrt(A.active.length*B.active.length);
  }

  function estimatePair(A,B){
    const MAX=14;
    const zero=shiftScore(A,B,0,0);
    let best={dx:0,dy:0,score:zero};

    for(let dy=-MAX;dy<=MAX;dy++){
      for(let dx=-MAX;dx<=MAX;dx++){
        const s=shiftScore(A,B,dx,dy)-0.00008*(Math.abs(dx)+Math.abs(dy));
        if(s>best.score)best={dx,dy,score:s};
      }
    }
    return {dx:best.dx,dy:best.dy,score:best.score,zero,gain:best.score-zero};
  }

  function median(values){
    const a=values.slice().sort((x,y)=>x-y);
    const m=Math.floor(a.length/2);
    return a.length%2?a[m]:(a[m-1]+a[m])/2;
  }

  function dirName(deg){
    const names=["N","NE","E","SE","S","SO","O","NO"];
    return names[Math.round(deg/45)%8];
  }

  function pxMotionStats(dxPx10,dyPx10,quality){
    const mpp=156543.03392*Math.cos(C[0]*Math.PI/180)/(2**ANALYSIS_Z);
    const east=dxPx10*mpp, north=-dyPx10*mpp;
    const dist10=Math.hypot(east,north);
    const speedKmh=dist10*6/1000;
    const bearing=(Math.atan2(east,north)*180/Math.PI+360)%360;
    return {speedKmh,bearing,name:dirName(bearing),quality};
  }

  async function analyseMotion(){
    setMotionUI("analisi in corso…");
    const recent=past.slice(-(PAIRS_TO_USE+1));
    const loaded=[];

    try{
      for(const f of recent){
        const item=await loadImage(coordImageUrl(f));
        loaded.push({...item,field:makeField(item.img),frame:f});
      }

      const pairs=[];
      for(let i=1;i<loaded.length;i++){
        const A=loaded[i-1],B=loaded[i];
        if(A.field.active.length<25||B.field.active.length<25)continue;

        const e=estimatePair(A.field,B.field);
        const dtMin=Math.max(1,(B.frame.time-A.frame.time)/60);

        // SMALL rappresenta CROP px originali.
        const toOriginal=CROP/SMALL;
        const norm=FUTURE_STEP_MIN/dtMin;
        pairs.push({
          dx:e.dx*toOriginal*norm,
          dy:e.dy*toOriginal*norm,
          score:e.score,
          gain:e.gain
        });
      }

      if(!pairs.length)throw new Error("echi locali insufficienti");

      const dx=median(pairs.map(p=>p.dx));
      const dy=median(pairs.map(p=>p.dy));
      const score=pairs.reduce((s,p)=>s+p.score,0)/pairs.length;
      const gain=pairs.reduce((s,p)=>s+p.gain,0)/pairs.length;

      const quality=Math.max(0,Math.min(1,score*0.7+Math.max(0,gain)*3));
      const stats=pxMotionStats(dx,dy,quality);

      // Se lo spostamento è sotto la risoluzione utile, non diciamo più
      // "alta affidabilità / 0 km/h": lo segnaliamo come non risolto.
      const unresolved = stats.speedKmh < 4 || gain < 0.008;

      if(unresolved){
        motion={
          dxPx10:0,dyPx10:0,speedKmh:0,bearing:0,name:"non risolto",
          quality:Math.min(quality,.28),unresolved:true
        };
        setMotionUI(
          "moto non risolto",
          "incerto",
          "< 4 km/h",
          "bassa",
          `Gli ultimi ${pairs.length+1} frame sono molto simili nel settore locale: non c'è uno spostamento abbastanza netto da proiettare con affidabilità. La v4.6 evita quindi di dichiarare falsamente “0 km/h, affidabilità alta”.`
        );
      }else{
        motion={dxPx10:dx,dyPx10:dy,...stats,unresolved:false};
        const conf=quality>=.58?"alta":quality>=.34?"media":"bassa";
        setMotionUI(
          "pronta",
          `${stats.name} · ${Math.round(stats.bearing)}°`,
          `${Math.round(stats.speedKmh)} km/h`,
          conf,
          `Stima locale da ${pairs.length+1} frame. Il FUTURO sposta l'intero ultimo layer radar; intensificazione o dissolvimento delle celle non sono previste da questa estrapolazione.`
        );
      }
    }finally{
      for(const x of loaded){try{URL.revokeObjectURL(x.objectURL)}catch(_){}}
    }
    return motion;
  }

  function removeObserved(){
    if(observedLayer){try{map.removeLayer(observedLayer)}catch(_){} observedLayer=null}
  }

  function removeForecast(){
    if(forecastLayer){try{map.removeLayer(forecastLayer)}catch(_){} forecastLayer=null}
    forecastPane.style.marginLeft="0px";
    forecastPane.style.marginTop="0px";
  }

  function showObserved(f){
    removeForecast();
    return new Promise(resolve=>{
      const n=L.tileLayer(`${rvHost}${f.path}/256/{z}/{x}/{y}/2/1_1.png`,{
        maxZoom:18,maxNativeZoom:7,opacity:0,keepBuffer:3,updateWhenZooming:false,updateWhenIdle:true
      }).addTo(map);
      let loaded=0,done=false;
      const finish=ok=>{
        if(done)return;done=true;
        if(ok){
          removeObserved(); observedLayer=n; n.setOpacity(.72);
        }else{try{map.removeLayer(n)}catch(_){}}
        resolve(ok);
      };
      n.on("tileload",()=>loaded++);
      n.once("load",()=>finish(loaded>0));
      setTimeout(()=>finish(loaded>0),6500);
    });
  }

  function ensureForecastLayer(){
    if(forecastLayer)return;
    const last=past[past.length-1];
    forecastLayer=L.tileLayer(`${rvHost}${last.path}/256/{z}/{x}/{y}/2/1_1.png`,{
      pane:"forecastPane",
      maxZoom:18,maxNativeZoom:7,opacity:.72,keepBuffer:5,
      updateWhenZooming:false,updateWhenIdle:true
    }).addTo(map);
  }

  function applyForecastShift(step){
    ensureForecastLayer();
    removeObserved();

    if(!motion || motion.unresolved){
      forecastPane.style.marginLeft="0px";
      forecastPane.style.marginTop="0px";
      return false;
    }

    const scale=2**(map.getZoom()-ANALYSIS_Z);
    const pxX=motion.dxPx10*step*scale;
    const pxY=motion.dyPx10*step*scale;

    forecastPane.style.marginLeft=`${pxX}px`;
    forecastPane.style.marginTop=`${pxY}px`;
    return true;
  }

  async function show(n){
    const token=++renderToken;
    idx=Math.max(0,Math.min(frames.length-1,n));
    $("timeline").value=idx;
    const f=frames[idx];

    if(f.kind==="forecast"){
      $("badge").textContent="PREVISIONE";
      $("badge").className="badge future";
      $("clock").textContent=fmt(f.t);
      $("source").textContent=`Nowcast Conte · +${f.step*10}m`;

      const moved=applyForecastShift(f.step);

      if(!motion){
        status("warn","Nowcast non disponibile","La stima del movimento non è pronta.");
        return false;
      }

      if(motion.unresolved){
        status(
          "warn",
          "Movimento locale non risolto",
          `+${f.step*10} min: mostro l'ultimo radar reale senza spostarlo, perché i frame recenti non danno un vettore locale abbastanza affidabile.`
        );
        return true;
      }

      status(
        "ok",
        "Estrapolazione caricata",
        `+${f.step*10} min · intero layer radar spostato verso ${motion.name} a circa ${Math.round(motion.speedKmh)} km/h.`
      );
      return moved;
    }

    $("badge").textContent="OSSERVATO";
    $("badge").className="badge";
    $("clock").textContent=fmt(f.t);
    $("source").textContent="RainViewer · radar";

    status("","Caricamento radar",`Frame radar ${fmt(f.t)}…`);
    const ok=await showObserved(f);
    if(token!==renderToken)return false;
    status(ok?"ok":"warn",ok?"Radar reale caricato":"Radar non disponibile",ok?`Osservazione radar delle ${fmt(f.t)}.`:"Il frame RainViewer non ha risposto.");
    return ok;
  }

  function stop(){playing=false;$("play").textContent="▶ Play"}

  async function start(){
    if(playing)return;
    playing=true;$("play").textContent="⏸ Pausa";
    while(playing){
      const next=idx>=frames.length-1?0:idx+1;
      await show(next);
      if(!playing)break;
      await new Promise(r=>setTimeout(r,frames[idx]?.kind==="forecast"?700:850));
    }
  }

  $("play").onclick=()=>playing?stop():start();
  $("prev").onclick=()=>{stop();show(idx-1)};
  $("next").onclick=()=>{stop();show(idx+1)};
  $("now").onclick=()=>{stop();show(nowIdx)};
  $("timeline").oninput=e=>{stop();show(+e.target.value)};

  map.on("zoomend",()=>{
    if(frames[idx]?.kind==="forecast")applyForecastShift(frames[idx].step);
  });

  try{
    const r=await fetch(RV_MANIFEST,{cache:"no-store"});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const d=await r.json();
    rvHost=d.host||"https://tilecache.rainviewer.com";

    const raw=d.radar&&Array.isArray(d.radar.past)?d.radar.past:[];
    if(!raw.length)throw new Error("nessun frame RainViewer");

    past=raw.map(x=>({kind:"observed",t:x.time*1000,time:x.time,path:x.path}));
    frames=past.map(x=>({...x}));
    nowIdx=frames.length-1;

    const base=frames[nowIdx].t;
    for(let step=1;step<=FUTURE_STEPS;step++){
      frames.push({kind:"forecast",step,t:base+step*FUTURE_STEP_MIN*60000});
    }

    $("timeline").max=frames.length-1;
    idx=nowIdx;$("timeline").value=idx;
    await show(idx);
    setTimeout(()=>map.invalidateSize(),200);

    try{
      status("","Analisi movimento locale","Confronto gli ultimi frame vicino a Borgo Viazza…");
      await analyseMotion();

      if(motion.unresolved){
        status(
          "warn",
          "Radar pronto · moto locale incerto",
          "La copertura completa è pronta, ma in questo momento il piccolo eco locale non mostra uno spostamento abbastanza netto da proiettare in modo credibile."
        );
      }else{
        status(
          "ok",
          "Nowcast Conte pronto",
          `Moto locale ${motion.name}, circa ${Math.round(motion.speedKmh)} km/h. Prova +10/+20/+30 min e Play.`
        );
      }
    }catch(e){
      console.error(e);
      motion=null;
      setMotionUI("non disponibile","--","--","--",`Analisi non riuscita: ${e.message||e}.`);
      status("warn","OSSERVATO OK · analisi fallita",`Il radar reale funziona, ma il moto locale non è stato calcolato: ${e.message||e}.`);
    }
  }catch(e){
    console.error(e);
    status("warn","Errore inizializzazione",`Non riesco ad avviare il radar: ${e.message||e}.`);
  }
});
