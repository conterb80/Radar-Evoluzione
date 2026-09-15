"use strict";
document.addEventListener("DOMContentLoaded", () => {
  const NOW = 8, MAX = 20, STEP = 15*60*1000;
  const center=[44.45,12.02];
  const map=L.map("map",{zoomControl:true}).setView([44.48,11.65],8);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:"© OpenStreetMap"}).addTo(map);
  L.circleMarker(center,{radius:6,weight:2,color:"#fff",fillColor:"#58c7ff",fillOpacity:1}).addTo(map)
    .bindTooltip("Borgo Viazza",{permanent:true,direction:"top",offset:[0,-7],className:"borgo"});

  const $=id=>document.getElementById(id);
  const timeline=$("timeline"), clock=$("clock"), badge=$("badge"), play=$("playBtn");
  let idx=NOW, timer=null, storm=null;
  const base=Date.now()-NOW*STEP;
  const fmt=t=>new Intl.DateTimeFormat("it-IT",{hour:"2-digit",minute:"2-digit"}).format(new Date(t));

  function draw(n){
    idx=Math.max(0,Math.min(MAX,n)); timeline.value=idx; clock.textContent=fmt(base+idx*STEP);
    const future=idx>NOW;
    badge.textContent=future?"PREVISIONE DEMO":"OSSERVATO DEMO";
    badge.className="badge"+(future?" future":"");
    if(storm) map.removeLayer(storm);
    storm=L.layerGroup().addTo(map);

    // Sistema perturbato da W/SW verso E/NE, con struttura irregolare a più nuclei.
    const lat=43.98+idx*0.047, lon=10.20+idx*0.135;
    const life=Math.max(.32,Math.sin(Math.PI*(idx+2)/(MAX+4)));
    const cells=[
      [0,0,43000,1.00],[.13,-.18,32000,.82],[-.10,.23,29000,.72],
      [.20,.10,22000,.62],[-.18,-.12,19000,.52]
    ];
    cells.forEach(([dy,dx,r,k])=>{
      const s=life*k;
      const col=s>.72?"#df294d":s>.54?"#ff812f":s>.38?"#ffd24a":"#49c8ff";
      L.circle([lat+dy,lon+dx],{radius:r,stroke:false,fillColor:col,fillOpacity:.13+s*.43}).addTo(storm);
      L.circle([lat+dy,lon+dx],{radius:r*.55,stroke:false,fillColor:col,fillOpacity:.20+s*.50}).addTo(storm);
      L.circle([lat+dy,lon+dx],{radius:r*.25,stroke:false,fillColor:col,fillOpacity:.28+s*.55}).addTo(storm);
    });
    $("statusTitle").textContent=future?"Fase futura simulata":"Fase osservata simulata";
    $("status").textContent=`Frame ${idx+1}/21 · ${fmt(base+idx*STEP)} · La demo serve solo a valutare movimento, timeline e fluidità.`;
  }

  function stop(){if(timer)clearInterval(timer);timer=null;play.textContent="▶ Play"}
  function start(){
    stop(); play.textContent="⏸ Pausa";
    timer=setInterval(()=>{ draw(idx>=MAX?0:idx+1); },650);
  }

  play.addEventListener("click",()=>timer?stop():start());
  $("prevBtn").addEventListener("click",()=>{stop();draw(idx-1)});
  $("nextBtn").addEventListener("click",()=>{stop();draw(idx+1)});
  $("nowBtn").addEventListener("click",()=>{stop();draw(NOW)});
  timeline.addEventListener("input",e=>{stop();draw(Number(e.target.value))});
  $("demoBtn").addEventListener("click",()=>{ $("demoBtn").classList.add("active");$("liveBtn").classList.remove("active");draw(idx);});
  $("liveBtn").addEventListener("click",()=>{stop();$("liveBtn").classList.add("active");$("demoBtn").classList.remove("active");$("statusTitle").textContent="LIVE non attivo in questa v3";$("status").textContent="Questa versione serve esclusivamente a validare l'animazione grafica. Il motore LIVE verrà riunito dopo il test.";});
  draw(NOW);
  setTimeout(()=>map.invalidateSize(),250);
});
