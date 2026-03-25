# SAP ADT MCP – Safe Release-verifiering 2026-03-25

## Syfte

Verifiera den rättade request-release-sekvensen i SAP:

- `sortandcompress`
- därefter `newreleasejobs`
- båda med XML-body som innehåller `tm:number`

## Verifierat fungerande fall

Request:
- `A4HK900148`

Utfall:
- `sortandcompress`: `200 OK`
- `newreleasejobs`: `200 OK`
- efterföljande `GET /cts/transportrequests/A4HK900148` visade:
  - `tm:status = R`
  - `tm:status_text = Released`

Viktigt:
- release-svaret innehöll fortfarande checkrun-status `abortrelapifail`
- requesten var ändå faktiskt frisläppt
- status måste därför alltid verifieras med efterföljande `GET`

## Verifierat specialfall som kvarstår

Färsk request skapad och använd i samma automatiserade kedja:
- `A4HK900298`

Objekt i requesten:
- program `Z_MCP_VRF81551`

Utfall:
- task `A4HK900299` gick till status `R`
- requesten låg kvar i status `D`
- både `sortandcompress` och `newreleasejobs` svarade:
  - `Requested object E_TRKORR is currently locked by user CODEX`

Ytterligare försök:
- direkt
- efter `1500 ms`
- efter `4000 ms`
- med ny ADT-klientinstans

Resultat:
- samma låsfel kvarstod

## Slutsats

Det som nu är verifierat:

- request-release fungerar för äldre modifiable requests när rätt sekvens används
- `releasejobs` är inte rätt releaseväg för requests
- efterkontroll med `GET` är obligatorisk

Det som kvarstår:

- helt färska requests som skapas, fylls och släpps i samma script kan fortfarande fastna i `E_TRKORR`
- detta ska behandlas som ett separat specialfall i den nuvarande miljön
