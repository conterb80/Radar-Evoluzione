# Radar Evoluzione v4.8 — Tracking Memory Fallback

Correzione mirata della v4.7.

## Problema risolto
Nella v4.7, se al nuovo avvio la cella veniva seguita solo in 1-2 frame, il tracking live falliva ma la timeline FUTURO restava selezionabile. La mappa rimaneva quindi apparentemente "bloccata".

## Nuova logica
- Se il tracking LIVE riesce:
  - viene usato normalmente;
  - l'ultimo tracking valido viene salvato nel browser.
- Se il tracking LIVE fallisce:
  - l'app prova a recuperare l'ultimo tracking valido;
  - lo usa come fallback per massimo 60 minuti;
  - mostra chiaramente "ultimo tracking valido" / "Tracking salvato";
  - l'affidabilità viene degradata con il passare del tempo.
- Se non esiste un tracking valido recente:
  - il FUTURO viene realmente bloccato alla posizione ADESSO.

## Test consigliato
Il caso ideale è proprio quello visto stamattina:
1. una cella viene agganciata correttamente;
2. dopo 20-40 minuti il nuovo tracking live fallisce;
3. la v4.8 deve mostrare "ultimo tracking valido" e continuare il FUTURO con quella traiettoria.
