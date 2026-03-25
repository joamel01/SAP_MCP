# SAP ADT MCP – Verifierade Fynd

## Verifierat mot SAP-container

System:
- ADT-bas: `http://127.0.0.1:50000/sap/bc/adt`
- Client: `001`
- Användare: `CODEX`

Paket för verifiering:
- `Z_DEV_KODEXPORT`
- `Z_MCP_E2E_287`
- `ZGEMINI_MCP_DEMO`

## Verifierat från extern MCP-klient

Det som nu även är verifierat utanför den lokala testkedjan är:
- Gemini CLI kunde använda MCP-servern utan extra kodändringar
- en ny transport skapades från extern klient
- ett nytt paket skapades:
  - `ZGEMINI_MCP_DEMO`
- CDS-vyer skapades från extern klient
- table function med AMDP-klass skapades från extern klient
- en klass som konsumerar CDS-lagret skapades från extern klient
- ett program som använder klassen skapades från extern klient

Detta är den första verifieringen där hela kedjan körts från en separat MCP-konsument och inte bara från lokala testscripten.

## Transportrequest

Det som är verifierat:
- create fungerar via:
  - `POST /sap/bc/adt/cts/transportrequests`
- listning fungerar via:
  - `GET /sap/bc/adt/cts/transportrequests?targets=&requestStatus=...`
- parametern heter:
  - `requestStatus`
  - inte `status`
- payload måste ha root-element:
  - `tm:root`
- fungerande content-type:
  - `application/vnd.sap.adt.transportorganizer.v1+xml`
- verifierad minsta fungerande payload innehåller:
  - `tm:owner`
  - `tm:desc`
  - `tm:type`
  - `tm:target`
  - `tm:source_client`
- requestdetalj via `GET /cts/transportrequests/{nummer}` innehåller:
  - `tm:request`
  - `tm:task`
  - `tm:abap_object`
- tom modifiable request kan raderas direkt via:
  - `DELETE /cts/transportrequests/{nummer}`
- task-release fungerar via:
  - `POST /cts/transportrequests/{task}/newreleasejobs`
- request-release fungerar via:
  - `POST /cts/transportrequests/{request}/sortandcompress`
  - följt av `POST /cts/transportrequests/{request}/newreleasejobs`
  - båda med XML-body som innehåller `tm:number`
- `POST /cts/transportrequests/{request}/releasejobs` gav verifierat `200 OK` utan faktisk release
  - den vägen ska därför inte användas för request-release
- release av tom request kan ge ett blandat checkrun-svar
  - men requesten kan ändå hamna i status `R`
  - requeststatus måste därför efterverifieras med ny `GET`
- request-release är nu verifierad på äldre modifiable requests
  - verifierat exempel: `A4HK900148`
  - requesten gick till status `R`
  - trots att release-svaret fortfarande innehöll checkrun-status `abortrelapifail`
- request-för-request safe-release på äldre generated requests fungerar nu brett
  - verifierade exempel:
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
  - `sortandcompress` kan där ge både `200` och `400`
  - det avgörande är att `newreleasejobs` ger `200` och att efterföljande `GET` visar `R`
- helt färska requests kan fortfarande fastna med `E_TRKORR` trots released task
  - verifierade exempel: `A4HK900295`, `A4HK900298`
  - även efter väntetider och ny ADT-klientinstans
  - detta kvarstår som ett specialfall för omedelbar request-release efter create/write
- vid städning av äldre generated requests finns ytterligare ett verifierat blockerfall:
  - task-release kan falla med `abortrelinacobj`
  - exempel: `A4HK900239`
  - konkret blockerare var inaktivt objekt `CINC ZCL_MCP_ACT_PROBE49612========CCDEF`
- efter radering av det obsoleta objektet `ZCL_MCP_ACT_PROBE49612` gick tasken att släppa
- huvudrequesten `A4HK900238` låg ändå kvar med `E_TRKORR`
  - alltså kan gammal generated request kräva både objektrensning och ett separat senare releaseförsök
- de requestar som fortfarande återstår efter batch 2 är nu mer specifika:
  - vissa har `D`-task och `abortrelinacobj`
  - vissa pekar på inactive-only objekt som finns i ADT men saknar aktiv TRDIR-post
  - verifierat exempel: `Z_MCP_SHLP_HELP21`
  - försök att skapa samma program igen gav:
    - `Entry not found ... in table/view TRDIR`
  - försök att radera via ADT gav:
    - `User CODEX is currently editing ...`
  - detta visar att resterna inte längre är vanliga aktiva programobjekt, utan inaktiva repository-artefakter som måste städas innan task/request kan släppas
- manuell aktivering i SAP kan räcka för att få loss en äldre request som annars blockerats av inaktiva artefakter
  - verifierat exempel: `A4HK900256`
  - efter manuell aktivering av programmet i requesten gick requesten att frisläppa
- samma princip är nu verifierad med MCP på ett konkret äldre requestspår:
  - request `A4HK900206`
  - underliggande objekt `Z_MCP_PKG_LIST2`
  - ADT-aktivering av programmet gick rent
  - task `A4HK900207` gick att släppa via ADT
  - requesthuvudet fastnade fortfarande i ADT med `E_TRKORR`
  - därefter uppdaterades det befintliga hjälpprogrammet `Z_MCP_RELREQ_UTL`
  - `TRINT_RELEASE_REQUEST` kördes för bara `A4HK900206`
  - efterföljande `GET` visade `R / Released`
  - detta verifierar en fungerande fallbackmodell:
    1. aktivera verkligt objekt
    2. släpp task via ADT
    3. släpp huvudrequest via FM-hjälpprogram om ADT fortfarande låser `E_TRKORR`
- samma fallbackmodell är nu också verifierad för:
  - `A4HK900212` med objekt `Z_MCP_OBJDIR_CHECK`
  - `A4HK900236` med objekt `Z_MCP_PROBE_ACT26484`
  - i båda fallen blev slutstatus `R / Released`
- ett gammalt blockerfall kunde därefter lösas via task-cleanup:
  - `A4HK900130` med objekt `Z_MCP_SCAFF_RUN2`
  - första aktiveringsresultatet visade:
    - `Type "ZCL_MCP_SCAFF_SVC2" is unknown.`
  - direkt `PUT` mot `source/main` svarade:
    - `404`
    - `Z_MCP_SCAFF_RUN2 does not exist`
  - slutsats:
    - objektet beter sig som inactive-only eller som en trasig taskreferens
  - verifierad lösning:
    - läs tasken med `TR_READ_REQUEST`
    - ta bort objektposten med `TRINT_DELETE_COMM_OBJECT_KEYS`
    - släpp sedan task och request med `TRINT_RELEASE_REQUEST`
  - slutstatus blev `R / Released`
- `A4HK900246` med objekt `Z_MCP_ACTFIX48118` såg först ut som samma blockerfall men visade sig vara ett reparerbart syntaxfel:
  - första indikationen var bara `REPS ... inactive`
  - den verkliga orsaken fanns i `activation/results/...`
  - konkret fel:
    - `\"'Z_MCP_STEP90630'\" is invalid here (due to grammar)`
    - programraden innehöll felaktigt `obj_name = @'Z_MCP_STEP90630'`
  - viktig CTS-detalj:
    - objektet var låst på huvudrequesten `A4HK900246`
    - omskrivning mot task `A4HK900247` nekades
    - rättning behövde sparas med `corrNr = A4HK900246`
  - efter omskrivning på rätt request blev objektet aktivt och både task och request kunde frisläppas
- samma fallbackmodell är nu också verifierad för:
  - `A4HK900138` med objekt `Z_MCP_DELETE_TMP5`
  - objektet aktiverades rent
  - tasken släpptes
  - requesthuvudet gick till `R / Released` via FM-fallback efter `E_TRKORR`
- ett mellanfall är verifierat för:
  - `A4HK900136` med objekt `Z_MCP_DELETE_TMP4`
  - objektet finns och kan läsas
  - requesten ser tekniskt nära release ut
  - men flera omskrivningar av temporära releasehjälpprogram föll med:
    - `451 REASON_451`
    - `connection closed (no data)`
  - det pekar på ett separat ADT-instabilitetsfall för hjälpprogramsaktivering, inte nödvändigtvis på fel i själva requestobjektet
- MCP-klienten är nu hårdad för detta ADT-fall:
  - `activateObject(...)` retryar transient `451 / connection closed (no data)`
  - sessionen återställs mellan försöken
  - detta behövdes för att kunna köra längre cleanup- och releaseflöden stabilt
- storskalig transportstädning är nu verifierad:
  - först släpptes äldre en-objektsrequestar
  - därefter städades kvarvarande requestar i batch genom:
    1. läsa taskinnehåll via `TR_READ_REQUEST`
    2. ta bort taskobjekt via `TRINT_DELETE_COMM_OBJECT_KEYS`
    3. släppa task och request via `TRINT_RELEASE_REQUEST`
  - denna modell verifierades även för de sista större requestarna:
    - `A4HK900280`
    - `A4HK900283`
    - `A4HK900287`
  - slutresultat:
    - inga `Modifiable` transportrequestar återstod för användaren `CODEX`
- verifierat pilotfall `A4HK900174` visar samtidigt en hårdare resttyp:
  - objekt: `Z_MCP_SHLP_ZMCP_SCARR_HELP20`
  - ADT-aktivering på både program-URI och include-URI kunde köras
  - omskrivning av samma källa via `writeObject(... activateAfterWrite = true)` kunde också köras
  - ändå blockerade task-release fortfarande med:
    - `Object REPS Z_MCP_SHLP_ZMCP_SCARR_HELP20 is inactive`
  - efterföljande SAP-verifiering visade dock att requesten innehöll en hänvisning till ett icke existerande objekt
  - när hänvisningen raderades manuellt i tasken gick transporten att frisläppa
  - korrekt tolkning är därför:
    - vissa blockerfall är felaktiga kvarhängande transportreferenser
    - de ska städas i taskinnehållet
    - de är inte nödvändigtvis bevis på att ADT-aktivering i sig är otillräcklig

Verifierat objekt:
- `A4HK900287`

## Verifierade objektspår

### Paket
- Skapande fungerar via `POST /packages`
- för transporterat paket i denna miljö måste package-XML ligga nära systemets egen GET-representation
- verifierade nödvändiga attribut i payloaden:
  - `adtcore:responsible`
  - `adtcore:masterLanguage`
  - `adtcore:masterSystem`
  - `adtcore:descriptionTextLimit`
  - `adtcore:language="EN"`
- verifierad fungerande kombination för transporterat utvecklingspaket:
  - `pak:packageType="development"`
  - `pak:isAddingObjectsAllowed="false"`
  - `pak:recordChanges="true"`
  - `pak:softwareComponent="HOME"`

Verifierat objekt:
- `Z_MCP_TPK249520`
- `Z_MCP_TPK66547`

### Program
- Skapande fungerar via `POST /programs/programs`
- Källan uppdateras via `.../source/main`
- Aktivering fungerar via ADT activation
- Körning fungerar via:
  - `POST /sap/bc/adt/programs/programrun/{programname}`
  - kräver giltig CSRF-token

Verifierade objekt:
- `Z_MCP_FLIGHT_DEMO`
- `Z_MCP_SFLIGHT_TF_RUN`
- `Z_MCP_FILL_SIMPLE_TAB`
- `Z_MCP_SCAFF_RUN4`
- `Z_MCP_TPRG49520` i paket `Z_MCP_TPK249520`
- `Z_MCP_FIX74986`
- `Z_MCP_TPR66547` i paket `Z_MCP_TPK66547`
- create-med-källa i ett enda `POST /programs/programs` är också verifierat som tekniskt möjligt:
  - testobjekt: `Z_MCP_CRTSRC48211`
  - källan kunde skickas i create-XML via `abapsource:source`
  - objektet kunde därefter läsas via ADT utan separat `PUT`
- men även detta objekt återfanns först i listan över inaktiva objekt
  - slutsats: create-med-källa ensam löser inte problemet med inaktiv version
- problemet är nu löst i `0.8.0`:
  - `activation/runs` måste anropas med full ADT-URI under `/sap/bc/adt/...`
  - objektreferensen måste ha korrekt `adtcore:type`, till exempel `PROG/P`
  - relativ URI utan typ gav verifierat `200 OK` men ingen faktisk aktivering
  - med full URI + typ försvinner den inaktiva programversionen
- rena `createProgram(...)` autoaktiverar nu det skapade programskalet
- `writeObject(... activateAfterWrite: true)` lämnar inte längre kvar inaktiv programversion
- ytterligare verifierat transportfynd:
  - testobjekt som `Z_MCP_CLEAN_CHECK` kan bli kopplade till MCP-användarens request/task
  - ADT visar då lås/ägarskap på request/task-nivå för den användaren
  - i SE80 kan objektet ändå tas upp i WorkList och aktiveras vidare i samma transportspår
  - detta är inte önskat slutbeteende för en återanvändbar MCP-lösning och måste behandlas som en designbugg i transporthanteringen

### Klass
- Skapande fungerar via `POST /oo/classes`
- Källan uppdateras via `.../source/main`
- Aktivering fungerar via ADT activation

Verifierade objekt:
- `ZCL_MCP_FLIGHT_SERVICE`
- `ZCL_MCP_SFLIGHT_TF`
- `ZCL_MCP_CLASSRUN_DEMO` skapades och aktiverades
- `ZCL_MCP_SCAFF_SVC4`
- `ZCL_MCP_C36633`

Ytterligare verifierat i `0.8.0`:
- `POST /oo/classes` kan i denna miljö svara med ett SAP-låsfel trots att objektet faktiskt har skapats
- feltexten innehåller då `already locked in request ... of user CODEX`
- MCP:n återhämtar sig nu från detta genom att:
  - kontrollera att objektet faktiskt finns
  - nollställa stateful session om ADT svarar `Session timed out`
  - aktivera klassen i nästa steg
- resultatet är att klasskapande inte lämnar kvar inaktiv artefakt
- Dumpen i `Dump1.txt` bekräftade den tidigare felorsaken:
  - `CX_OO_LOCKED_IN_OTHER_REQUEST`
  - `CX_OO_SOURCE_SAVE_FAILURE`
  - låset uppstod i `PRETTY_PRINTER`
  - objektet `ZCL_MCP_E21925` försökte sparas mot request `A4HK900280`
- efter att standard-`corrNr` låstes till huvudrequesten och samma create-spår kördes igen verifierades ett nytt objekt utan dump och utan inaktiv artefakt:
  - `ZCL_MCP_F84161`

### DDLS
- Skapande fungerar via `POST /ddic/ddl/sources`
- Källan uppdateras via `.../source/main`
- Table function är i denna miljö fortfarande en DDLS-källa med typ `DDLS/DF`
- DDLS-metadata visar uttryckligen `ddl:source_type="table function"` för table functions
- tomma DDLS-shells ska inte autoaktiveras
  - SAP lägger då objektet direkt i inactive-listan
  - shell ska skapas först
  - riktig aktivering ska ske först efter `writeObject(...)`

Verifierade objekt:
- `ZI_MCP_SFLIGHT`
- `ZI_MCP_SFLIGHT_TF`
- `ZI_MCP_SCAFF_FLT5`
- `ZI_MCP_E2E_FLB287`
- `ZI_MCP_E2E_TF287`
- `ZI_MCP_E2E_FLC287`
- `ZC_MCP_E2E_FL287`

### DCL

Det som är verifierat:
- create fungerar via:
  - `POST /sap/bc/adt/acm/dcl/sources`
- create-namespace måste vara:
  - `http://www.sap.com/adt/acm/dclsources`
- verifierad objekttyp:
  - `DCLS/DL`
- tomt DCL-shell ska inte autoaktiveras

Verifierat objekt:
- `ZC_MCP_E2E_FL287`

### DDLX

Det som är verifierat:
- create fungerar via:
  - `POST /sap/bc/adt/ddic/ddlx/sources`
- create-namespace måste vara:
  - `http://www.sap.com/adt/ddic/ddlxsources`
- verifierad objekttyp:
  - `DDLX/EX`
- tomt DDLX-shell ska inte autoaktiveras

Verifierat objekt:
- `ZC_MCP_E2E_FL287`

### Dataelement
- Skapande fungerar via `POST /ddic/dataelements`
- Själva objektet uppdateras sedan direkt på metadata-URI:n som XML
- Ingen `source/main`

Verifierat objekt:
- `ZMCP_SIMPLE_TEXT`

### Domän
- Skapande fungerar via `POST /ddic/domains`
- Uppdatering sker direkt på metadata-URI:n som XML
- Ingen `source/main`
- Fasta värden fungerar i samma XML-spår via `doma:fixValues`
- Värdetabell kan anges via `doma:valueTableRef`

Verifierat objekt:
- `ZMCP_SIMPLE_DOM`
- `ZMCP_STATUS_DOM3`

### Transparent tabell
- Skapande fungerar via `POST /ddic/tables`
- Källan uppdateras via `.../source/main`

Verifierat objekt:
- `ZMCP_SIMPLE_TAB`

### Struktur
- Skapande fungerar via `POST /ddic/structures`
- Källan uppdateras via `.../source/main`

Verifierat objekt:
- `ZMCP_SIMPLE_STRU`

### Tabelltyp
- Skapande fungerar via `POST /ddic/tabletypes`
- Uppdatering sker direkt på metadata-URI:n som XML
- Ingen `source/main`

Verifierat objekt:
- `ZMCP_SIMPLE_TABTYPE`

## Sökhjälp

Det som är verifierat:
- objekt-typ är `SHLP/DH`
- läsning fungerar via:
  - `GET /sap/bc/adt/vit/wb/object_type/shlpdh/object_name/<name>`
- svarstyp:
  - `application/vnd.sap.adt.basic.object.properties+xml`
- create fungerar via helper-program som använder:
  - `DDIF_TABL_GET`
  - `DDIF_SHLP_PUT`
  - `TRINT_TADIR_INSERT`
  - `DDIF_SHLP_ACTIVATE`
- verifierad fungerande scope:
  - elementary help
  - en indexerad bas-tabell
  - ett nyckelfält
- verifierat exempel:
  - `ZMCP_SCARR_HELP23`
- `TADIR`-rad för MCP-skapad sökhjälp är verifierad
- manuellt referensobjekt för korrekt paketerad sökhjälp:
  - `Z_SEARCHHELP1`

Det som inte är verifierat ännu:
- direkt create-spår via vanlig ADT-DDIC-endpoint
- direkt update-spår via vanlig ADT-DDIC-endpoint

Konsekvens:
- projektet kan nu både läsa och skapa enkel sökhjälp automatiskt
- `read_search_help` kan inte användas som säkert existensbevis, eftersom VIT-URI:n både kan returnera grundmetadata för ofullständiga namn och `500` för MCP-skapade objekt som ändå har aktiv DDIC-definition och `TADIR`-rad

## Table function + AMDP

Verifierad modell:
1. skapa DDLS för table function
2. skriv DDLS-källan
3. skapa klass
4. skriv klasskällan med `FOR TABLE FUNCTION`
5. aktivera DDLS
6. aktivera klass
7. aktivera konsumentprogram

Viktig observation:
- om klassen aktiveras före aktiv DDLS får man följdfel av typen att objektet inte är en table function
- rätt aktiveringsordning är därför avgörande

Verifierade objekt:
- `ZI_MCP_SFLIGHT_TF`
- `ZCL_MCP_SFLIGHT_TF`
- `Z_MCP_SFLIGHT_TF_RUN`
- `ZI_MCP_E2E_TF287`
- `ZCL_MCP_E2E_TF287`

## Classrun

Det som är verifierat:
- discovery exponerar `classrun`
- endpointen finns på:
  - `POST /sap/bc/adt/oo/classrun/{classname}`
- MCP-verktyget `sap_adt_run_class` är implementerat
- en egen klass `ZCL_MCP_CLASSRUN_DEMO` kunde:
  - skapas
  - få källkod
  - aktiveras
- objektstrukturen för klassen visar:
  - `IF_OO_ADT_CLASSRUN`
  - `IF_OO_ADT_CLASSRUN~MAIN`
- runtime fungerar för `ZCL_MCP_CLASSRUN_DEMO`
- verifierad körning via MCP-klienten returnerade:
  - `MCP classrun fungerar.`
  - `Användare: CODEX`
  - `Datum: 20260324`

Notering:
- `CL_DEMO_OUTPUT` svarade med att den inte implementerar `if_oo_adt_classrun~main`
- det visar bara att vanliga hjälpklasser inte automatiskt är körbara via `classrun`

## Tekniska lärdomar

- Stateful ADT-session krävs för DDIC-`PUT`
- `corrNr` behöver ofta skickas redan i första create-anropet i transporterat paket
- `corrNr` behöver i den här miljön även skickas redan i första DDLS-`POST create` för scaffold och andra transporterade CDS-objekt
- för paket med ändringsregistrering bör `corrNr` i den här miljön vara användarens modifiable huvudrequest
- verifierat exempel i containern:
  - request `A4HK900280`
  - task `A4HK900281`
- när `createClass(...)` fick huvudrequesten direkt försvann pretty-printer-dumpen i backend
- tasken `A4HK900281` var alltså fel standardvärde för klasskapande i denna miljö
- aktivering ska göras mot objektets definitions-URI, inte mot `source/main`
- `activation/runs` kräver full ADT-URI och korrekt objekttyp
- om objektreferensen är för tunn kan SAP svara `200 OK` utan att faktisk aktivering körs
- stateful ADT-session kan bli ogiltig efter SAP:s egna låsfel under skapande
  - MCP:n återställer nu session + CSRF och försöker igen i aktiveringsspåret
- delete av source-baserade repository-objekt fungerar med:
  - `LOCK` på definitionsobjektets `source/main`
  - `DELETE` på definitions-URI
  - `lockHandle`
  - `corrNr`
- delete-spåret i MCP-klienten måste använda relativa ADT-URI:er
  - om `resolveDeleteUri` returnerar full `/sap/bc/adt/...` blir bas-URI dubbel och delete misslyckas
- vissa program kan finnas bara som inaktiv version
  - då svarar ADT-delete med fel av typen `does not exist yet in library`
  - det betyder att aktiv biblioteksversion saknas, inte nödvändigtvis att alla spår i repositoryt är borta
- samma MCP-kodbas kan återanvändas mot annan miljö så länge:
  - ADT-bas
  - användare/lösenord
  - ev. URI-template-avvikelser
  justeras i konfigurationen
- `programrun` gör det möjligt att verifiera verklig runtime, inte bara repository-skrivning
- en fysisk tabell kunde fyllas via programkörning med användaren `CODEX`
- scaffold-verktyget kunde skapa en fungerande kedja:
  - DDLS över `SFLIGHT`
  - klass som läser DDLS
  - program som anropar klassen
  - verifierad runtime gav `Flights: 75`
- sökhjälp-verktyget kräver för närvarande:
  - bas-tabell som selection method
  - index-id `0`
  - ett nyckelfält
- försök att lägga icke-indexerade listfält i bas-tabell gav verifierat aktiveringsfel från SAP
- full E2E-kedja kunde byggas och köras i ett nytt paket:
  - request `A4HK900287`
  - package `Z_MCP_E2E_287`
  - basic view `ZI_MCP_E2E_FLB287`
  - table function `ZI_MCP_E2E_TF287`
  - AMDP-klass `ZCL_MCP_E2E_TF287`
  - composite view `ZI_MCP_E2E_FLC287`
  - consumption view `ZC_MCP_E2E_FL287`
  - DCL `ZC_MCP_E2E_FL287`
  - DDLX `ZC_MCP_E2E_FL287`
  - serviceklass `ZCL_MCP_E2E_SVC287`
  - program `Z_MCP_E2E_RUN287`
- verifierad runtime för `Z_MCP_E2E_RUN287` gav 5 flight-rader och korrekt `LOW` från table function-logiken

## Cleanup-fynd från verifieringen

- `ZMCP_STATUS_DOM` skapades först som restobjekt i status `new`, men kunde sedan raderas via korrekt ADT-delete med:
  - låsning
  - `lockHandle`
  - `corrNr`
- `ZMCP_STATUS_DOM2` blockerades först av ett SAP-redigeringslås, men gick i ett senare försök också att radera via samma delete-sekvens
- det verifierar att cleanup av sådana restobjekt fungerar, men att delete-spåret måste ha:
  - låsning
  - `lockHandle`
  - `corrNr`
- två testprogram i `Z_DEV_KODEXPORT` kunde fortfarande läsas som aktiva objekt trots att de tidigare såg ut som rester:
  - `Z_MCP_SCAFF_RUN2`
  - `Z_MCP_SHLP_HELP21`
- ADT-delete mot dessa gav verifierat `403 Forbidden` med SAP-meddelandet:
  - `User CODEX is currently editing ...`
- det betyder att de inte blockeras av transportnumret i första hand, utan av ett riktigt SAP-ENQUEUE-lås på objektet
- försök att radera dem via hjälpprogram med `RS_DELETE_PROGRAM` gav ingen effekt i den här miljön
- praktisk konsekvens:
  - sådana objekt kan kräva manuell upplåsning i `SM12` innan MCP-delete eller ABAP-baserad städning fungerar
  - MCP-projektet bör därför dokumentera skillnaden mellan:
    - ADT-lås som verktyget själv tar och släpper
    - kvarhängande SAP-ENQUEUE-lås som måste lösas separat
- slutlig verifierad status:
  - efter upplåsning/städning i systemet är både `Z_MCP_SCAFF_RUN2` och `Z_MCP_SHLP_HELP21` borttagna
  - fyndet kvarstår som verifierad erfarenhet från cleanup-spåret, inte som kvarstående skräpobjekt
