"use strict";

document.addEventListener("DOMContentLoaded", async () => {
  const C = [44.45, 12.02];
  const HOUR = 60 * 60 * 1000;
  const FUTURE_HOURS = 3;
  const WEATHER_Z_CANDIDATES = [6, 5, 4, 7, 8];
  const $ = id => document.getElementById(id);

  const map = L.map("map", { zoomControl: true }).setView([44.45, 11.85], 8);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "© OpenStreetMap"
  }).addTo(map);

  L.circleMarker(C, {
    radius: 6, weight: 2, color: "#fff", fillColor: "#58c7ff", fillOpacity: 1
  }).addTo(map).bindTooltip("Borgo Viazza", {
    permanent: true, direction: "top", offset: [0, -7], className: "borgo"
  });

  let rvHost = "";
  let frames = [];
  let idx = 0;
  let nowIdx = 0;
  let layer = null;
  let playing = false;
  let renderToken = 0;
  const weatherZoomCache = new Map();

  const fmt = t => new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit", minute: "2-digit"
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

  function utcHour(t) {
    return String(new Date(t).getUTCHours()).padStart(2, "0") + " UTC";
  }

  function weatherApiURL(t) {
    return `https://weathermaps.weatherapi.com/precip/tiles/${weatherStamp(t)}/{z}/{x}/{y}.png`;
  }

  function tileXY(lat, lon, z) {
    const n = 2 ** z;
    const x = Math.floor((lon + 180) / 360 * n);
    const r = lat * Math.PI / 180;
    const y = Math.floor((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2 * n);
    return [x, y];
  }

  function probeImage(url, timeoutMs = 4500) {
    return new Promise(resolve => {
      const img = new Image();
      let done = false;
      const finish = ok => {
        if (done) return;
        done = true;
        img.onload = img.onerror = null;
        resolve(ok);
      };
      img.onload = () => finish(true);
      img.onerror = () => finish(false);
      img.referrerPolicy = "no-referrer";
      img.src = url + (url.includes("?") ? "&" : "?") + "mc=" + Date.now();
      setTimeout(() => finish(false), timeoutMs);
    });
  }

  async function findWeatherNativeZoom(t) {
    const stamp = weatherStamp(t);
    if (weatherZoomCache.has(stamp)) return weatherZoomCache.get(stamp);

    for (const z of WEATHER_Z_CANDIDATES) {
      const [x, y] = tileXY(C[0], C[1], z);
      const url = `https://weathermaps.weatherapi.com/precip/tiles/${stamp}/${z}/${x}/${y}.png`;
      if (await probeImage(url)) {
        weatherZoomCache.set(stamp, z);
        return z;
      }
    }
    weatherZoomCache.set(stamp, null);
    return null;
  }

  function replace(url, opacity = .72, maxNativeZoom = 7) {
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
            setTimeout(() => { try { map.removeLayer(old); } catch (_) {} }, 140);
          }
        } else {
          try { map.removeLayer(n); } catch (_) {}
        }
        resolve({ ok, loaded, errors });
      };

      n.on("tileload", () => loaded++);
      n.on("tileerror", () => errors++);
      n.once("load", () => finish(loaded > 0));
      setTimeout(() => finish(loaded > 0), 7000);
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
    $("source").textContent = future ? `WeatherAPI · step ${f.h}` : "RainViewer · radar";

    if (future) {
      const stamp = weatherStamp(f.t);
      status("", "Verifica frame WeatherAPI", `Cerco il frame ${fmt(f.t)} (${utcHour(f.t)}) · ${stamp}…`);

      const nativeZoom = await findWeatherNativeZoom(f.t);
      if (myToken !== renderToken) return false;

      if (nativeZoom == null) {
        status(
          "warn",
          "Frame WeatherAPI non pubblicato",
          `Il server non restituisce la tile su Borgo Viazza per ${fmt(f.t)} (${utcHour(f.t)}), stamp ${stamp}. Il radar visibile resta l'ultimo OSSERVATO.`
        );
        return false;
      }

      status("", "Frame WeatherAPI trovato", `Tile centrale valida a zoom nativo ${nativeZoom}. Carico la previsione delle ${fmt(f.t)}…`);
      const result = await replace(weatherApiURL(f.t), .68, nativeZoom);
      if (myToken !== renderToken) return false;

      const ok = result.ok;
      status(
        ok ? "ok" : "warn",
        ok ? "Previsione WeatherAPI caricata" : "Layer WeatherAPI incompleto",
        ok
          ? `Frame ${fmt(f.t)} (${utcHour(f.t)}) · zoom nativo ${nativeZoom} · ${result.loaded} tile caricate.`
          : `Tile centrale disponibile, ma il layer non si è completato (${result.loaded} caricate, ${result.errors} errori).`
      );
      return ok;
    }

    status("", "Caricamento radar", `Frame radar ${fmt(f.t)}…`);
    const result = await replace(`${rvHost}${f.path}/256/{z}/{x}/{y}/2/1_1.png`, .72, 7);
    if (myToken !== renderToken) return false;
    status(
      result.ok ? "ok" : "warn",
      result.ok ? "Radar reale caricato" : "Radar non disponibile",
      result.ok ? `Osservazione radar delle ${fmt(f.t)}.` : "Il frame RainViewer non ha risposto."
    );
    return result.ok;
  }

  function stop() {
    playing = false;
    $("play").textContent = "▶ Play";
  }

  async function start() {
    if (playing) return;
    playing = true;
    $("play").textContent = "⏸ Pausa";
    while (playing) {
      const next = idx >= frames.length - 1 ? 0 : idx + 1;
      await show(next);
      if (!playing) break;
      await new Promise(r => setTimeout(r, 1100));
    }
  }

  $("play").onclick = () => { if (playing) stop(); else start(); };
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
      frames.push({ kind: "forecast", t: firstForecastHour + (h - 1) * HOUR, h });
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
