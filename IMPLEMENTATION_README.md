# SAP ADT MCP – Implementation

Detta är nu en fungerande `1.0.0`-implementation av en MCP-server för SAP ADT.

## Innehåll

- `src/server.ts`
  MCP-verktygen och stdio-start
- `src/adt-client.ts`
  ADT-klient med stateful session, cookie-hantering, CSRF, lock/unlock och aktivering
- `src/config.ts`
  miljövariabler och defaultvärden
- `config/object-uri-templates.json`
  justerbara URI-template-mappar per objekttyp
- `.env.example`
  återanvändbar mall för nya system

## Det som är nytt i 1.0.0

Nytt i `1.0.0` är:

- `sap_adt_create_transport_request`
- `sap_adt_list_transport_requests`
- `sap_adt_get_transport_request`
- `sap_adt_check_transport_request`
- `sap_adt_release_transport_request`
- `sap_adt_delete_transport_request`
- `sap_adt_create_dcls`
- `sap_adt_create_ddlx`
- verifierat end-to-end-scenario med:
  - transportrequest
  - paket
  - basic CDS
  - table function
  - AMDP-klass
  - composite CDS
  - consumption CDS
  - DCL
  - DDLX
  - serviceklass
  - program
- `createDdls`, `createDcls` och `createDdlx` autoaktiverar inte längre tomma shell-objekt
  - shell skapas först
  - källkod skrivs sedan
  - aktivering sker i samband med `writeObject(... activateAfterWrite: true)`
- verifierad ADT-create för transportrequest via `tm:root`
- verifierad listning av transportrequests via `requestStatus` + `targets=`
- verifierad detaljläsning av request/task via `GET /cts/transportrequests/{nummer}`
- verifierad delete av tom modifiable request
- verifierad release av task
- verifierade create-namespaces:
  - DCL: `http://www.sap.com/adt/acm/dclsources`
  - DDLX: `http://www.sap.com/adt/ddic/ddlxsources`
- verifierade objekttyper:
  - DCL: `DCLS/DL`
  - DDLX: `DDLX/EX`
- verifierad transportstädning end-to-end för äldre CODEX-requestar:
  - objektaktivering där det behövs
  - task-cleanup via `TRINT_DELETE_COMM_OBJECT_KEYS`
  - release via `TRINT_RELEASE_REQUEST`
  - inga `Modifiable` requestar återstod efter slutkörningen
- `activateObject(...)` retryar nu transient:
  - `451 REASON_451`
  - `connection closed (no data)`
- tillfälliga felsökningsskript för release/repair är borttagna efter slutstädningen
  - repositoryt innehåller nu bara den permanenta MCP-koden och dokumenterade verifieringsunderlag
- extern verifiering via Gemini CLI är genomförd
  - paket `ZGEMINI_MCP_DEMO` skapades från extern MCP-klient
  - kedjan med transport, paket, CDS, table function, AMDP-klass, klass och program fungerade

## Det som är nytt i 0.8.0

Nytt i `0.8.0` är:

- aktivering går nu via `POST /activation/runs`
- objektreferensen innehåller nu full ADT-URI och korrekt `adtcore:type`
- rena `createProgram` och `createClass` autoaktiverar det skapade skalobjektet
- `writeObject(... activateAfterWrite: true)` lämnar inte längre kvar inaktiva programversioner
- klasskapande återhämtar sig från SAP:s eget självlås i samma request
- stateful session nollställs och hämtas om automatiskt om ADT svarar `Session timed out` under aktivering
- `SAP_ADT_DEFAULT_TRANSPORT_REQUEST` används nu bara som fallback
- create-spåren försöker först hitta en explicit eller entydig aktuell modifiable huvudrequest
- om flera modifiable huvudrequestar finns samtidigt måste `transportRequest` anges explicit eller `.env`-fallbacken peka på en av dem

## Det som är nytt i 0.7.0

Nytt i `0.7.0` är:

- `sap_adt_create_search_help`
- verifierat helper-programspår för sökhjälp med:
  - `DDIF_TABL_GET`
  - `DDIF_SHLP_PUT`
  - `TRINT_TADIR_INSERT`
  - `DDIF_SHLP_ACTIVATE`
- verifierad scope för sökhjälp:
  - elementary help
  - en indexerad bas-tabell
  - ett nyckelfält
- helper-program för sökhjälp ska inte bindas till `transportRequest`
- VIT-läsning av sökhjälp visade sig inte vara ett tillförlitligt existensbevis
- `Z_SEARCHHELP1` används nu som manuellt referensobjekt för paketerad sökhjälp

## Det som är nytt i 0.6.0

Nytt i `0.6.0` är:

- `sap_adt_delete_object`
- `sap_adt_create_abap_scaffold`
- verifierad delete-sekvens för repository-objekt:
  - `LOCK` på `.../source/main`
  - `DELETE` på definitions-URI med `lockHandle` och `corrNr`
- DDLS-create i transporterat paket stöder nu `corrNr` redan i första `POST`
- scaffold-verktyget skapar och kopplar ihop:
  - program
  - klass
  - DDLS
  från färdiga mallar

## Det som var nytt i 0.5.0

Den första versionen kunde läsa objekt, men skrivning var för naiv. Nu används den sekvens som faktiskt fungerade mot SAP:

1. öppna stateful session
2. hämta CSRF-token
3. lås objektet
4. läs `LOCK_HANDLE` och ev. `CORRNR`
5. `PUT` mot objektets source-uri
6. lås upp objektet
7. aktivera objektet

Detta är den viktigaste skillnaden mellan en teoretisk och en praktiskt användbar ADT-klient.

## Det som var nytt i 0.4.0

Nytt i `0.4.0` var att samma princip även täcker fler DDIC-objekt som inte beter sig som vanlig textkälla:

- tabeller: källa på `.../source/main`
- strukturer: källa på `.../source/main`
- domäner: XML-metadata direkt på objekt-URI
- dataelement: XML-metadata direkt på objekt-URI
- tabelltyper: XML-metadata direkt på objekt-URI

Det här var den viktigaste nya upptäckten från verifieringen mot containern.

Nytt i `0.5.0` är att domänverktyget även stöder:

- `fixedValues`
- `valueTableName`

Detta är verifierat mot SAP med en riktig Z-domän med fasta värden.

## Tillgängliga MCP-verktyg

- `sap_adt_discover`
- `sap_adt_read_object`
- `sap_adt_read_search_help`
- `sap_adt_create_search_help`
- `sap_adt_run_program`
- `sap_adt_run_class`
- `sap_adt_write_object`
- `sap_adt_activate_object`
- `sap_adt_get_activation_log`
- `sap_adt_delete_object`
- `sap_adt_list_transport_requests`
- `sap_adt_get_transport_request`
- `sap_adt_check_transport_request`
- `sap_adt_release_transport_request`
- `sap_adt_delete_transport_request`
- `sap_adt_apply_transport_policy`
- `sap_adt_create_package`
- `sap_adt_create_abap_scaffold`
- `sap_adt_create_program`
- `sap_adt_create_class`
- `sap_adt_create_ddls`
- `sap_adt_create_dcls`
- `sap_adt_create_ddlx`
- `sap_adt_create_dataelement`
- `sap_adt_create_domain`
- `sap_adt_create_table`
- `sap_adt_create_structure`
- `sap_adt_create_tabletype`

## Miljövariabler

Obligatoriska:

- `SAP_ADT_BASE_URL`
- `SAP_ADT_USERNAME`
- `SAP_ADT_PASSWORD`

Vanliga:

- `SAP_ADT_TIMEOUT_MS`
- `SAP_ADT_VERIFY_TLS`
- `SAP_ADT_ALLOWED_PACKAGES`
- `SAP_ADT_ALLOWED_OBJECT_TYPES`
- `SAP_ADT_URI_TEMPLATES_FILE`

Defaultvärden för skap-verktyg:

- `SAP_ADT_DEFAULT_MASTER_SYSTEM`
- `SAP_ADT_DEFAULT_ABAP_LANGUAGE_VERSION`
- `SAP_ADT_DEFAULT_SOFTWARE_COMPONENT`
- `SAP_ADT_DEFAULT_SOFTWARE_COMPONENT_DESCRIPTION`

## Rekommenderat första test i ny miljö

1. kopiera `.env.example` till `.env`
2. fyll i ADT-bas, användare och lösenord
3. kör `npm install`
4. kör `npm run check`
5. kör `npm run smoke`
6. testa `sap_adt_discover`
7. testa `sap_adt_read_object`
8. testa sedan ett ofarligt `sap_adt_write_object` mot ett Z-objekt

## Verifierad containerkonfiguration

Följande är verifierat mot den lokala Docker-containern `a4h_2023`:

- ADT-bas:
  - `http://127.0.0.1:50000/sap/bc/adt`
- discovery fungerar
- klasskälla fungerar
- programkälla fungerar
- DDLS-källa fungerar
- programskapande fungerar
- klasskapande fungerar
- DDLS-skapande fungerar
- scaffold-skapande av program + klass + DDLS fungerar
- dataelementskapande fungerar
- domänskapande fungerar
- tabellskapande fungerar
- strukturskapande fungerar
- tabelltypsskapande fungerar
- stateful `write + activate` fungerar
- tom modifiable transportrequest kan skapas och raderas via ADT
- task-release fungerar via ADT
- request-release måste efterverifieras med en ny `GET`, eftersom release-svaret kan vara missvisande

## CTS-fynd från 2026-03-25

Verifierat:

- listquery för modifiable requests ska använda:
  - `GET /cts/transportrequests?targets=&requestStatus=D`
- parametern är camelCase:
  - `requestStatus`
- requestdetalj innehåller tre relevanta nivåer:
  - `tm:request`
  - `tm:task`
  - `tm:abap_object`
- tom modifiable request kan raderas direkt med:
  - `DELETE /cts/transportrequests/<nummer>`
- release av tom request kan ge ett checkrun-svar som ser ut som fel
  - men requesten kan ändå hamna i status `R`
  - status ska därför alltid bekräftas med efterföljande `GET`
- den första request-release-analysen utgick felaktigt från `releasejobs`
- verifierad request-release använder i stället:
  - `sortandcompress`
  - följt av `newreleasejobs`
  - med XML-body som innehåller `tm:number`
- äldre modifiable requests kan släppas med den sekvensen
- helt färska requests kan fortfarande falla med `Requested object E_TRKORR is currently locked by user CODEX`

## Verifierade ADT-format för DDIC

Detta är nu verifierat direkt mot systemet:

- tabell-metadata:
  - `GET /sap/bc/adt/ddic/tables/<name>`
  - textkälla:
    - `GET /sap/bc/adt/ddic/tables/<name>/source/main` med `Accept: text/plain`
- struktur-metadata:
  - `GET /sap/bc/adt/ddic/structures/<name>`
  - textkälla:
    - `GET /sap/bc/adt/ddic/structures/<name>/source/main` med `Accept: text/plain`
- domän:
  - `GET /sap/bc/adt/ddic/domains/<name>`
  - ingen `source/main`, objektet redigeras som XML
  - fasta värden ligger under:
    - `<doma:valueInformation><doma:fixValues><doma:fixValue>...`
- dataelement:
  - `GET /sap/bc/adt/ddic/dataelements/<name>`
  - ingen `source/main`, objektet redigeras som XML
- tabelltyp:
  - `GET /sap/bc/adt/ddic/tabletypes/<name>`
  - ingen `source/main`, objektet redigeras som XML
- sökhjälp:
  - `GET /sap/bc/adt/vit/wb/object_type/shlpdh/object_name/<name>`
  - returnerar grundmetadata som `application/vnd.sap.adt.basic.object.properties+xml`
  - direkt create/update-flöde via ADT-DDIC är ännu inte verifierat
  - fungerande create-flöde sker i stället via helper-program
  - paketregistrering sker via `TRINT_TADIR_INSERT`
- table function:
  - skapas som vanlig DDLS med objekt-typ `DDLS/DF`
  - implementering sker i vanlig klass via `FOR TABLE FUNCTION`
  - konsumenter kan vara vanliga program eller andra CDS-objekt

Verifierade content-types:

- domän:
  - `application/vnd.sap.adt.domains.v2+xml`
- dataelement:
  - `application/vnd.sap.adt.dataelements.v2+xml`
- tabelltyp:
  - `application/vnd.sap.adt.tabletype.v1+xml`
- strukturkälla:
  - `text/plain`
- tabellkälla:
  - `text/plain`

Verifierade source-URI:er:

- klass:
  - `/sap/bc/adt/oo/classes/CL_ABAP_CHAR_UTILITIES/source/main`
- program:
  - `/sap/bc/adt/programs/programs/SAPMSSY0/source/main`
- DDLS:
  - `/sap/bc/adt/ddic/ddl/sources/I_CalendarDate/source/main`

Verifierade runtime-URI:er:

- programkörning:
  - `POST /sap/bc/adt/programs/programrun/{programname}`
  - kräver giltig CSRF-token
  - svarar med `text/plain`
- klasskörning:
  - `POST /sap/bc/adt/oo/classrun/{classname}`
  - kräver giltig CSRF-token
  - svarar med `text/plain`

## Kända begränsningar

- URI-template-filen kan fortfarande behöva justeras per system
- DCL/DDLX/DDLS kan skilja mellan releaser
- paket-, program-, klass-, DDLS-, domän-, dataelements-, tabell-, struktur- och tabelltypsskapande är verifierat mot testcontainern
- transportrequest-, DCL- och DDLX-skapande är nu också verifierat mot testcontainern
- paketskapande är även verifierat för ett nytt transporterat utvecklingspaket med efterföljande programskapande i samma paket
- programartefaktproblemet är löst i `0.8.0`
  - verifierat både i `Z_DEV_KODEXPORT` och i ett nytt transporterat paket
  - full ADT-URI + korrekt objekttyp i `activation/runs` var den avgörande skillnaden
- pretty-printer-dumpen vid klasskapande är också undanröjd när create-spåret får huvudrequesten via `corrNr`
  - verifierat genom `SAP_ADT_DEFAULT_TRANSPORT_REQUEST=A4HK900280`
  - tidigare dump i `Dump1.txt` visade att task-beteendet gav `CX_OO_LOCKED_IN_OTHER_REQUEST` och `CX_OO_SOURCE_SAVE_FAILURE` i `PRETTY_PRINTER`
- separat test visade också att programkälla kan skickas direkt i create-steget via `abapsource:source`
  - men det spåret löser inte ensam aktiveringsproblemet utan korrekt `activation/runs`
- transporthanteringen är också ofullständig:
  - MCP-skapade testobjekt kan bli låsta i MCP-användarens request/task
  - ADT reagerar då med transport-/låsproblem, medan SE80 kan fortsätta via samma transportspår
  - det måste lösas innan MCP:n kan betraktas som ren för delad utvecklingsmiljö
- fasta domänvärden är verifierade mot testcontainern
- sökhjälp är identifierad som `SHLP/DH`
- direkt create/update-spår via ADT-DDIC är ännu inte verifierat
- `sap_adt_create_search_help` fungerar nu via helper-program och verifierad `TADIR`-registrering
- `sap_adt_read_search_help` är fortfarande inte ett tillförlitligt verifieringssteg för MCP-skapade sökhjälper, eftersom VIT-endpointen kan svara `500` trots aktiv DDIC-definition och befintlig `TADIR`-rad
- table function kräver rätt aktiveringsordning:
  - aktivera DDLS först
  - aktivera därefter AMDP-klassen
  - aktivera sist program eller annan konsument
- misslyckade DDIC-create/update-försök kan lämna objekt i status `new`
- sådana restobjekt kan tillfälligt få SAP-redigeringslås, men de gick i den verifierade körningen att städa bort via korrekt delete-sekvens med `lockHandle` och `corrNr`
- `classrun` är nu verifierad end-to-end med egen klass och MCP-klient
- delete är verifierad på ADT-nivå och verktyget följer samma sekvens, men objekt med kvarhängande SAP-redigeringslås kommer fortfarande att ge SAP:s eget låsfel
- två programrester i `Z_DEV_KODEXPORT` visar att sådana kvarhängande lås är ett verkligt scenario:
  - `Z_MCP_SCAFF_RUN2`
  - `Z_MCP_SHLP_HELP21`
- båda objekten kunde fortfarande läsas via ADT, men delete stoppades av `403 Forbidden` med meddelandet att användaren `CODEX` redan redigerade objekten
- försök att radera dem via hjälpprogram med `RS_DELETE_PROGRAM` gav ingen effekt i den här miljön
- praktisk slutsats:
  - MCP:n behöver skilja mellan sitt eget ADT-låsflöde och externa SAP-ENQUEUE-lås
  - vissa restobjekt kan kräva separat upplåsning, typiskt via `SM12`, innan normal delete fungerar
- slutstatus:
  - efter upplåsning/städning i systemet kunde `Z_MCP_SCAFF_RUN2` och `Z_MCP_SHLP_HELP21` tas bort
  - verifieringsfyndet kvarstår därför som en lärdom om låshantering, inte som en öppen rest i paketet
