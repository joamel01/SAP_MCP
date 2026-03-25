# SAP ADT MCP – API och fasning

## Rekommenderade MCP-verktyg

### `sap_adt_discover`

Syfte:

- verifiera att ADT är nåbart
- visa grundläggande kapabiliteter

Input:

- inget eller systemscope

Output:

- status
- system
- bas-URI
- discovery-resultat

### `sap_adt_read_object`

Syfte:

- läsa repository-objekt

Input:

- `object_type`
- `object_name`
- ev. `package`

Output:

- `uri`
- `content`
- `content_type`
- `metadata`

### `sap_adt_write_object`

Syfte:

- uppdatera objektinnehåll

Input:

- `object_type`
- `object_name`
- `content`
- ev. `uri`

Output:

- skrivresultat
- objekt-URI

### `sap_adt_delete_object`

Syfte:

- radera repository- eller DDIC-objekt via ADT

Input:

- `object_type`
- `object_name` eller `uri`
- ev. `transport_request`

Output:

- delete-status
- rått ADT-svar

### `sap_adt_create_transport_request`

Syfte:

- skapa en ny transportrequest via ADT

Input:

- `description`
- ev. `request_type`
- ev. `owner`
- ev. `target`
- ev. `source_client`

Output:

- create-svar med nytt requestnummer

### `sap_adt_list_transport_requests`

Syfte:

- lista transportrequests via CTS-ADT med filtrering på status, typ och ägare

Input:

- ev. `requestStatus`
- ev. `requestType`
- ev. `owner`

Output:

- parsad lista över requests
- rått XML-svar

### `sap_adt_get_transport_request`

Syfte:

- läsa en request eller task i detalj, inklusive tasks och objekt

Input:

- `requestNumber`

Output:

- requesthuvud
- tasks
- objektlista
- rått XML-svar

### `sap_adt_check_transport_request`

Syfte:

- köra consistency check för en request eller task

Input:

- `requestNumber`

Output:

- rått checklist-svar från ADT

### `sap_adt_release_transport_request`

Syfte:

- releasa en request eller task via CTS-ADT

Input:

- `requestNumber`
- ev. `mode`
  - `standard`
  - `ignoreLocks`
  - `ignoreWarnings`
  - `ignoreAtc`

Output:

- release-svar från ADT

### `sap_adt_delete_transport_request`

Syfte:

- radera en modifiable request eller task via CTS-ADT

Input:

- `requestNumber`

Output:

- delete-svar från ADT

### `sap_adt_apply_transport_policy`

Syfte:

- lista användarens requests
- klassificera dem till `keep`, `release`, `delete` eller `review`
- och valfritt utföra säkra delete- eller release-åtgärder enligt policyn

Input:

- ev. `owner`
- ev. `maxRequests`
- ev. `keepRequestNumbers`
- ev. `mode`
  - `analyze`
  - `applyDeletes`
  - `applyReleases`
- ev. `includeReleased`

Output:

- sammanfattning per klass
- klassificering per request
- utförda åtgärder

### `sap_adt_create_ddls`

Syfte:

- skapa ett DDLS-shell via ADT

Input:

- `ddl_name`
- `description`
- `package_name`
- ev. `transport_request`

Output:

- create-svar för shell-objektet

### `sap_adt_create_dcls`

Syfte:

- skapa ett DCL-shell via ADT

Input:

- `dcl_name`
- `description`
- `package_name`
- ev. `transport_request`

Output:

- create-svar för shell-objektet

### `sap_adt_create_ddlx`

Syfte:

- skapa ett DDLX-shell via ADT

Input:

- `ddlx_name`
- `description`
- `package_name`
- ev. `transport_request`

Output:

- create-svar för shell-objektet

### `sap_adt_create_abap_scaffold`

Syfte:

- skapa ett litet återanvändbart ABAP-paket från mallar

Input:

- `package_name`
- `program_name`
- `class_name`
- `ddl_name`
- ev. `source_table_name`
- ev. `transport_request`

Output:

- stegvis resultat för package/program/class/DDLS och efterföljande write/activate

### `sap_adt_create_search_help`

Syfte:

- skapa en enkel DDIC-sökhjälp via ett verifierat helper-programspår

Input:

- `search_help_name`
- `description`
- `package_name`
- `selection_method`
- `key_field_name`
- ev. `helper_program_name`

Output:

- stegvis resultat för hjälpprogram och körning
- körutdata från hjälpprogrammet med `SHLP_PUT`, `TADIR_INSERT`, `SHLP_ACT` och `SHLP_GET`

### `sap_adt_activate_object`

Syfte:

- aktivera objekt

Input:

- `uri`

Output:

- aktiveringsstatus
- översiktligt felutfall

### `sap_adt_get_activation_log`

Syfte:

- läsa syntax- och aktiveringsfel

Input:

- `uri`
- eller aktiveringsreferens

Output:

- lista med fel
- rad/kolumn där möjligt
- rå logg vid behov

## Fasindelning

### Fas 1 – Läsning

Leverera:

- `sap_adt_discover`
- `sap_adt_read_object`

Nytta:

- jag kan läsa objekt direkt från systemet
- jämföra lokala filer mot systeminnehåll

### Fas 2 – Skriv och aktivering

Leverera:

- `sap_adt_write_object`
- `sap_adt_activate_object`
- `sap_adt_get_activation_log`

Nytta:

- full AI-assisterad utvecklingsloop mot repositoryt

### Fas 3 – Bekvämlighet

Leverera:

- `sap_adt_list_package_objects`
- `sap_adt_find_object`
- `sap_adt_bulk_read`
- `sap_adt_create_transport_request`
- `sap_adt_create_ddls`
- `sap_adt_create_dcls`
- `sap_adt_create_ddlx`
- högre nivå-scaffold via `sap_adt_create_abap_scaffold`
- enkel DDIC-sökhjälp via `sap_adt_create_search_help`

Nytta:

- bättre överblick
- snabbare kodgranskning och refaktorering

## Rekommenderade spärrar

Följande bör byggas in från start:

- allowlist för paket
- allowlist för objekttyper
- blockering av massoperationer
- revisionslogg per write/activate
- tydlig markering av vem som gjorde vad

## Praktiskt startförslag

Bygg först en prototyp som bara stöder:

- ett system
- ett tekniskt konto
- en package-allowlist
- `read`, `write`, `activate`, `log`

Det räcker för att avgöra om resten är värt att industrialisera.
