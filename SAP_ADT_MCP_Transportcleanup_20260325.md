# SAP ADT MCP – Transportstädning 2026-03-25

## Syfte

Försöka städa överspelade CODEX-requestar som skapats under MCP-testerna.

## Utfört

Verifierat:

- äldre requestar som redan var rena gick att släppa med den rättade sekvensen
- exempel:
  - `A4HK900148`

Vid städning av äldre generated requests verifierades följande blockerfall:

- request: `A4HK900238`
- task: `A4HK900239`
- blockerande objekt:
  - `ZCL_MCP_ACT_PROBE49612`

Förstafynd:

- task-release svarade med inaktivt objekt i tasken
- feltexten pekade på:
  - `CINC ZCL_MCP_ACT_PROBE49612========CCDEF`

Utförd åtgärd:

- obsolet klass `ZCL_MCP_ACT_PROBE49612` raderades via ADT

Resultat:

- task `A4HK900239` gick därefter att släppa
- huvudrequest `A4HK900238` låg fortfarande kvar modifiable med:
  - `Requested object E_TRKORR is currently locked by user CODEX`

## Slutsats

Det går inte att massfrisläppa alla gamla generated requests blint.

För en del äldre requestar krävs i stället:

1. identifiera och rensa inaktiva/obsoleta testobjekt
2. släppa tasken
3. försöka släppa huvudrequesten i ett separat steg

Detta är alltså ett annat städscenario än:

- rena äldre requestar som bara behöver `sortandcompress + newreleasejobs`
- helt färska requestar som fastnar direkt efter create/write
