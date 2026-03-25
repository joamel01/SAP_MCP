# SAP ADT MCP – Transportbatch 2 – 2026-03-25

## Syfte
Fortsatt städning av äldre CODEX-requestar efter att första batchen hade visat att request-release kan fungera, men inte på alla äldre testrequestar.

## Utförda verifierade åtgärder
Requestarna nedan släpptes verifierat via request-för-request `safeReleaseTransportRequest(...)` mot SAP:

- `A4HK900134`
- `A4HK900140`
- `A4HK900150`
- `A4HK900154`
- `A4HK900156`
- `A4HK900158`
- `A4HK900160`
- `A4HK900162`
- `A4HK900164`
- `A4HK900166`
- `A4HK900168`
- `A4HK900170`
- `A4HK900172`

Verifierat resultat per request:
- `sortandcompress` gav `200` eller `400`
- `newreleasejobs` gav `200`
- slutstatus efter `GET /cts/transportrequests/<req>` blev `R / Released`

Viktig observation:
- `sortandcompress = 400` blockerade inte alltid frisläppning
- avgörande var i stället om `newreleasejobs` gav `200` och om slutstatus verkligen blev `R`

## Kvarvarande modifiable requestar efter batch 2

### Referensrequestar som medvetet lämnades kvar
- `A4HK900287`
- `A4HK900283`

### Requestar som fortfarande blockerades
- `A4HK900236`
- `A4HK900246`
- `A4HK900130`
- `A4HK900136`
- `A4HK900138`
- `A4HK900174`
- `A4HK900178`
- `A4HK900206`
- `A4HK900212`
- `A4HK900220`
- `A4HK900222`
- `A4HK900224`
- `A4HK900226`
- `A4HK900228`
- `A4HK900230`
- `A4HK900248`
- `A4HK900250`
- `A4HK900252`
- `A4HK900254`
- `A4HK900256`
- `A4HK900276`
- `A4HK900278`
- `A4HK900280`

## Analys av blockerare

### Grupp 1 – Inactive transport list
Flera requestar avvisades redan i MCP-precheck eftersom deras requestnummer finns i ADT:s inactive-transport-lista.

Verifierade exempel:
- `A4HK900174`
- `A4HK900178`
- `A4HK900206`
- `A4HK900212`
- `A4HK900220`
- `A4HK900222`
- `A4HK900248`
- `A4HK900276`

### Grupp 2 – D-task med gamla testobjekt
Flera requestar hade fortfarande taskstatus `D` och pekade på gamla MCP-testobjekt.

Verifierade exempel:
- `A4HK900174` -> task `A4HK900175` -> `Z_MCP_SHLP_ZMCP_SCARR_HELP20`
- `A4HK900178` -> task `A4HK900179` -> `Z_MCP_SHLP_HELP21`
- `A4HK900206` -> task `A4HK900207` -> `Z_MCP_PKG_LIST2`
- `A4HK900212` -> task `A4HK900213` -> `Z_MCP_OBJDIR_CHECK`
- `A4HK900220` -> task `A4HK900221` -> `ZCL_MCP_DELETE_INACTIVE`

För task-release gav SAP:
- `abortrelinacobj`

Det betyder att SAP självt anser att tasken fortfarande innehåller inaktiva objekt.

### Grupp 3 – Inactive-only objekt
Minst ett objekt verifierades finnas som inaktiv källversion utan aktiv TRDIR-post:

- `Z_MCP_SHLP_HELP21`

Verifierat beteende:
- `readObject(program)` returnerade full källkod
- create/activation gav fel:
  - `Entry not found ... in table/view TRDIR`
- delete gav ENQUEUE-fel:
  - `User CODEX is currently editing ...`

Detta visar att resterna inte längre är “vanliga aktiva program”, utan inaktiva repository-artefakter som fortfarande blockerar task/request.

## Slutsats
Det normala request-release-spåret i MCP:n fungerar nu bra för äldre requestar där:
- task redan är släppt eller kan släppas
- inga inactive-only artefakter återstår

Det som återstår är inte längre ett generellt CTS-problem utan en städfråga för äldre MCP-testobjekt:
- inactive-only program/klassrester
- äldre D-tasks som fortfarande pekar på dessa
- enstaka ENQUEUE-lås för CODEX

## Efterföljande verifiering
- `A4HK900256` gick senare att frisläppa manuellt i SAP efter att programmet i requesten först aktiverades.
- Det stärker slutsatsen att flera av de kvarvarande äldre requestarna sannolikt kan lösas genom:
  1. aktivering eller städning av kvarvarande inaktivt objekt
  2. därefter vanlig task/request-release
- `A4HK900206` verifierades senare end-to-end med MCP:
  1. underliggande program `Z_MCP_PKG_LIST2` lästes och aktiverades rent via ADT
  2. task `A4HK900207` släpptes
  3. requesthuvudet `A4HK900206` fastnade fortfarande i ADT med `E_TRKORR`
  4. befintligt hjälpprogram `Z_MCP_RELREQ_UTL` uppdaterades med bara `A4HK900206`
  5. `TRINT_RELEASE_REQUEST` kördes via programmet
  6. efterföljande `GET` visade slutstatus `R / Released`

Detta verifierar en fungerande tvåstegsmodell för vissa äldre requestar:
1. aktivera verkliga underliggande objekt
2. släpp task via ADT
3. släpp huvudrequest via FM-hjälpprogram om ADT fortfarande fastnar i `E_TRKORR`

- `A4HK900212` verifierades därefter med samma modell:
  1. underliggande program `Z_MCP_OBJDIR_CHECK` aktiverades rent
  2. task `A4HK900213` släpptes
  3. requesthuvudet fastnade först i ADT med `E_TRKORR`
  4. FM-fallback via `Z_MCP_RELREQ_UTL` gav slutstatus `R / Released`

- `A4HK900236` verifierades också med samma modell:
  1. underliggande program `Z_MCP_PROBE_ACT26484` aktiverades rent
  2. task `A4HK900237` släpptes
  3. ADT fastnade på requesthuvudet i `E_TRKORR`
  4. FM-fallback gav slutstatus `R / Released`

- `A4HK900130` visade först ett hårdare blockerfall men kunde sedan lösas via task-cleanup:
  - objekt: `Z_MCP_SCAFF_RUN2`
  - första aktiveringsresultatet visade:
    - `Type "ZCL_MCP_SCAFF_SVC2" is unknown.`
  - objektet gick inte att skriva om normalt via `source/main`
  - direkt `PUT` svarade:
    - `404`
    - `Z_MCP_SCAFF_RUN2 does not exist`
  - det placerar objektet i samma familj som gamla inactive-only eller trasiga taskreferenser
  - verifierad åtgärd:
    1. läs tasken via `TR_READ_REQUEST`
    2. ta bort objektposten ur tasken med `TRINT_DELETE_COMM_OBJECT_KEYS`
    3. släpp därefter task och request via `TRINT_RELEASE_REQUEST`
  - verifierat resultat:
    - delete i task `A4HK900131` gav `subrc 0`
    - task `A4HK900131` gick till `R`
    - request `A4HK900130` gick till `R`

- `A4HK900246` visade sig däremot vara ett mer specifikt reparationsfall, och kunde lösas:
  - objekt: `Z_MCP_ACTFIX48118`
  - första ADT-aktiveringen gav bara generellt `REPS ... inactive`
  - den verkliga orsaken hittades först i `activation/results/...`:
    - syntaxfel på rad 3
    - `\"'Z_MCP_STEP90630'\" is invalid here (due to grammar)`
  - felet var att programmet innehöll:
    - `obj_name = @'Z_MCP_STEP90630'`
  - viktig CTS-observation:
    - objektet var låst på huvudrequesten `A4HK900246`
    - omskrivning mot task `A4HK900247` nekades av SAP
    - rättningen behövde därför sparas med `corrNr = A4HK900246`
  - efter omskrivning med rätt `corrNr` blev:
    - `PUT 200`
    - aktivering `200`
    - request, task och objekt försvann från inactive-listan
  - därefter:
    - task `A4HK900247` gick till `R`
    - huvudrequest `A4HK900246` gick till `R`
    - FM-fallback via `TRINT_RELEASE_REQUEST` användes för att driva igenom slutlig release när ADT fortfarande var trögt

- `A4HK900138` verifierades därefter som ett rent standardfall:
  - objekt: `Z_MCP_DELETE_TMP5`
  - ADT-aktivering gick rent
  - inactive-listan blev tom för request och objekt
  - task `A4HK900139` släpptes
  - request `A4HK900138` gick till `R / Released` via FM-fallback efter att ADT fastnat i `E_TRKORR`

- `A4HK900136` ligger kvar som ett mellanfall:
  - objekt: `Z_MCP_DELETE_TMP4`
  - objektet finns och kan läsas
  - ADT-aktivering verkar gå rent
  - men requesten ligger fortfarande kvar i `D`
  - samtidigt har ADT-aktivering av temporära releasehjälpprogram flera gånger fallit med:
    - `451 REASON_451`
    - `connection closed (no data)`
  - det ser därför just nu ut som att nästa steg för `A4HK900136` är att undvika fler helper-omskrivningar och i stället antingen:
    - använda ett redan aktivt releaseverktyg manuellt, eller
    - låta requesten släppas manuellt i SAP om tasken redan är tekniskt klar

Slutsats från denna senare körning:
- det finns nu två tydligt verifierade klasser av kvarvarande requestar:
  1. aktiverbart objekt + task släpper + FM fallback löser requesthuvudet
  2. objektet finns men ligger kvar som inaktiv `REPS` trots ADT-aktivering, vilket blockerar tasken
- dessutom finns ett tredje verifierat underfall:
  3. objektet verkar först som `REPS`-blockerare men visar sig i själva verket innehålla ett konkret syntaxfel, som måste rättas i samma request som objektlåset ligger på
  4. inactive-only eller trasig taskreferens, där objektposten måste tas bort ur tasken innan release kan gå igenom

## Pilotförsök: aktivera underliggande objekt och därefter frisläppa
Verifierat pilotfall:
- request `A4HK900174`
- task `A4HK900175`
- underliggande objekt:
  - `Z_MCP_SHLP_ZMCP_SCARR_HELP20`

Utfört:
1. läste programkällan via ADT
2. körde `activateObject(...)` på program-URI
3. körde `activateObject(...)` på include-URI med parent-program
4. körde omskrivning av samma källa via `writeObject(... activateAfterWrite = true)`
5. försökte sedan släppa tasken

Verifierat resultat:
- ADT-aktiveringen avslutades utan tekniskt bakgrundsrunsfel
- objektet försvann från en direkt namnmatch i inactive-listan
- task-release stoppades ändå fortfarande av:
  - `EU 829`
  - `Object REPS Z_MCP_SHLP_ZMCP_SCARR_HELP20 is inactive`

Efterföljande SAP-verifiering:
- i `A4HK900174` fanns en hänvisning i tasken till ett icke existerande objekt
- när den hänvisningen raderades manuellt i transportens task gick transporten sedan att frisläppa

Korrigerad slutsats från piloten:
- åtminstone detta fall var inte ett bevis på att vanlig ADT-aktivering alltid är otillräcklig
- det verkliga problemet i `A4HK900174` var en felaktig kvarhängande transportreferens till ett objekt som inte längre fanns
- den typen av transportrest bör behandlas som cleanup av taskinnehåll, inte som ren aktiveringsfråga

## Rekommenderat nästa steg
1. Läs först `activation/results/...` för varje kvarvarande blockerat objekt, inte bara `inactiveobjects`.
2. Om objektet har syntaxfel: rätta det i samma request som objektlåset ligger på.
3. Släpp därefter tasken.
4. Släpp sedan huvudrequesten med samma request-för-request safe-release som nu är verifierat.
