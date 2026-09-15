"use strict";
document.addEventListener("DOMContentLoaded",async()=>{
 const C=[44.45,12.02], STEP=15*60*1000, FUTURE=12, DIAG_Z=7;
 const $=id=>document.getElementById(id);
 const map=L.map("map",{zoomControl:true}).setView([44.45,11.85],8);
 L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:"© OpenStreetMap"}).addTo(map);
 L.circleMarker(C,{radius:6,weight:2,color:"#fff",fillColor:"#58c7ff",fillOpacity:1}).addTo(map).bindTooltip("Borgo Viazza",{permanent:true,direction:"top",offset:[0,-7],className:"borgo"});
 let rvHost="",frames=[],idx=0,nowIdx=0,layer=null,timer=null;
 const fmt=t=>new Intl.DateTimeFormat("it-IT",{hour:"2-digit",minute:"2-digit"}).format(new Date(t));
 const iso=t=>new Date(t).toISOString().replace(".000Z","Z");
 function status(kind,title,text){$("led").className="led "+kind;$("statusTitle").textContent=title;$("status").textContent=text}
 function key(){return localStorage.getItem("mcTomorrowKey")||""}
 function keyUI(){$("keyState").textContent=key()?"chiave salvata":"chiave non impostata";$("apiKey").value=key()}
 $("saveKey").onclick=()=>{let v=$("apiKey").value.trim();v?localStorage.setItem("mcTomorrowKey",v):localStorage.removeItem("mcTomorrowKey");keyUI();status("ok","Chiave salvata","Ora prova un solo scatto oltre ADESSO.");};
 function tomorrowURL(t){return `https://api.tomorrow.io/v4/map/tile/{z}/{x}/{y}/precipitationIntensity/${iso(t)}.png?apikey=${encodeURIComponent(key())}`}
 function tileXY(lat,lon,z){const n=2**z,x=Math.floor((lon+180)/360*n),r=lat*Math.PI/180,y=Math.floor((1-Math.asinh(Math.tan(r))/Math.PI)/2*n);return [x,y]}
 async function diagnose(t){
   const [x,y]=tileXY(C[0],C[1],DIAG_Z);
   const u=`https://api.tomorrow.io/v4/map/tile/${DIAG_Z}/${x}/${y}/precipitationIntensity/${iso(t)}.png?apikey=${encodeURIComponent(key())}`;
   try{
     const r=await fetch(u,{cache:"no-store"});
     const ct=(r.headers.get("content-type")||"").toLowerCase();
     if(r.ok&&ct.includes("image")) return {ok:true,code:r.status,msg:`HTTP ${r.status} · tile PNG valida`};
     let body=""; try{body=(await r.text()).slice(0,140).replace(/\s+/g," ")}catch{}
     return {ok:false,code:r.status,msg:`HTTP ${r.status}${body?" · "+body:""}`};
   }catch(e){return {ok:false,code:0,msg:`Errore rete/CORS · ${e.message}`}}
 }
 function replace(url,opacity=.72){return new Promise(resolve=>{let n=L.tileLayer(url,{maxZoom:18,maxNativeZoom:7,opacity:0,crossOrigin:true,keepBuffer:1,updateWhenZooming:false}).addTo(map),done=false;const finish=ok=>{if(done)return;done=true;if(ok){let old=layer;layer=n;n.setOpacity(opacity);if(old)setTimeout(()=>{try{map.removeLayer(old)}catch{}},120)}else{try{map.removeLayer(n)}catch{}}resolve(ok)};n.once("load",()=>finish(true));n.once("tileerror",()=>setTimeout(()=>finish(false),250));setTimeout(()=>finish(false),6500)})}
 async function show(n){idx=Math.max(0,Math.min(frames.length-1,n));$("timeline").value=idx;let f=frames[idx],future=f.kind==="forecast";$("badge").textContent=future?"PREVISIONE":"OSSERVATO";$("badge").className="badge"+(future?" future":"");$("clock").textContent=fmt(f.t);$("source").textContent=future?"Tomorrow.io · diagnostica":"RainViewer · radar";
  if(future){
   if(!key()){status("warn","Serve la chiave Tomorrow.io","Inserisci la API key Tomorrow.io.");return}
   status("","Diagnostica Tomorrow.io",`Verifico UNA tile futura delle ${fmt(f.t)}…`);
   const d=await diagnose(f.t);
   if(!d.ok){status("warn","Tomorrow.io non accetta il frame",d.msg);return}
   status("ok","API Tomorrow.io OK",`${d.msg}. Carico il layer…`);
   let ok=await replace(tomorrowURL(f.t));
   status(ok?"ok":"warn",ok?"Previsione reale caricata":"API OK, problema nel layer Leaflet",ok?`Frame ${fmt(f.t)} caricato · HTTP ${d.code}.`:`${d.msg} · la singola tile funziona, il layer multiplo no.`);
  }else{
   status("","Caricamento radar",`Frame radar ${fmt(f.t)}…`);
   let ok=await replace(`${rvHost}${f.path}/256/{z}/{x}/{y}/2/1_1.png`);
   status(ok?"ok":"warn",ok?"Radar reale caricato":"Radar non disponibile",ok?`Osservazione radar delle ${fmt(f.t)}.`:"Il frame RainViewer non ha risposto.");
  }}
 function stop(){if(timer)clearInterval(timer);timer=null;$("play").textContent="▶ Play"}
 function start(){stop();$("play").textContent="⏸ Pausa";timer=setInterval(()=>show(idx>=frames.length-1?0:idx+1),900)}
 $("play").onclick=()=>timer?stop():start();$("prev").onclick=()=>{stop();show(idx-1)};$("next").onclick=()=>{stop();show(idx+1)};$("now").onclick=()=>{stop();show(nowIdx)};$("timeline").oninput=e=>{stop();show(+e.target.value)};
 keyUI();
 try{let r=await fetch("https://api.rainviewer.com/public/weather-maps.json",{cache:"no-store"});if(!r.ok)throw Error(r.status);let d=await r.json();rvHost=d.host||"https://tilecache.rainviewer.com";let past=(d.radar&&Array.isArray(d.radar.past))?d.radar.past:[];frames=past.map(x=>({kind:"observed",t:x.time*1000,path:x.path}));if(!frames.length)throw Error("no frames");nowIdx=frames.length-1;let base=frames[nowIdx].t;for(let j=1;j<=FUTURE;j++)frames.push({kind:"forecast",t:base+j*STEP});$("timeline").max=frames.length-1;idx=nowIdx;$("timeline").value=idx;await show(idx);setTimeout(()=>map.invalidateSize(),200)}catch(e){console.error(e);status("warn","Errore inizializzazione","Non riesco a caricare il manifest radar RainViewer. Riprova più tardi.");}
});