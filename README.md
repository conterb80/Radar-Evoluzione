# Radar Evoluzione v4.3 — WeatherAPI Test

Versione di test derivata dalla v4.2.

## Modifica principale
- OSSERVATO: RainViewer invariato.
- FUTURO: rimosso Tomorrow.io e relativa API key.
- PREVISIONE: WeatherAPI Weather Maps, precipitazione oraria +1h / +2h / +3h.
- Nessuna chiave API necessaria per le Weather Maps.

## Test da fare
1. Verificare che l'OSSERVATO RainViewer continui a funzionare.
2. Portare la timeline nel FUTURO.
3. Verificare i tre frame +1h, +2h, +3h.
4. Premere Play più volte per controllare che non compaia più l'errore HTTP 429 di Tomorrow.io.
5. Durante una precipitazione reale, confrontare forma/posizione del nucleo tra osservato e previsione.

Fonte tecnica WeatherAPI: https://www.weatherapi.com/docs/ (sezione Weather Maps).
