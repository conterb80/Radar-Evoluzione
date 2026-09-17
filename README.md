# Radar Evoluzione v5.0 — Final Candidate

Questa versione elimina tutti i tentativi di calcolare internamente il FUTURO.

## Architettura finale proposta

### OSSERVATO
- RainViewer
- radar reale
- ultimi frame fino ad ADESSO
- Play / frecce / timeline
- centrato su Borgo Viazza

### EVOLUZIONE
- Windy Embed ufficiale
- layer "Rain, snow"
- mappa interattiva e timeline Windy
- nessuna API key
- nessun algoritmo proprietario di nowcasting
- nessun limite Tomorrow.io

## Importante
EVOLUZIONE è una previsione modellistica delle precipitazioni, non un radar futuro.

## Test richiesto
1. Verificare che OSSERVATO continui a funzionare.
2. Toccare EVOLUZIONE.
3. Verificare che la mappa Windy compaia direttamente dentro Radar Evoluzione.
4. Muovere la timeline Windy.
5. Controllare usabilità su smartphone.
6. Se l'iframe non dovesse caricarsi, usare il link "Apri Windy completo" e segnalarlo.

Se questo test è positivo, questa struttura è pronta per essere trasferita dentro Meteo Conte.
