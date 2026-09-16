# Radar Evoluzione v4.4 — ARPAE Nowcast Test

Versione di prova, non definitiva.

## Obiettivo
Verificare se il nowcasting ufficiale ARPAE Emilia-Romagna può sostituire
le sorgenti commerciali nella parte FUTURO di Radar Evoluzione.

## Come funziona
- OSSERVATO: RainViewer, come nelle versioni precedenti.
- NOWCAST: mappa ufficiale ARPAE con traiettorie degli echi:
  - giallo = +1h
  - arancione = +2h
  - rosso = +3h

ARPAE non fornisce qui tre frame radar separati: la mappa contiene in un solo
layer l'evoluzione prevista degli echi.

## Test da fare
1. Aprire l'app e verificare che RainViewer carichi.
2. Premere una volta la freccia destra da ADESSO.
3. Controllare il messaggio diagnostico sotto la mappa.
4. Se compare "Nowcast ARPAE caricato", fare uno screenshot.
5. Se compare un errore CORS/rete, fare uno screenshot del messaggio.

## Nota tecnica
Il test prova prima il servizio del Portale Allerta Meteo Emilia-Romagna e,
se non accessibile dal browser, prova direttamente il REST ARPAE.
