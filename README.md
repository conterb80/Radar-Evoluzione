# Meteo Conte – Prototipo Evoluzione Animata

Questo pacchetto NON modifica Meteo Conte RC34.5.
È un prototipo isolato per testare una timeline unica:

- passato: radar osservato RainViewer;
- presente: punto ADESSO;
- futuro: precipitationIntensity Tomorrow.io;
- intervallo: 15 minuti;
- finestra: -2 ore / +3 ore;
- Play/Pausa, avanti/indietro, cursore temporale;
- centratura operativa sulla zona Ravenna / Borgo Viazza.

## Come provarlo
Carica i file su una cartella GitHub Pages / hosting HTTPS e apri index.html.

Il prototipo prova l'accesso Tomorrow.io senza chiave, che la documentazione
indica come disponibile per valutazione di base. Se il browser/API non lo autorizza,
apri l'ingranaggio e inserisci una API key Tomorrow.io.

La chiave, se inserita, viene salvata soltanto nel localStorage del browser.
Per un'eventuale versione definitiva NON è consigliato esporre una chiave privata
in una PWA pubblica: il prototipo serve solo per verificare resa e fluidità.

## Cosa testare
1. Animazione del radar osservato.
2. Passaggio grafico attraverso ADESSO.
3. Caricamento dei frame futuri.
4. Fluidità su Android.
5. Utilità reale della scala -2h / +3h.
