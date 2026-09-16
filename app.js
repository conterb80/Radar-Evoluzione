"use strict";

document.addEventListener("DOMContentLoaded", async () => {
  const C = [44.45, 12.02];

  const RV_MANIFEST = "https://api.rainviewer.com/public/weather-maps.json";
  const ARPAE_PORTAL = "https://allertameteo.regione.emilia-romagna.it/o/api/allerta/get-nowcasting";
  const ARPAE_UPSTREAM = "https://apps.arpae.it/REST/meteo_radar_nowcasting?sort=-data_validita&max_results=1";

  // Bounding box usato dal portale Allerta Meteo ER per il layer nowcasting:
  // west, south, east, north
  const ARPAE_BOUNDS = [5.00129, 40.999, 17.0188, 48.216];

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
  let dataLayer = null;
  let playing = false;
  let renderToken = 0;
  let arpae = null;
  let arpaeLoadReport = "";

  const fmt = t => new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(t));

  const fmtDateTime = t => new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(t));

  function status(kind, title, text) {
    $("led").className = "led " + kind;
    $("statusTitle").textContent = title;
    $("status").textContent = text;
  }

  function normalizeBase64(v) {
    if (!v || typeof v !== "string") return null;
    const s = v.trim();
    if (!s) return null;
    return s.startsWith("data:image") ? s : "data:image/png;base64," + s;
  }

  function leafletBounds(raw) {
    const b = Array.isArray(raw) && raw.length === 4 ? raw : ARPAE_BOUNDS;
    return L.latLngBounds(
      [Number(b[1]), Number(b[0])],
      [Number(b[3]), Number(b[2])]
    );
  }

  async function fetchJson(url, timeoutMs = 9000) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);

    try {
      const r = await fetch(url, {
        cache: "no-store",
        mode: "cors",
        signal: ac.signal,
        headers: { "Accept": "application/json" }
      });

      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function parsePortalNowcast(d) {
    if (!d || !d.images || typeof d.images !== "object") {
      throw new Error("JSON portale senza campo images");
    }

    const entries = Object.entries(d.images);
    if (!entries.length) throw new Error("Nessuna immagine ARPAE nel portale");

    entries.sort((a, b) => Number(a[0]) - Number(b[0]));
    const [key, raw] = entries[entries.length - 1];

    const url = normalizeBase64(raw);
    if (!url) throw new Error("Immagine ARPAE vuota");

    const n = Number(key);
    const validTime = Number.isFinite(n) && n > 1_000_000_000
      ? n * 1000
      : Date.now();

    return {
      url,
      bounds: d.bounds || ARPAE_BOUNDS,
      validTime,
      provider: "Portale Allerta Meteo ER"
    };
  }

  function parseUpstreamNowcast(d) {
    const item = d && Array.isArray(d._items) ? d._items[0] : null;
    const raw = item && item.mappa ? item.mappa.image_data : null;
    const url = normalizeBase64(raw);

    if (!url) throw new Error("REST ARPAE senza mappa.image_data");

    let validTime = Date.now();
    if (item.data_validita) {
      const parsed = Date.parse(item.data_validita);
      if (Number.isFinite(parsed)) validTime = parsed;
    }

    return {
      url,
      bounds: ARPAE_BOUNDS,
      validTime,
      provider: "REST ARPAE"
    };
  }

  async function loadArpaeNowcast() {
    const errors = [];

    try {
      const d = await fetchJson(ARPAE_PORTAL);
      const result = parsePortalNowcast(d);
      arpaeLoadReport = "Accesso diretto al Portale Allerta Meteo ER riuscito.";
      return result;
    } catch (e) {
      errors.push(`Portale: ${e.message || e}`);
    }

    try {
      const d = await fetchJson(ARPAE_UPSTREAM);
      const result = parseUpstreamNowcast(d);
      arpaeLoadReport = "Portale diretto non accessibile; REST ARPAE riuscito.";
      return result;
    } catch (e) {
      errors.push(`REST ARPAE: ${e.message || e}`);
    }

    arpaeLoadReport = errors.join(" · ");
    return null;
  }

  function removeDataLayer() {
    if (!dataLayer) return;
    try { map.removeLayer(dataLayer); } catch (_) {}
    dataLayer = null;
  }

  function showRainViewer(f) {
    return new Promise(resolve => {
      const n = L.tileLayer(`${rvHost}${f.path}/256/{z}/{x}/{y}/2/1_1.png`, {
        maxZoom: 18,
        maxNativeZoom: 7,
        opacity: 0,
        keepBuffer: 1,
        updateWhenZooming: false,
        updateWhenIdle: true
      }).addTo(map);

      let loaded = 0;
      let done = false;

      const finish = ok => {
        if (done) return;
        done = true;

        if (ok) {
          removeDataLayer();
          dataLayer = n;
          n.setOpacity(.72);
        } else {
          try { map.removeLayer(n); } catch (_) {}
        }

        resolve(ok);
      };

      n.on("tileload", () => loaded++);
      n.once("load", () => finish(loaded > 0));
      setTimeout(() => finish(loaded > 0), 6500);
    });
  }

  function showArpaeNowcast() {
    if (!arpae) return false;

    const bounds = leafletBounds(arpae.bounds);
    const n = L.imageOverlay(arpae.url, bounds, {
      opacity: .78,
      interactive: false
    });

    removeDataLayer();
    dataLayer = n;
    n.addTo(map);
    return true;
  }

  async function show(n) {
    const myToken = ++renderToken;

    idx = Math.max(0, Math.min(frames.length - 1, n));
    $("timeline").value = idx;

    const f = frames[idx];

    if (f.kind === "nowcast") {
      $("badge").textContent = "NOWCAST";
      $("badge").className = "badge future";
      $("clock").textContent = arpae ? fmt(arpae.validTime) : "--:--";
      $("source").textContent = "ARPAE · +1/+2/+3h";

      if (!arpae) {
        status(
          "warn",
          "Nowcast ARPAE non accessibile",
          `${arpaeLoadReport || "Nessun dato disponibile."} Il radar osservato resta comunque utilizzabile.`
        );
        return false;
      }

      status(
        "",
        "Carico nowcast ARPAE",
        `Mappa valida ${fmtDateTime(arpae.validTime)} · ${arpae.provider}…`
      );

      const ok = showArpaeNowcast();
      if (myToken !== renderToken) return false;

      status(
        ok ? "ok" : "warn",
        ok ? "Nowcast ARPAE caricato" : "Nowcast ARPAE non visualizzato",
        ok
          ? `Dato ufficiale ${fmtDateTime(arpae.validTime)}. Giallo +1h · arancione +2h · rosso +3h. ${arpaeLoadReport}`
          : "Il dato è stato letto ma il layer non è stato disegnato."
      );
      return ok;
    }

    $("badge").textContent = "OSSERVATO";
    $("badge").className = "badge";
    $("clock").textContent = fmt(f.t);
    $("source").textContent = "RainViewer · radar";

    status("", "Caricamento radar", `Frame radar ${fmt(f.t)}…`);
    const ok = await showRainViewer(f);

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

      // Pausa un po' più lunga sul frame NOWCAST per poterlo leggere.
      const delay = frames[idx] && frames[idx].kind === "nowcast" ? 2200 : 950;
      await new Promise(r => setTimeout(r, delay));
    }
  }

  $("play").onclick = () => playing ? stop() : start();
  $("prev").onclick = () => { stop(); show(idx - 1); };
  $("next").onclick = () => { stop(); show(idx + 1); };
  $("now").onclick = () => { stop(); show(nowIdx); };
  $("timeline").oninput = e => { stop(); show(+e.target.value); };

  try {
    status("", "Avvio", "Carico RainViewer e verifico il nowcast ARPAE…");

    const [rvResult, arpaeResult] = await Promise.allSettled([
      fetch(RV_MANIFEST, { cache: "no-store" }).then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      loadArpaeNowcast()
    ]);

    if (rvResult.status !== "fulfilled") {
      throw rvResult.reason || new Error("RainViewer non disponibile");
    }

    const d = rvResult.value;
    rvHost = d.host || "https://tilecache.rainviewer.com";

    const past = d.radar && Array.isArray(d.radar.past) ? d.radar.past : [];
    frames = past.map(x => ({
      kind: "observed",
      t: x.time * 1000,
      path: x.path
    }));

    if (!frames.length) throw new Error("Nessun frame RainViewer");

    nowIdx = frames.length - 1;

    arpae = arpaeResult.status === "fulfilled" ? arpaeResult.value : null;

    // Un solo frame futuro: la mappa ARPAE contiene contemporaneamente
    // le traiettorie +1h, +2h e +3h.
    frames.push({
      kind: "nowcast",
      t: arpae ? arpae.validTime : Date.now()
    });

    $("timeline").max = frames.length - 1;
    idx = nowIdx;
    $("timeline").value = idx;

    await show(idx);
    setTimeout(() => map.invalidateSize(), 200);

    if (!arpae) {
      status(
        "warn",
        "Radar osservato OK · ARPAE da verificare",
        `RainViewer funziona. Il browser non è riuscito a leggere ARPAE: ${arpaeLoadReport || "errore sconosciuto"}. Premi ▶ una volta per verificare anche il frame NOWCAST.`
      );
    }
  } catch (e) {
    console.error(e);
    status(
      "warn",
      "Errore inizializzazione",
      `Non riesco a inizializzare il test. ${e && e.message ? e.message : e}`
    );
  }
});
