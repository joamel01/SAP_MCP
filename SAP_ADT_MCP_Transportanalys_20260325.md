# SAP ADT MCP – Transportanalys 2026-03-25

## Underlag

Analysen bygger på verifierade ADT-anrop med användaren `CODEX` mot den lokala SAP-containern.

Verifierat:

- listning av modifiable requests
- listning av released requests
- detaljläsning av utvalda requests/tasks
- delete av tom modifiable request
- release av task

## Modifiable requests som syntes i testet

Urval från listningen:

- `A4HK900287` – `MCP E2E 2026-03-25`
- `A4HK900288` – `Generated Request for Change Recording`
- `A4HK900284` – `Generated Request for Change Recording`
- `A4HK900283` – `MCP E2E 2026-03-25`
- `A4HK900280` – `Generated Request for Change Recording`

Äldre modifiable requests fanns också kvar, huvudsakligen auto-genererade `Generated Request for Change Recording`.

## Released requests som syntes i testet

- `A4HK900291` – `MCP DELETE TEST 2026-03-25`
- `A4HK900282` – `MCP E2E 2026-03-25`

## Närmare analys

### `A4HK900287`

Status:

- request `D`
- taskcount `1`
- objectcount `28`

Innehåll:

- E2E-objekt från det fulla MCP-testet
- task `A4HK900290` är released
- requesten är fortfarande modifiable

Bedömning:

- detta är den tydligaste referensrequesten för det fulla CDS/AMDP/DCL/DDLX-testet
- den bör behållas tills ni aktivt bestämmer om E2E-spåret ska sparas eller städas

### `A4HK900280`

Status:

- request `D`
- taskcount `1`
- objectcount `18`

Innehåll:

- flera klassobjekt från tidigare MCP-felsökning
- blandade testklasser från stabiliseringsarbetet kring create/write/activate

Bedömning:

- detta ser ut som en historisk felsökningsrequest
- bör inte frisläppas blint
- lämplig kandidat för städning efter genomgång av vilka testobjekt som fortfarande behövs som referens

### `A4HK900291`

Status:

- request `R`
- taskcount `0`
- objectcount `0`

Bedömning:

- ren verifieringsrequest för release/delete-test
- inga objekt kvar
- kan lämnas som släppt teknisk verifiering utan vidare åtgärd

## Rekommendation

Behåll tills vidare:

- `A4HK900287`
- `A4HK900282`

Gå igenom för möjlig städning:

- `A4HK900280`
- `A4HK900283`
- `A4HK900288`
- övriga `Generated Request for Change Recording`

Frisläpp inte automatiskt:

- requestar som bara innehåller felsökningsobjekt
- requestar där ni inte först läst detaljinnehållet med `sap_adt_get_transport_request`

## Praktisk slutsats

MCP:n kan nu:

1. lista requests
2. analysera requests/tasks och objektinnehåll
3. release/delete i enkla verifierade fall

Det som återstår innan transporthanteringen är helt robust är framför allt:

- bättre hantering av request-release när SAP svarar med `E_TRKORR`-lås
- tydligare strategi för vilka äldre CODEX-requests som ska rensas respektive sparas
