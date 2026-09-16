"use strict";

document.addEventListener("DOMContentLoaded", async () => {
  const C = [44.45, 12.02];
  const RV_MANIFEST = "https://api.rainviewer.com/public/weather-maps.json";

  // RainViewer free API: max native zoom 7.
  const ANALYSIS_Z = 7;
  const IMG_SIZE = 512;
  const SMALL = 128;
  const FUTURE_STEP_MIN = 10;
  const FUTURE_STEPS = 9; // +90 min
  const PAIRS_TO_USE = 3;

  const $ = id => document.getElementById(id);

  const map = L.map("map", { zoomControl: true }).setView([44.45, 11.85], 8);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "© OpenStreetMap"
  }).addTo(map);

  L.circleMarker(C, {
    radius: 6,
    weight: 2,
    color: "#fff",
    fillColor: "#58c7ff",
    fillOpacity: 1
  }).addTo(map).bindTooltip("Borgo Viazza", {
    permanent: true,
    direction: "top",
    offset: [0,-7],
    className: "borgo"
  });

  let rvHost = "";
  let past = [];
  let frames = [];
  let idx = 0;
  let nowIdx = 0;
  let layer = null;
  let playing = false;
  let renderToken = 0;

  let motion = null;
  let latestForecastImageURL = null;
  let latestForecastImageObjectURL = null;

  const fmt = t => new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit", minute: "2-digit"
  }).format(new Date(t));

  function status(kind, title, text) {
    $("led").className = "led " + kind;
    $("statusTitle").textContent = title;
    $("status").textContent = text;
  }

  function setMotionUI(state, dir="--", speed="--", conf="--", note="") {
    $("motionState").textContent = state;
    $("motionDir").textContent = dir;
    $("motionSpeed").textContent = speed;
    $("motionConf").textContent = conf;
    if (note) $("motionNote").textContent = note;
  }

  function coordImageUrl(frame) {
    return `${rvHost}${frame.path}/${IMG_SIZE}/${ANALYSIS_Z}/${C[0]}/${C[1]}/2/1_1.png`;
  }

  async function fetchImageBitmap(url, timeoutMs=8000) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);

    try {
      const r = await fetch(url, {
        mode: "cors",
        cache: "no-store",
        signal: ac.signal
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      const blob = await r.blob();
      if (!blob.type.startsWith("image/")) {
        throw new Error(`risposta non immagine (${blob.type || "tipo sconosciuto"})`);
      }

      const objectURL = URL.createObjectURL(blob);
      const img = new Image();
      img.decoding = "async";

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("decodifica PNG fallita"));
        img.src = objectURL;
      });

      return { img, objectURL };
    } finally {
      clearTimeout(timer);
    }
  }

  function makeField(img) {
    const c = document.createElement("canvas");
    c.width = SMALL;
    c.height = SMALL;
    const ctx = c.getContext("2d", { willReadFrequently:true });

    // Ridimensionamento: preserva il pattern generale, abbastanza per stimare il moto.
    ctx.drawImage(img, 0, 0, SMALL, SMALL);

    let rgba;
    try {
      rgba = ctx.getImageData(0,0,SMALL,SMALL).data;
    } catch (e) {
      throw new Error("lettura pixel bloccata dal browser/CORS");
    }

    const f = new Uint8Array(SMALL * SMALL);
    let active = 0;

    for (let i=0, p=0; i<rgba.length; i+=4, p++) {
      const a = rgba[i+3];

      // Le tile radar hanno sfondo trasparente. Soglia morbida per tenere
      // anche gli echi deboli ma scartare quasi tutta la trasparenza.
      if (a > 28) {
        f[p] = 1;
        active++;
      }
    }

    return { f, active };
  }

  function scoreShift(a, b, dx, dy) {
    let inter = 0;
    let union = 0;

    const x0 = Math.max(0, -dx);
    const x1 = Math.min(SMALL, SMALL - dx);
    const y0 = Math.max(0, -dy);
    const y1 = Math.min(SMALL, SMALL - dy);

    for (let y=y0; y<y1; y++) {
      const by = y + dy;
      let i1 = y * SMALL + x0;
      let i2 = by * SMALL + (x0 + dx);

      for (let x=x0; x<x1; x++, i1++, i2++) {
        const va = a[i1];
        const vb = b[i2];
        if (va || vb) {
          union++;
          if (va && vb) inter++;
        }
      }
    }

    return union ? inter / union : 0;
  }

  function estimatePair(prevField, currField) {
    // +/- 12 px sul campo 128x128 = +/- 48 px sull'immagine 512.
    const MAX = 12;
    let best = { dx:0, dy:0, score:-1 };

    for (let dy=-MAX; dy<=MAX; dy++) {
      for (let dx=-MAX; dx<=MAX; dx++) {
        const s = scoreShift(prevField, currField, dx, dy);

        // Piccolissima penalità per evitare shift enormi a parità di score.
        const adjusted = s - 0.00015 * (Math.abs(dx) + Math.abs(dy));
        if (adjusted > best.score) {
          best = { dx, dy, score:adjusted, rawScore:s };
        }
      }
    }

    return best;
  }

  function median(values) {
    const a = values.slice().sort((x,y)=>x-y);
    const m = Math.floor(a.length/2);
    return a.length % 2 ? a[m] : (a[m-1]+a[m])/2;
  }

  function bearingName(deg) {
    const names = ["N","NE","E","SE","S","SO","O","NO"];
    return names[Math.round(deg / 45) % 8];
  }

  function motionStats(dxPx10, dyPx10, confidence) {
    const mpp = 156543.03392 * Math.cos(C[0]*Math.PI/180) / (2 ** ANALYSIS_Z);
    const east = dxPx10 * mpp;
    const north = -dyPx10 * mpp;
    const distM10 = Math.hypot(east, north);
    const speedKmh = distM10 * 6 / 1000;

    let bearing = (Math.atan2(east, north) * 180/Math.PI + 360) % 360;
    if (distM10 < 100) bearing = 0;

    return {
      speedKmh,
      bearing,
      bearingName: distM10 < 100 ? "quasi fermo" : bearingName(bearing),
      confidence
    };
  }

  async function analyseMotion() {
    setMotionUI("analisi in corso…");

    const recent = past.slice(-(PAIRS_TO_USE + 1));
    if (recent.length < 2) throw new Error("pochi frame RainViewer");

    const loaded = [];
    try {
      for (const f of recent) {
        const item = await fetchImageBitmap(coordImageUrl(f));
        const field = makeField(item.img);
        loaded.push({ ...item, field, frame:f });
      }

      const shifts = [];
      for (let i=1; i<loaded.length; i++) {
        const a = loaded[i-1];
        const b = loaded[i];

        if (a.field.active < 20 || b.field.active < 20) continue;

        const est = estimatePair(a.field.f, b.field.f);

        const dtMin = Math.max(
          1,
          (b.frame.time - a.frame.time) / 60
        );

        // estimatePair lavora a 128 px. Riporta a 512 px e normalizza a 10 minuti.
        const scale = IMG_SIZE / SMALL;
        const norm = FUTURE_STEP_MIN / dtMin;

        shifts.push({
          dx: est.dx * scale * norm,
          dy: est.dy * scale * norm,
          score: est.rawScore
        });
      }

      if (!shifts.length) {
        throw new Error("echi insufficienti nell'area analizzata");
      }

      const dx = median(shifts.map(s=>s.dx));
      const dy = median(shifts.map(s=>s.dy));
      const conf = shifts.reduce((s,x)=>s+x.score,0) / shifts.length;

      // Usa l'ultima immagine già scaricata come sorgente per il FUTURO.
      const last = loaded[loaded.length-1];
      latestForecastImageURL = last.objectURL;
      latestForecastImageObjectURL = last.objectURL;

      // Non revocare l'ultimo object URL; serve al layer forecast.
      for (let i=0; i<loaded.length-1; i++) {
        URL.revokeObjectURL(loaded[i].objectURL);
      }

      const stats = motionStats(dx, dy, conf);

      motion = {
        dxPx10: dx,
        dyPx10: dy,
        confidence: conf,
        ...stats
      };

      const confLabel =
        conf >= .55 ? "alta" :
        conf >= .32 ? "media" :
        "bassa";

      setMotionUI(
        "pronta",
        `${stats.bearingName} · ${Math.round(stats.bearing)}°`,
        `${Math.round(stats.speedKmh)} km/h`,
        confLabel,
        `Stima ottenuta da ${shifts.length+1} frame recenti. Nel FUTURO spostiamo l'ultimo eco radar mantenendone forma e intensità: eventuale sviluppo o dissolvimento delle celle non è prevedibile da questa prova.`
      );

      return motion;
    } catch (e) {
      for (const x of loaded) {
        try { URL.revokeObjectURL(x.objectURL); } catch (_) {}
      }
      throw e;
    }
  }

  function worldSize(z) {
    return 256 * (2 ** z);
  }

  function project(lat, lon, z) {
    const w = worldSize(z);
    const x = (lon + 180) / 360 * w;
    const sin = Math.sin(lat * Math.PI/180);
    const y = (0.5 - Math.log((1+sin)/(1-sin)) / (4*Math.PI)) * w;
    return [x,y];
  }

  function unproject(x, y, z) {
    const w = worldSize(z);
    const lon = x / w * 360 - 180;
    const n = Math.PI - 2*Math.PI*y/w;
    const lat = 180/Math.PI * Math.atan(Math.sinh(n));
    return [lat,lon];
  }

  function imageBounds(shiftX=0, shiftY=0) {
    const [cx,cy] = project(C[0], C[1], ANALYSIS_Z);
    const half = IMG_SIZE / 2;

    const nw = unproject(cx-half+shiftX, cy-half+shiftY, ANALYSIS_Z);
    const se = unproject(cx+half+shiftX, cy+half+shiftY, ANALYSIS_Z);

    return L.latLngBounds(nw, se);
  }

  function removeLayer() {
    if (!layer) return;
    try { map.removeLayer(layer); } catch (_) {}
    layer = null;
  }

  function showObserved(frame) {
    return new Promise(resolve => {
      const n = L.tileLayer(`${rvHost}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`, {
        maxZoom:18,
        maxNativeZoom:7,
        opacity:0,
        keepBuffer:1,
        updateWhenZooming:false,
        updateWhenIdle:true
      }).addTo(map);

      let loaded=0, done=false;

      const finish = ok => {
        if (done) return;
        done=true;

        if (ok) {
          removeLayer();
          layer=n;
          n.setOpacity(.72);
        } else {
          try { map.removeLayer(n); } catch (_) {}
        }
        resolve(ok);
      };

      n.on("tileload",()=>loaded++);
      n.once("load",()=>finish(loaded>0));
      setTimeout(()=>finish(loaded>0),6500);
    });
  }

  function showForecast(frame) {
    if (!motion || !latestForecastImageURL) return false;

    const shiftX = motion.dxPx10 * frame.step;
    const shiftY = motion.dyPx10 * frame.step;

    const n = L.imageOverlay(
      latestForecastImageURL,
      imageBounds(shiftX, shiftY),
      {
        opacity:.74,
        interactive:false
      }
    );

    removeLayer();
    layer=n;
    n.addTo(map);
    return true;
  }

  async function show(n) {
    const myToken = ++renderToken;

    idx = Math.max(0, Math.min(frames.length-1, n));
    $("timeline").value = idx;

    const f = frames[idx];

    if (f.kind === "forecast") {
      $("badge").textContent = "PREVISIONE";
      $("badge").className = "badge future";
      $("clock").textContent = fmt(f.t);
      $("source").textContent = `Nowcast Conte · +${f.step*FUTURE_STEP_MIN}m`;

      if (!motion) {
        status(
          "warn",
          "Nowcast non disponibile",
          "La stima del movimento non è riuscita. L'OSSERVATO RainViewer resta utilizzabile."
        );
        return false;
      }

      const ok = showForecast(f);

      status(
        ok ? "ok" : "warn",
        ok ? "Estrapolazione caricata" : "Estrapolazione non disponibile",
        ok
          ? `+${f.step*FUTURE_STEP_MIN} min · moto stimato ${motion.bearingName}, ${Math.round(motion.speedKmh)} km/h. Questo frame è proiettato dall'ultimo radar reale.`
          : "Impossibile visualizzare il frame futuro."
      );

      return ok;
    }

    $("badge").textContent = "OSSERVATO";
    $("badge").className = "badge";
    $("clock").textContent = fmt(f.t);
    $("source").textContent = "RainViewer · radar";

    status("", "Caricamento radar", `Frame radar ${fmt(f.t)}…`);
    const ok = await showObserved(f);

    if (myToken !== renderToken) return false;

    status(
      ok ? "ok" : "warn",
      ok ? "Radar reale caricato" : "Radar non disponibile",
      ok
        ? `Osservazione radar delle ${fmt(f.t)}.`
        : "Il frame RainViewer non ha risposto."
    );

    return ok;
  }

  function stop() {
    playing=false;
    $("play").textContent="▶ Play";
  }

  async function start() {
    if (playing) return;
    playing=true;
    $("play").textContent="⏸ Pausa";

    while (playing) {
      const next = idx >= frames.length-1 ? 0 : idx+1;
      await show(next);
      if (!playing) break;

      const delay = frames[idx] && frames[idx].kind==="forecast" ? 700 : 850;
      await new Promise(r=>setTimeout(r,delay));
    }
  }

  $("play").onclick=()=>playing?stop():start();
  $("prev").onclick=()=>{stop();show(idx-1)};
  $("next").onclick=()=>{stop();show(idx+1)};
  $("now").onclick=()=>{stop();show(nowIdx)};
  $("timeline").oninput=e=>{stop();show(+e.target.value)};

  try {
    status("", "Avvio", "Carico gli ultimi radar RainViewer…");

    const r = await fetch(RV_MANIFEST, { cache:"no-store" });
    if (!r.ok) throw new Error(`RainViewer HTTP ${r.status}`);

    const d = await r.json();
    rvHost = d.host || "https://tilecache.rainviewer.com";

    past = d.radar && Array.isArray(d.radar.past) ? d.radar.past : [];
    if (!past.length) throw new Error("nessun frame RainViewer");

    // Mantieni il formato usato dal resto dell'app.
    past = past.map(x => ({
      kind:"observed",
      t:x.time*1000,
      time:x.time,
      path:x.path
    }));

    frames = past.map(x=>({ ...x }));
    nowIdx = frames.length-1;

    const base = frames[nowIdx].t;
    for (let step=1; step<=FUTURE_STEPS; step++) {
      frames.push({
        kind:"forecast",
        step,
        t:base + step*FUTURE_STEP_MIN*60*1000
      });
    }

    $("timeline").max = frames.length-1;
    idx=nowIdx;
    $("timeline").value=idx;

    await show(idx);
    setTimeout(()=>map.invalidateSize(),200);

    // L'analisi avviene dopo che l'OSSERVATO è già visibile.
    try {
      status("", "Analisi movimento", "Confronto gli ultimi frame radar per costruire il nowcast…");
      await analyseMotion();
      status(
        "ok",
        "Nowcast Conte pronto",
        `Stima ${motion.bearingName} · ${Math.round(motion.speedKmh)} km/h. Premi ▶ oppure la freccia destra per vedere +10…+90 minuti.`
      );
    } catch (e) {
      console.error(e);
      motion=null;
      setMotionUI(
        "non disponibile",
        "--",
        "--",
        "--",
        `Analisi non riuscita: ${e.message || e}. Può dipendere da echi troppo deboli/assenti oppure dal blocco CORS delle immagini RainViewer.`
      );
      status(
        "warn",
        "OSSERVATO OK · nowcast non calcolato",
        `RainViewer funziona, ma l'analisi automatica non è riuscita: ${e.message || e}.`
      );
    }

  } catch (e) {
    console.error(e);
    status(
      "warn",
      "Errore inizializzazione",
      `Non riesco ad avviare Radar Evoluzione: ${e.message || e}.`
    );
  }

  window.addEventListener("beforeunload",()=>{
    if (latestForecastImageObjectURL) {
      try { URL.revokeObjectURL(latestForecastImageObjectURL); } catch (_) {}
    }
  });
});
