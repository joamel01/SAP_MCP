# SAP ADT MCP

Den här mappen innehåller en återanvändbar MCP-server för SAP ADT.

Målet är att kunna arbeta mot olika SAP-miljöer via samma kodbas genom att bara byta miljövariabler och URI-template-konfiguration.

## Nuvarande status

Version `1.0.0` stöder nu det som faktiskt krävs för fungerande ändringar via ADT:

- discovery
- läsa objekt
- läsa sökhjälpsmetadata via verifierad VIT-URI
- skapa enkel sökhjälp via verifierat helper-programspår
- köra körbara ABAP-program via `programrun`
- köra klasser via `classrun`
- skriva objekt via stateful session
- ADT-låsning och upplåsning
- hantering av `corrNr`
- aktivering via ADT
- global läsning av inactive objects / activation log
- deletion av objekt via verifierad ADT-sekvens
- skapande av transportrequest
- listning av transportrequests
- detaljläsning och analys av transportrequests/tasks
- consistency check för transportrequests/tasks
- release av transportrequests/tasks
- delete av transportrequests/tasks
- skapande av paket
- skapande av scaffold-bundle från mallar
- skapande av program
- skapande av klasser
- skapande av DDLS
- skapande av DCLS
- skapande av DDLX
- skapande av dataelement
- skapande av domäner
- skapande av domäner med fasta värden och värdetabell
- skapande av tabeller
- skapande av strukturer
- skapande av tabelltyper

Det viktiga nya i `1.0.0` är:

- `activation/runs` används nu med full ADT-URI och rätt objekttyp
- `sap_adt_create_transport_request` är verifierad mot ADT
- `sap_adt_create_dcls` och `sap_adt_create_ddlx` är verifierade mot ADT
- `create_program` och `create_class` autoaktiverar det skapade skalobjektet
- `create_ddls`, `create_dcls` och `create_ddlx` skapar bara shell-objekt
  - källan ska skrivas efteråt och först då aktiveras
- `write + activate` lämnar inte längre kvar inaktiva programartefakter
- klasskapande återhämtar sig från SAP:s eget självlås i samma request
- stateful session återstartas automatiskt om ADT svarar `Session timed out` under aktivering
- extern verifiering via Gemini CLI är nu genomförd end-to-end
  - transport skapad
  - paket skapat: `ZGEMINI_MCP_DEMO`
  - CDS, table function, AMDP-klass, serviceklass och program skapade via MCP från extern klient

## Nya tekniska fynd

Följande är nu verifierat mot SAP-systemet och inbyggt i projektet:

- transparenta tabeller skrivs via `.../ddic/tables/<objekt>/source/main` som textkälla
- strukturer skrivs via `.../ddic/structures/<objekt>/source/main` som textkälla
- domäner skrivs direkt mot objekt-URI:n `.../ddic/domains/<objekt>` som XML-metadata
- dataelement skrivs direkt mot objekt-URI:n `.../ddic/dataelements/<objekt>` som XML-metadata
- tabelltyper skrivs direkt mot objekt-URI:n `.../ddic/tabletypes/<objekt>` som XML-metadata
- DDIC-metadataobjekt kräver stateful session även för `PUT`, annars blir `lockHandle` ogiltig
- skapande i transporterat paket kräver ofta `corrNr` redan i första `POST create`
- aktivering sker mot objekt-URI:n, inte mot source-URI:n
- sökhjälp hittades som objekt-typ `SHLP/DH` via VIT-workbench-URI och kan läsas därifrån
- direkt ADT-create/update av sökhjälp saknar fortfarande verifierat DDIC-flöde
- sökhjälp skapas därför nu via ett verifierat helper-program med:
  - `DDIF_TABL_GET`
  - `DDIF_SHLP_PUT`
  - `TRINT_TADIR_INSERT`
  - `DDIF_SHLP_ACTIVATE`
- verifierad scope för sökhjälp i denna version är:
  - elementary help
  - en indexerad bas-tabell
  - ett nyckelfält
- VIT-läsning av sökhjälp är inte ett tillförlitligt existensbevis
- `TADIR`-registrering för sökhjälp är verifierad via `TRINT_TADIR_INSERT`
- `Z_SEARCHHELP1` används som manuellt referensobjekt för jämförelse
- VIT-metadata för MCP-skapade sökhjälper kan fortfarande svara `500`, även när DDIC-definition och `TADIR`-rad finns
- table function är inget separat ADT-objekt här, utan byggs som `DDLS/DF` plus vanlig klass med AMDP-metod
- rätt aktiveringsordning för table function-spåret är: `DDLS -> klass -> konsumentprogram`
- domänverktyget stöder nu även:
  - `fixedValues`
  - `valueTableName`
- `activation/runs` kräver i denna miljö:
  - full URI under `/sap/bc/adt/...`
  - korrekt `adtcore:type`
  - annars kan SAP svara `200 OK` men inte aktivera något
- transportrequest-create fungerar via:
  - `POST /sap/bc/adt/cts/transportrequests`
  - root-element `tm:root`
  - content-type `application/vnd.sap.adt.transportorganizer.v1+xml`
- DCL create kräver root-namespace:
  - `http://www.sap.com/adt/acm/dclsources`
- DDLX create kräver root-namespace:
  - `http://www.sap.com/adt/ddic/ddlxsources`
- verifierade objekttyper:
  - DCL: `DCLS/DL`
  - DDLX: `DDLX/EX`
- listning av transporter fungerar via:
  - `GET /sap/bc/adt/cts/transportrequests?targets=&requestStatus=...`
  - viktigt: parameter heter `requestStatus`, inte `status`
- requestdetalj visar:
  - `<tm:request>`
  - `<tm:task>`
  - `<tm:abap_object>`
- tom modifiable request kan raderas direkt via:
  - `DELETE /sap/bc/adt/cts/transportrequests/<nummer>`
- release av tom request kan ge ett blandat svar:
  - release-API kan returnera checkrun-status som ser felaktig ut
  - men requesten kan ändå hamna i status `R`
  - därför ska requeststatus alltid verifieras med en efterföljande `GET`
- release av task fungerar via:
  - `POST /sap/bc/adt/cts/transportrequests/<task>/newreleasejobs`
- release av request ska i praktiken köras som:
  - `POST /sap/bc/adt/cts/transportrequests/<request>/sortandcompress`
  - följt av `POST /sap/bc/adt/cts/transportrequests/<request>/newreleasejobs`
  - båda med XML-body som innehåller `tm:number`
- `releasejobs` gav verifierat `200 OK` utan faktisk release och ska därför inte användas som slutlig releaseväg
- request-release är verifierad för äldre modifiable requests efter task-release
- full städning av äldre CODEX-requestar är nu verifierad
  - inklusive task-cleanup via `TRINT_DELETE_COMM_OBJECT_KEYS`
  - och slutlig release via `TRINT_RELEASE_REQUEST`
  - inga `Modifiable` requestar återstår nu för `CODEX`
- helt färska requests som skapas, fylls och släpps i samma automatiserade kedja kan fortfarande falla med:
  - `Requested object E_TRKORR is currently locked by user CODEX`
  - detta kvarstår som ett specialfall i den nuvarande miljön

## Dokument

- [SAP_ADT_MCP_Technical_Design.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_Technical_Design.md)
- [SAP_ADT_MCP_API_and_Phasing.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_API_and_Phasing.md)
- [SAP_ADT_MCP_Risks_and_Security.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_Risks_and_Security.md)
- [IMPLEMENTATION_README.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/IMPLEMENTATION_README.md)
- [SAP_ADT_MCP_Verified_Findings.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_Verified_Findings.md)
- [SAP_ADT_MCP_E2E_Test_20260325.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_E2E_Test_20260325.md)
- [SAP_ADT_MCP_Transport_Handling.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_Transport_Handling.md)
- [SAP_ADT_MCP_Transport_Analysis_20260325.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_Transport_Analysis_20260325.md)
- [SAP_ADT_MCP_Transport_Verify_20260325_SafeRelease.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_Transport_Verify_20260325_SafeRelease.md)
- [SAP_ADT_MCP_Transport_Cleanup_Final_20260325.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_Transport_Cleanup_Final_20260325.md)
- [SAP_ADT_MCP_Gemini_Verification_20260325.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_Gemini_Verification_20260325.md)

Efter den slutliga transportstädningen är projektet även rensat från tillfälliga release- och repair-skript.
Kvar i `src/` och `dist/` finns nu bara den permanenta MCP-implementationen och dess ordinarie stödverktyg.

Nytt verktyg:

- `sap_adt_run_program`
- `sap_adt_run_class`
- `sap_adt_delete_object`
- `sap_adt_create_transport_request`
- `sap_adt_list_transport_requests`
- `sap_adt_get_transport_request`
- `sap_adt_check_transport_request`
- `sap_adt_release_transport_request`
- `sap_adt_safe_release_transport_request`
- `sap_adt_delete_transport_request`
- `sap_adt_apply_transport_policy`
- `sap_adt_create_search_help`
- `sap_adt_create_abap_scaffold`
- `sap_adt_create_dcls`
- `sap_adt_create_ddlx`

## Återanvändning mot annan miljö

Det du normalt byter är bara:

- `SAP_ADT_BASE_URL`
- `SAP_ADT_USERNAME`
- `SAP_ADT_PASSWORD`
- `SAP_ADT_DEFAULT_TRANSPORT_REQUEST` när du arbetar i transporterat paket
- `SAP_ADT_VERIFY_TLS`
- `SAP_ADT_ALLOWED_PACKAGES`
- `config/object-uri-templates.json` om ditt system avviker

Valfria defaultvärden för skapande:

- `SAP_ADT_DEFAULT_TRANSPORT_REQUEST`
- `SAP_ADT_DEFAULT_MASTER_SYSTEM`
- `SAP_ADT_DEFAULT_ABAP_LANGUAGE_VERSION`
- `SAP_ADT_DEFAULT_SOFTWARE_COMPONENT`
- `SAP_ADT_DEFAULT_SOFTWARE_COMPONENT_DESCRIPTION`

Viktigt för transporterade paket:

- `SAP_ADT_DEFAULT_TRANSPORT_REQUEST` är nu bara en fallback
- create-spåren använder denna ordning:
  1. explicit `transportRequest`
  2. giltig `.env`-fallback om den fortfarande finns som modifiable huvudrequest
  3. automatisk lookup om exakt en modifiable huvudrequest finns för användaren
- om flera modifiable huvudrequestar finns samtidigt kastas ett tydligt fel i stället för att MCP:n gissar
- verifierad request i containern under tidigare test var `A4HK900280`, men den ska inte längre ses som ett permanent standardvärde

## Prova med Gemini CLI

Projektet är nu i ett tillräckligt moget skick för att provas från en extern MCP-klient, till exempel Gemini CLI.
Det jag skulle kalla kvarvarande begränsningar är främst edge cases kring helt färska transportrequestar och inte grundläggande repository-access.

Enklaste vägen är:

1. bygg projektet:
   - `npm install`
   - `npm run build`
2. verifiera att `.env` i projektroten innehåller rätt SAP-uppgifter
3. använd wrappern:
   - [scripts/run-sap-adt-mcp.sh](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/scripts/run-sap-adt-mcp.sh)
4. lägg in MCP-servern i Gemini CLI:s `settings.json`
   - exempel finns i [gemini-settings.example.json](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/gemini-settings.example.json)

Gemini CLI-dokumentationen beskriver att MCP-servrar läggs i `~/.gemini/settings.json` eller projektets `.gemini/settings.json` under `mcpServers`, och att du sedan kan verifiera dem med `/mcp list`.

## Viktig avgränsning

Det här är fortfarande en medvetet smal MCP:

- ingen import av transporter
- release/delete av transporter är nu stödd, men requeststatus måste fortfarande efterkontrolleras eftersom SAP:s release-svar inte alltid är tillräckligt entydigt
- ingen massaktivering
- ingen GUI-automation
- ingen generell systemadministration

## Verifierat mot container

Följande är nu verifierat mot den lokala containern:

- discovery fungerar
- klass-, program- och DDLS-läsning fungerar
- programskapande fungerar
- klasskapande fungerar
- DDLS-skapande fungerar
- scaffold-skapande av program + klass + DDLS fungerar
- dataelementskapande fungerar
- domänskapande fungerar
- domänskapande med fasta värden fungerar
- tabellskapande fungerar
- strukturskapande fungerar
- tabelltypsskapande fungerar
- stateful `write + activate` fungerar för program
- stateful `create + write metadata/source + activate` fungerar för DDIC-objekt
- paketskapande fungerar
- transporterat utvecklingspaket med efterföljande programskapande i samma paket är verifierat
- transporterat paket + programskapande lämnar inte kvar inaktiv version i `0.8.0`
- listning av CODEX-transporter fungerar
- detaljanalys av request/task fungerar
- delete av tom modifiable request fungerar
- release av task fungerar
- release av request kräver fortfarande efterkontroll av verklig requeststatus
- läsning av sökhjälp fungerar via VIT-URI
- skapande av enkel sökhjälp fungerar via helper-program
- paketregistrering för enkel sökhjälp fungerar via `TRINT_TADIR_INSERT`
- table function + AMDP-klass + enkelt exponeringsprogram fungerar
- full E2E-kedja fungerar:
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
- `programrun` fungerar via ADT med `POST` + giltig CSRF-token
- fysisk tabell kan fyllas med data via ett körbart ABAP-program över ADT
- `classrun` fungerar via ADT med `POST` + giltig CSRF-token
- delete-sekvensen är verifierad manuellt mot program:
  - `LOCK` på `.../source/main`
  - `DELETE` på definitions-URI:n med `lockHandle` och `corrNr`

Senast verifierade program:

- paket: `Z_DEV_KODEXPORT`
- program: `Z_MCP_FLIGHT_DEMO`
- program: `Z_MCP_FILL_SIMPLE_TAB`
- paket: `Z_MCP_TPK249520`
- program: `Z_MCP_TPRG49520`
- program: `Z_MCP_FIX74986`
- paket: `Z_MCP_TPK66547`
- program: `Z_MCP_TPR66547`

Senast verifierade demo-objekt:

- domän: `ZMCP_SIMPLE_DOM`
- domän med fasta värden: `ZMCP_STATUS_DOM3`
- struktur: `ZMCP_SIMPLE_STRU`
- sökhjälp: `ZMCP_SCARR_HELP18`
- sökhjälp: `ZMCP_SCARR_HELP23`
- table function: `ZI_MCP_SFLIGHT_TF`
- AMDP-klass: `ZCL_MCP_SFLIGHT_TF`
- program: `Z_MCP_SFLIGHT_TF_RUN`
- program: `Z_MCP_SCAFF_RUN4`
- klassrun-klass: `ZCL_MCP_CLASSRUN_DEMO`
- scaffold-klass: `ZCL_MCP_SCAFF_SVC4`
- scaffold-DDLS: `ZI_MCP_SCAFF_FLT5`
- klass: `ZCL_MCP_C36633`
- request: `A4HK900287`
- paket: `Z_MCP_E2E_287`
- basic DDLS: `ZI_MCP_E2E_FLB287`
- table function DDLS: `ZI_MCP_E2E_TF287`
- AMDP-klass: `ZCL_MCP_E2E_TF287`
- composite DDLS: `ZI_MCP_E2E_FLC287`
- consumption DDLS: `ZC_MCP_E2E_FL287`
- DCL: `ZC_MCP_E2E_FL287`
- DDLX: `ZC_MCP_E2E_FL287`
- serviceklass: `ZCL_MCP_E2E_SVC287`
- program: `Z_MCP_E2E_RUN287`
