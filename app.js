"use strict";

document.addEventListener("DOMContentLoaded", async () => {
  const C = [44.45, 12.02];
  const HOUR = 60 * 60 * 1000;
  const FUTURE_HOURS = 3;
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
    offset: [0, -7],
    className: "borgo"
  });

  let rvHost = "";
  let frames = [];
  let idx = 0;
  let nowIdx = 0;
  let layer = null;
  let timer = null;
  let renderToken = 0;

  const fmt = t => new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(t));

  function status(kind, title, text) {
    $("led").className = "led " + kind;
    $("statusTitle").textContent = title;
    $("status").textContent = text;
  }

  function weatherStamp(t) {
    const d = new Date(t);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const h = String(d.getUTCHours()).padStart(2, "0");
    return `${y}${m}${day}${h}`;
  }

  function weatherApiURL(t) {
    return `https://weathermaps.weatherapi.com/precip/tiles/${weatherStamp(t)}/{z}/{x}/{y}.png`;
  }

  function replace(url, opacity = .72, maxNativeZoom = 8) {
    return new Promise(resolve => {
      let loaded = 0;
      let errors = 0;
      let done = false;
      const n = L.tileLayer(url, {
        maxZoom: 18,
        maxNativeZoom,
        opacity: 0,
        keepBuffer: 1,
        updateWhenZooming: false,
        updateWhenIdle: true
      }).addTo(map);

      const finish = ok => {
        if (done) return;
        done = true;
        if (ok) {
          const old = layer;
          layer = n;
          n.setOpacity(opacity);
          if (old && old !== n) {
            setTimeout(() => {
              try { map.removeLayer(old); } catch (_) {}
            }, 140);
          }
        } else {
          try { map.removeLayer(n); } catch (_) {}
        }
        resolve({ ok, loaded, errors });
      };

      n.on("tileload", () => loaded++);
      n.on("tileerror", () => errors++);
      n.once("load", () => finish(loaded > 0));
      setTimeout(() => finish(loaded > 0), 8000);
    });
  }

  async function show(n) {
    const myToken = ++renderToken;
    idx = Math.max(0, Math.min(frames.length - 1, n));
    $("timeline").value = idx;

    const f = frames[idx];
    const future = f.kind === "forecast";
    $("badge").textContent = future ? "PREVISIONE" : "OSSERVATO";
    $("badge").className = "badge" + (future ? " future" : "");
    $("clock").textContent = fmt(f.t);
    $("source").textContent = future ? `WeatherAPI · +${f.h}h` : "RainViewer · radar";

    if (future) {
      status("", "Caricamento previsione", `Mappa precipitazioni prevista per le ${fmt(f.t)}…`);
      const result = await replace(weatherApiURL(f.t), .68, 8);
      if (myToken !== renderToken) return;
      status(
        result.ok ? "ok" : "warn",
        result.ok ? "Previsione caricata" : "Frame WeatherAPI non disponibile",
        result.ok
          ? `Frame previsionale +${f.h}h delle ${fmt(f.t)} · WeatherAPI Maps.`
          : `Nessuna tile caricata per le ${fmt(f.t)}. Riprova o passa al frame successivo.`
      );
    } else {
      status("", "Caricamento radar", `Frame radar ${fmt(f.t)}…`);
      const result = await replace(`${rvHost}${f.path}/256/{z}/{x}/{y}/2/1_1.png`, .72, 7);
      if (myToken !== renderToken) return;
      status(
        result.ok ? "ok" : "warn",
        result.ok ? "Radar reale caricato" : "Radar non disponibile",
        result.ok ? `Osservazione radar delle ${fmt(f.t)}.` : "Il frame RainViewer non ha risposto."
      );
    }
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    $("play").textContent = "▶ Play";
  }

  function start() {
    stop();
    $("play").textContent = "⏸ Pausa";
    timer = setInterval(() => show(idx >= frames.length - 1 ? 0 : idx + 1), 1500);
  }

  $("play").onclick = () => timer ? stop() : start();
  $("prev").onclick = () => { stop(); show(idx - 1); };
  $("next").onclick = () => { stop(); show(idx + 1); };
  $("now").onclick = () => { stop(); show(nowIdx); };
  $("timeline").oninput = e => { stop(); show(+e.target.value); };

  try {
    const r = await fetch("https://api.rainviewer.com/public/weather-maps.json", { cache: "no-store" });
    if (!r.ok) throw Error(r.status);
    const d = await r.json();
    rvHost = d.host || "https://tilecache.rainviewer.com";

    const past = (d.radar && Array.isArray(d.radar.past)) ? d.radar.past : [];
    frames = past.map(x => ({ kind: "observed", t: x.time * 1000, path: x.path }));
    if (!frames.length) throw Error("no frames");

    nowIdx = frames.length - 1;
    const base = frames[nowIdx].t;
    const firstForecastHour = Math.floor(base / HOUR) * HOUR + HOUR;
    for (let h = 1; h <= FUTURE_HOURS; h++) {
      frames.push({
        kind: "forecast",
        t: firstForecastHour + (h - 1) * HOUR,
        h
      });
    }

    $("timeline").max = frames.length - 1;
    idx = nowIdx;
    $("timeline").value = idx;
    await show(idx);
    setTimeout(() => map.invalidateSize(), 200);
  } catch (e) {
    console.error(e);
    status("warn", "Errore inizializzazione", "Non riesco a caricare il manifest radar RainViewer. Riprova più tardi.");
  }
});
