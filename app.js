"use strict";

document.addEventListener("DOMContentLoaded", async () => {
  const C = [44.45, 12.02];
  const RV_MANIFEST = "https://api.rainviewer.com/public/weather-maps.json";

  // Windy Embed ufficiale, layer previsione precipitazioni.
  const WINDY_URL =
    "https://embed.windy.com/embed2.html" +
    "?lat=44.45&lon=12.02&zoom=8&level=surface" +
    "&overlay=rain&menu=&message=true&marker=true&calendar=now&pressure=" +
    "&type=map&location=coordinates&detail=" +
    "&detailLat=44.45&detailLon=12.02" +
    "&metricWind=km%2Fh&metricTemp=%C2%B0C&radarRange=-1";

  const $ = id => document.getElementById(id);

  const map = L.map("map", { zoomControl:true }).setView([44.45, 11.85], 8);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom:18,
    attribution:"© OpenStreetMap"
  }).addTo(map);

  L.circleMarker(C, {
    radius:6, weight:2, color:"#fff",
    fillColor:"#58c7ff", fillOpacity:1
  }).addTo(map).bindTooltip("Borgo Viazza", {
    permanent:true,
    direction:"top",
    offset:[0,-7],
    className:"borgo"
  });

  let host = "";
  let frames = [];
  let idx = 0;
  let nowIdx = 0;
  let layer = null;
  let playing = false;
  let renderToken = 0;
  let windyLoaded = false;

  const fmt = t => new Intl.DateTimeFormat("it-IT", {
    hour:"2-digit", minute:"2-digit"
  }).format(new Date(t));

  function status(kind, title, text) {
    $("led").className = "led " + kind;
    $("statusTitle").textContent = title;
    $("status").textContent = text;
  }

  function removeRadarLayer() {
    if (!layer) return;
    try { map.removeLayer(layer); } catch (_) {}
    layer = null;
  }

  function showFrame(n) {
    const myToken = ++renderToken;
    idx = Math.max(0, Math.min(frames.length - 1, n));
    $("timeline").value = idx;

    const f = frames[idx];
    $("clock").textContent = fmt(f.t);
    $("source").textContent = "RainViewer · radar";
    status("", "Caricamento radar", `Frame osservato ${fmt(f.t)}…`);

    return new Promise(resolve => {
      let loaded = 0;
      let done = false;

      const nextLayer = L.tileLayer(
        `${host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`,
        {
          maxZoom:18,
          maxNativeZoom:7,
          opacity:0,
          keepBuffer:2,
          updateWhenZooming:false,
          updateWhenIdle:true
        }
      ).addTo(map);

      const finish = ok => {
        if (done) return;
        done = true;

        if (myToken !== renderToken) {
          try { map.removeLayer(nextLayer); } catch (_) {}
          resolve(false);
          return;
        }

        if (ok) {
          const old = layer;
          layer = nextLayer;
          nextLayer.setOpacity(.72);
          if (old && old !== nextLayer) {
            setTimeout(() => {
              try { map.removeLayer(old); } catch (_) {}
            }, 120);
          }

          status(
            "ok",
            idx === nowIdx ? "Radar reale · ADESSO" : "Radar reale caricato",
            `Osservazione radar delle ${fmt(f.t)}.`
          );
        } else {
          try { map.removeLayer(nextLayer); } catch (_) {}
          status("warn", "Frame non disponibile", `RainViewer non ha caricato il frame ${fmt(f.t)}.`);
        }

        resolve(ok);
      };

      nextLayer.on("tileload", () => loaded++);
      nextLayer.once("load", () => finish(loaded > 0));
      setTimeout(() => finish(loaded > 0), 6500);
    });
  }

  function stop() {
    playing = false;
    $("play").textContent = "▶ Play";
  }

  async function start() {
    if (playing || !frames.length) return;
    playing = true;
    $("play").textContent = "⏸ Pausa";

    while (playing) {
      const next = idx >= frames.length - 1 ? 0 : idx + 1;
      await showFrame(next);
      if (!playing) break;
      await new Promise(r => setTimeout(r, 850));
    }
  }

  function loadWindy(force=false) {
    const iframe = $("windyFrame");
    if (windyLoaded && !force) return;

    if (force) {
      iframe.src = "about:blank";
      setTimeout(() => { iframe.src = WINDY_URL; }, 60);
    } else {
      iframe.src = WINDY_URL;
    }
    windyLoaded = true;
  }

  function selectTab(which) {
    const observed = which === "observed";

    $("tabObserved").classList.toggle("active", observed);
    $("tabEvolution").classList.toggle("active", !observed);
    $("observedPanel").hidden = !observed;
    $("evolutionPanel").hidden = observed;

    if (observed) {
      setTimeout(() => map.invalidateSize(), 100);
    } else {
      stop();
      loadWindy();
    }
  }

  $("play").onclick = () => playing ? stop() : start();
  $("prev").onclick = () => { stop(); showFrame(idx - 1); };
  $("next").onclick = () => { stop(); showFrame(idx + 1); };
  $("now").onclick = () => { stop(); showFrame(nowIdx); };
  $("timeline").oninput = e => { stop(); showFrame(+e.target.value); };

  $("tabObserved").onclick = () => selectTab("observed");
  $("tabEvolution").onclick = () => selectTab("evolution");
  $("reloadWindy").onclick = () => loadWindy(true);

  try {
    const r = await fetch(RV_MANIFEST, { cache:"no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    const d = await r.json();
    host = d.host || "https://tilecache.rainviewer.com";

    const past = d.radar && Array.isArray(d.radar.past) ? d.radar.past : [];
    if (!past.length) throw new Error("nessun frame RainViewer");

    frames = past.map(x => ({
      t:x.time * 1000,
      path:x.path
    }));

    nowIdx = frames.length - 1;
    idx = nowIdx;

    $("timeline").max = frames.length - 1;
    $("timeline").value = idx;

    await showFrame(idx);
    setTimeout(() => map.invalidateSize(), 200);

  } catch (e) {
    console.error(e);
    status(
      "warn",
      "Radar osservato non disponibile",
      `Non riesco a caricare RainViewer: ${e.message || e}. La sezione EVOLUZIONE Windy resta comunque utilizzabile.`
    );
  }
});
