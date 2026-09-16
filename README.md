# Radar Evoluzione v4.6 — Nowcast Conte locale

Correzioni principali rispetto alla v4.5:

- il FUTURO usa l'intero layer RainViewer dell'ultimo frame, quindi non deve più sparire la parte superiore della mappa;
- il movimento viene stimato soprattutto nel settore vicino a Borgo Viazza, riducendo l'influenza dei sistemi lontani;
- se il movimento è troppo piccolo/ambiguo, l'app NON scrive più “0 km/h, affidabilità alta”: segnala invece “moto non risolto”.

## Test
1. Carica la v4.6.
2. Attendi la STIMA MOVIMENTO LOCALE.
3. Se compare “pronta”, prova +10, +20, +30 e Play.
4. Se compare “moto non risolto”, controlla comunque che entrando nel FUTURO non sparisca più la parte nord della mappa.
5. Mandami uno screenshot di ADESSO e uno di +20/+30.
