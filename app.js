
"use strict";

const CENTER = [44.45, 12.02]; // area Borgo Viazza / Ravenna
const ZOOM = 8;
const FRAME_MS = 15 * 60 * 1000;
const PAST_MS = 2 * 60 * 60 * 1000;
const FUTURE_MS = 3 * 60 * 60 * 1000;
const PLAY_MS = 900;

const els = {
  settingsBtn: document.getElementById("settingsBtn"),
  settings: document.getElementById("settings"),
  apiKey: document.getElementById("apiKey"),
  saveKey: document.getElementById("saveKey"),
  clearKey: document.getElementById("clearKey"),
  modeBadge: document.getElementById("modeBadge"),
  frameTime: document.getElementById("frameTime"),
  sourceLabel: document.getElementById("sourceLabel"),
  timeline: document.getElementById("timeline"),
  playBtn: document.getElementById("playBtn"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  nowBtn: document.getElementById("nowBtn"),
  statusDot: document.getElementById("statusDot"),
  statusTitle: document.getElementById("statusTitle"),
  statusText: document.getElementById("statusText")
};

const map = L.map("map", {
  center: CENTER,
  zoom: ZOOM,
  zoomControl: true,
  preferCanvas: true
});

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: "© OpenStreetMap"
}).addTo(map);

L.circleMarker(CENTER, {
  radius: 6,
  weight: 2,
  color: "#fff",
  fillColor: "#55c2ff",
  fillOpacity: 1
}).addTo(map).bindTooltip("Borgo Viazza", {
  permanent: true,
  direction: "top",
  offset: [0, -7],
  className: "borgo-label"
});

let rainviewer = { host: "", frames: [] };
let frames = [];
let index = 0;
let nowIndex = 0;
let weatherLayer = null;
let playTimer = null;
let requestSerial = 0;

function roundQuarter(ts) {
  return Math.floor(ts / FRAME_MS) * FRAME_MS;
}

function fmtLocal(ts) {
  return new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit", minute: "2-digit"
  }).format(new Date(ts));
}

function iso(ts) {
  return new Date(ts).toISOString().replace(".000Z", "Z");
}

function setStatus(kind, title, text) {
  els.statusDot.className = "dot" + (kind ? " " + kind : "");
  els.statusTitle.textContent = title;
  els.statusText.textContent = text;
}

function buildFrames() {
  const now = roundQuarter(Date.now());
  const start = now - PAST_MS;
  const end = now + FUTURE_MS;
  frames = [];
  for (let ts = start; ts <= end; ts += FRAME_MS) {
    frames.push({ ts, kind: ts <= now ? "observed" : "forecast" });
  }
  nowIndex = frames.findIndex(f => f.ts === now);
  index = Math.max(0, nowIndex);
  els.timeline.min = "0";
  els.timeline.max = String(frames.length - 1);
  els.timeline.value = String(index);
}

function nearestRainviewerFrame(targetTs) {
  if (!rainviewer.frames.length) return null;
  let best = rainviewer.frames[0];
  let bestDiff = Infinity;
  for (const f of rainviewer.frames) {
    const diff = Math.abs(f.time * 1000 - targetTs);
    if (diff < bestDiff) {
      best = f;
      bestDiff = diff;
    }
  }
  return bestDiff <= 20 * 60 * 1000 ? best : null;
}

async function loadRainviewerManifest() {
  const res = await fetch("https://api.rainviewer.com/public/weather-maps.json", { cache: "no-store" });
  if (!res.ok) throw new Error("RainViewer HTTP " + res.status);
  const data = await res.json();
  rainviewer.host = data.host || "https://tilecache.rainviewer.com";
  rainviewer.frames = Array.isArray(data?.radar?.past) ? data.radar.past : [];
}

function tomorrowTileUrl(ts) {
  const time = encodeURIComponent(iso(ts));
  const key = localStorage.getItem("meteoConteTomorrowKey") || "";
  const auth = key ? `?apikey=${encodeURIComponent(key)}` : "";
  return `https://api.tomorrow.io/v4/map/tile/{z}/{x}/{y}/precipitationIntensity/${time}.png${auth}`;
}

function rainviewerTileUrl(frame) {
  return `${rainviewer.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
}

function updateLabels(frame) {
  const forecast = frame.kind === "forecast";
  els.modeBadge.textContent = forecast ? "PREVISIONE" : "OSSERVATO";
  els.modeBadge.className = "badge " + (forecast ? "forecast" : "observed");
  els.frameTime.textContent = fmtLocal(frame.ts);
  els.sourceLabel.textContent = forecast ? "Tomorrow.io · precipitazione prevista" : "RainViewer · radar";
}

function replaceLayer(url, frame, serial) {
  return new Promise((resolve) => {
    const next = L.tileLayer(url, {
      maxZoom: 12,
      opacity: 0,
      tileSize: 256,
      updateWhenIdle: true,
      keepBuffer: 1,
      crossOrigin: true
    }).addTo(map);

    let settled = false;
    const done = (ok) => {
      if (settled || serial !== requestSerial) {
        try { map.removeLayer(next); } catch {}
        return;
      }
      settled = true;
      if (ok) {
        const previous = weatherLayer;
        weatherLayer = next;
        next.setOpacity(0.72);
        if (previous) setTimeout(() => {
          try { map.removeLayer(previous); } catch {}
        }, 180);
      } else {
        try { map.removeLayer(next); } catch {}
      }
      resolve(ok);
    };

    next.once("load", () => done(true));
    next.once("tileerror", () => {
      setTimeout(() => done(false), 300);
    });
    setTimeout(() => done(false), 7000);
  });
}

async function showFrame(i) {
  index = Math.max(0, Math.min(frames.length - 1, i));
  els.timeline.value = String(index);
  const frame = frames[index];
  updateLabels(frame);
  const serial = ++requestSerial;

  if (frame.kind === "observed") {
    const rv = nearestRainviewerFrame(frame.ts);
    if (!rv) {
      setStatus("warn", "Radar osservato non disponibile",
        "Il frame richiesto è fuori dalla finestra radar disponibile. Spostati verso Adesso.");
      return;
    }
    const ok = await replaceLayer(rainviewerTileUrl(rv), frame, serial);
    if (ok) {
      setStatus("ok", "Radar osservato caricato",
        `Frame radar reale vicino alle ${fmtLocal(rv.time * 1000)}. Trascina la timeline oppure premi Play.`);
    } else {
      setStatus("warn", "Problema caricamento radar",
        "Il layer RainViewer non ha risposto correttamente. Riprova tra qualche secondo.");
    }
    return;
  }

  setStatus("", "Caricamento previsione", `Richiesta frame futuro delle ${fmtLocal(frame.ts)}…`);
  const ok = await replaceLayer(tomorrowTileUrl(frame.ts), frame, serial);
  if (ok) {
    setStatus("ok", "Previsione caricata",
      `Frame previsionale delle ${fmtLocal(frame.ts)}. La parte a destra di ADESSO non è un'osservazione radar.`);
  } else {
    const hasKey = !!localStorage.getItem("meteoConteTomorrowKey");
    setStatus("warn", "Previsione futura non autorizzata",
      hasKey
        ? "La richiesta Tomorrow.io non è riuscita. Verifica chiave, limiti del piano o disponibilità del layer."
        : "Il test senza chiave non è stato autorizzato. Apri ⚙︎ e inserisci una API key Tomorrow.io per provare i frame futuri.");
  }
}

function stopPlay() {
  if (playTimer) clearInterval(playTimer);
  playTimer = null;
  els.playBtn.textContent = "▶ Play";
}

function startPlay() {
  stopPlay();
  els.playBtn.textContent = "⏸ Pausa";
  playTimer = setInterval(() => {
    let next = index + 1;
    if (next >= frames.length) next = 0;
    showFrame(next);
  }, PLAY_MS);
}

els.playBtn.addEventListener("click", () => playTimer ? stopPlay() : startPlay());
els.prevBtn.addEventListener("click", () => { stopPlay(); showFrame(index - 1); });
els.nextBtn.addEventListener("click", () => { stopPlay(); showFrame(index + 1); });
els.nowBtn.addEventListener("click", () => { stopPlay(); showFrame(nowIndex); });
els.timeline.addEventListener("input", e => { stopPlay(); showFrame(Number(e.target.value)); });

els.settingsBtn.addEventListener("click", () => {
  els.settings.hidden = !els.settings.hidden;
  if (!els.settings.hidden) els.apiKey.value = localStorage.getItem("meteoConteTomorrowKey") || "";
});
els.saveKey.addEventListener("click", () => {
  const key = els.apiKey.value.trim();
  if (key) localStorage.setItem("meteoConteTomorrowKey", key);
  else localStorage.removeItem("meteoConteTomorrowKey");
  setStatus("ok", "Impostazione salvata",
    key ? "API key memorizzata solo nel browser di questo dispositivo." : "Nessuna API key salvata.");
  if (frames[index]?.kind === "forecast") showFrame(index);
});
els.clearKey.addEventListener("click", () => {
  localStorage.removeItem("meteoConteTomorrowKey");
  els.apiKey.value = "";
  setStatus("", "Chiave cancellata", "Il prototipo tornerà a tentare la modalità di valutazione senza chiave.");
});

(async function init() {
  buildFrames();
  try {
    await loadRainviewerManifest();
    const firstUsable = frames
      .map((f, i) => ({f, i}))
      .reverse()
      .find(x => x.f.kind === "observed" && nearestRainviewerFrame(x.f.ts));
    if (firstUsable) {
      nowIndex = firstUsable.i;
      index = firstUsable.i;
    }
    await showFrame(index);
  } catch (err) {
    console.error(err);
    setStatus("warn", "Impossibile inizializzare il radar",
      "Controlla la connessione Internet e ricarica la pagina.");
  }
})();
