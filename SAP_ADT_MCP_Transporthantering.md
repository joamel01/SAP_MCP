# SAP ADT MCP – Transporthantering

## Syfte

Det här dokumentet beskriver hur CTS-requestar och tasks nu hanteras via `SAP_ADT_MCP`.

## Nya verktyg

- `sap_adt_create_transport_request`
- `sap_adt_list_transport_requests`
- `sap_adt_get_transport_request`
- `sap_adt_check_transport_request`
- `sap_adt_release_transport_request`
- `sap_adt_safe_release_transport_request`
- `sap_adt_delete_transport_request`
- `sap_adt_apply_transport_policy`

## Rekommenderat arbetsflöde

1. Lista requests med:
   - `sap_adt_list_transport_requests`
   - normalt med `requestStatus = D`
2. Läs detalj på relevanta requests med:
   - `sap_adt_get_transport_request`
3. Kör consistency check när requesten ser klar ut:
   - `sap_adt_check_transport_request`
4. Releasa först task, därefter request:
   - `sap_adt_safe_release_transport_request`
5. Verifiera alltid resultatet med en ny detaljläsning:
   - `sap_adt_get_transport_request`
6. Radera bara requests/tasks som fortfarande är modifiable och som du vet är rena:
   - `sap_adt_delete_transport_request`

För snabbare arbete finns nu även:

- `sap_adt_apply_transport_policy`
  - `analyze`
  - `applyDeletes`
  - `applyReleases`

## Viktiga fynd

- Listning av modifiable requests kräver:
  - `targets=`
  - `requestStatus=D`
- `requestStatus` är camelCase i query-parametrarna.
- Detaljsvaret innehåller:
  - requesthuvud
  - tasks
  - objektlista
- Tom modifiable request kan raderas direkt via `DELETE`.
- Release-svaret från SAP är inte alltid tillräckligt för att avgöra verkligt slutläge.
  - En request kan hamna i status `R` även om release-svaret innehåller ett fel i checkrun-delen.
  - Därför måste status alltid efterkontrolleras med ny `GET`.
- Verifierad request-release kräver i denna miljö:
  - `sortandcompress`
  - därefter `newreleasejobs`
  - båda med XML-body som innehåller `tm:number`
- `releasejobs` gav verifierat `200 OK` utan faktisk release och ska inte användas för request-release.
- Request-för-request `sap_adt_safe_release_transport_request` fungerar nu också praktiskt för större batcher av äldre generated requests.
  - Batch 2 verifierade bland annat release av:
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
  - `sortandcompress = 400` betyder inte automatiskt att requesten misslyckas.
  - Slutstatus måste alltid verifieras med `GET`.
- För äldre testrequestar räckte inte alltid aktivering av underliggande objekt.
  Ett fullt verifierat cleanup-spår är nu:
  1. läs tasken via `TR_READ_REQUEST`
  2. ta bort irrelevanta objektposter via `TRINT_DELETE_COMM_OBJECT_KEYS`
  3. släpp tasken
  4. släpp requesten
  5. använd `TRINT_RELEASE_REQUEST` som fallback när ADT fortfarande fastnar på `E_TRKORR`
- Den modellen verifierades även i batch mot de sista större testrequestarna:
  - `A4HK900280`
  - `A4HK900283`
  - `A4HK900287`
- Slutresultatet av hela städningen blev:
  - inga `Modifiable` transportrequestar återstod för användaren `CODEX`
- Ett separat klientfynd är också verifierat:
  - ADT kan ge transient
    - `451 REASON_451`
    - `connection closed (no data)`
  - `AdtClient.activateObject(...)` har därför fått retry + session-reset för just detta fall

## Kvarvarande begränsning

- Helt färska requests som skapas, fylls och släpps i samma script kan fortfarande fastna med:
  - `Requested object E_TRKORR is currently locked by user CODEX`
- Verifierat färskt specialfall:
  - `A4HK900298`
- Den kvarvarande begränsningen gäller alltså främst omedelbar request-release i samma automatiserade körning, inte äldre requestar generellt.
