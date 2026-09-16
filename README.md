# Radar Evoluzione v4.5 — Nowcast Conte Motion Test

Versione sperimentale.

## Obiettivo
Provare una vera animazione futura senza API meteo commerciali:
gli ultimi frame RainViewer vengono confrontati nel browser e il movimento
medio degli echi viene estrapolato ogni 10 minuti fino a +90 minuti.

## Importante
Questa versione NON prevede la nascita, l'intensificazione o la dissoluzione
delle celle. Sposta in avanti l'ultimo eco radar reale con la velocità/direzione
misurata sugli ultimi frame.

## Cosa verificare
1. Apri l'app e aspetta qualche secondo.
2. Sotto la mappa deve comparire "Nowcast Conte pronto".
3. Guarda Direzione / Velocità / Affidabilità.
4. Premi una volta la freccia destra:
   +10 min, poi +20, +30 ... fino a +90.
5. Prova Play.
6. Mandami uno screenshot dell'OSSERVATO e uno a +30/+60 min.

## Se appare "analisi non riuscita"
Mandami lo screenshot del messaggio.
Le cause più probabili sono:
- pochi echi radar nell'area analizzata;
- immagini RainViewer non leggibili dal canvas per restrizioni CORS.

## Fonti
Radar data by RainViewer, uso personale/educativo.
