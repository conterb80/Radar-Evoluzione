# Radar Evoluzione v4.3.1 — Diagnostica WeatherAPI

Correzione di test dopo il messaggio “Frame WeatherAPI non disponibile”.

## Cosa cambia
- RainViewer OSSERVATO invariato.
- WeatherAPI FUTURO invariato come sorgente.
- Prima di caricare ogni previsione, l'app prova una tile su Borgo Viazza e cerca automaticamente uno zoom nativo disponibile (6/5/4/7/8).
- Il messaggio diagnostico mostra l'ora UTC e lo stamp realmente richiesto.
- Il Play ora aspetta il completamento del frame prima di avanzare: niente richieste sovrapposte.
- Se WeatherAPI non pubblica davvero quel frame, il messaggio lo dice chiaramente e specifica che la mappa rimasta visibile è ancora l'ultimo OSSERVATO.

## Test
1. Caricare i file nella repository.
2. Aprire FUTURO con freccia destra, un frame alla volta.
3. Fotografare il riquadro diagnostico se compare “Frame WeatherAPI non pubblicato” o “Layer WeatherAPI incompleto”.
4. Se compare “Previsione WeatherAPI caricata”, provare Play fino a +3h.
