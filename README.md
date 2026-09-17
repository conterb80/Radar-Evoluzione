# Radar Evoluzione v4.7 — Cell Tracking Test

Questa versione cambia il metodo di stima del moto.

1. Scarica gli ultimi frame RainViewer centrati su Borgo Viazza.
2. Separa gli echi precipitanti in singoli oggetti.
3. Sceglie la cella significativa più vicina alla zona.
4. La segue all'indietro negli ultimi frame.
5. Calcola direzione e velocità dal baricentro della cella.
6. Usa questa traiettoria per +10, +20, ... +90 minuti.

Sulla mappa compare un indicatore giallo "cella seguita".

## Test
Attendi "Cella agganciata", controlla direzione/velocità/affidabilità, poi prova +20 e +30 min e Play.
Se compare "nessuna cella agganciata", mandami lo screenshot del messaggio.
