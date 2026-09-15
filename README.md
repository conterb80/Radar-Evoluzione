# Radar Evoluzione v4.1 – Radar Fix

Correzione mirata del solo radar osservato RainViewer.

RainViewer Weather Maps API accetta tile radar fino allo zoom nativo 7.
Leaflet ora usa `maxNativeZoom: 7`: oltre quel livello ingrandisce correttamente
le tile disponibili invece di chiedere a RainViewer zoom non supportati.

Nessuna modifica al motore futuro Tomorrow.io.
Non inserire ancora la chiave: prima validare PASSATO → ADESSO.
