# SAP ADT MCP – Transportbatch 1 2026-03-25

## Syfte

Första försiktiga batchen fokuserade på äldre en-objektsrequestar med rena FM-probeprogram.

Valda requestar:

- `A4HK900142`
- `A4HK900143`
- `A4HK900146`
- `A4HK900148`
- `A4HK900152`

Tillhörande tasks:

- `A4HK900144`
- `A4HK900145`
- `A4HK900147`
- `A4HK900149`
- `A4HK900153`

## Resultat

Verifierat:

- task-release fungerade för samtliga fem tasks
- den dåvarande request-release-vägen var fel
  - MCP:n använde då ännu inte den slutligt verifierade sekvensen `sortandcompress + newreleasejobs`
- batchen ska därför läsas som ett mellanresultat, inte som slutlig slutsats om request-release

## Slutsats

Efter senare verifiering gäller i stället:

- task-release fungerar
- request-release fungerar för äldre modifiable requests när rätt sekvens används
- helt färska requests kan fortfarande fastna i `E_TRKORR` direkt efter create/write
