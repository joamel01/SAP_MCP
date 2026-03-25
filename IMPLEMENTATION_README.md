# SAP ADT MCP – Implementation

This is the working `1.2.0` implementation of an MCP server for SAP ADT.

The implementation was practically verified against `ABAP Cloud Developer Trial 2023 for Docker`.

## Repository Layout

- `src/server.ts`
  MCP tool definitions and stdio startup
- `src/adt-client.ts`
  ADT client with stateful sessions, cookies, CSRF, lock/unlock handling and activation
- `src/config.ts`
  environment variables and defaults
- `config/object-uri-templates.json`
  adjustable URI templates per object type
- `.env.example`
  reusable template for new SAP systems

## What Is New In 1.2.0

Version `1.2.0` consolidates the newest findings from both ABAP Unit verification and the SAPUI5 backend scenario.

New or newly documented in this version:

- the project is now maintained in English
- `sap_adt_get_abap_unit_metadata`
- `sap_adt_run_abap_unit`
- verified ADT discovery for ABAP Unit:
  - `/abapunit/metadata`
  - `/abapunit/testruns`
- verified minimal ABAP Unit run configuration:
  - root `aunit:runConfiguration`
  - `adtcore:objectSets`
  - content type `application/vnd.sap.adt.abapunit.testruns.config.v4+xml`
  - accept type `application/vnd.sap.adt.abapunit.testruns.result.v2+xml`
- raw ABAP Unit execution against the SAP container is verified with the correct XML payload
- external Gemini evaluation is now incorporated as a first-class verification source
- the SAPUI5 demo exercise added one more practical verification layer:
  - CDS basic view
  - CDS consumption view
  - metadata extension
  - backend test report
  - active OData service
  - deployed UI5 app consuming the generated backend

Current limitation:

- ABAP Unit endpoints and payloads are verified
- the current container still returned empty `runResult` XML for the first demo objects
- the MCP therefore returns raw XML plus simple counters rather than over-claiming structured test semantics
- the next improvement should be verification against an ABAP Unit object that returns a populated result payload

## What Was New In 1.1.0

Version `1.1.0` introduced the first ABAP Unit support and captured Gemini's qualitative feedback:

- broad capability coverage
- good dependency handling
- clear enough errors for an AI agent to recover
- ABAP Unit and DCL-heavy scenarios identified as the next high-value areas

## What Was New In 1.0.0

Version `1.0.0` established the first stable practical baseline:

- `sap_adt_create_transport_request`
- `sap_adt_list_transport_requests`
- `sap_adt_get_transport_request`
- `sap_adt_check_transport_request`
- `sap_adt_release_transport_request`
- `sap_adt_delete_transport_request`
- `sap_adt_create_dcls`
- `sap_adt_create_ddlx`
- verified end-to-end scenario with:
  - transport request
  - package
  - basic CDS
  - table function
  - AMDP class
  - composite CDS
  - consumption CDS
  - DCL
  - DDLX
  - service class
  - executable program
- `createDdls`, `createDcls` and `createDdlx` no longer auto-activate empty shell objects
- verified transport cleanup end-to-end for older CODEX requests
- external verification through Gemini CLI

## Earlier Versions

### 0.8.0

- activation switched to `POST /activation/runs`
- activation references now include the full ADT URI and correct `adtcore:type`
- `createProgram` and `createClass` auto-activate the created shell object
- `writeObject(... activateAfterWrite: true)` no longer leaves inactive program versions behind
- session reset and retry were added for `Session timed out` during activation
- `SAP_ADT_DEFAULT_TRANSPORT_REQUEST` became fallback-only

### 0.7.0

- `sap_adt_create_search_help`
- verified helper-program based search help creation using:
  - `DDIF_TABL_GET`
  - `DDIF_SHLP_PUT`
  - `TRINT_TADIR_INSERT`
  - `DDIF_SHLP_ACTIVATE`
- verified scope:
  - elementary search help
  - one indexed base-table field
- `Z_SEARCHHELP1` became the manual reference object for correctly packaged search helps

### 0.6.0

- `sap_adt_delete_object`
- `sap_adt_create_abap_scaffold`
- verified delete sequence for repository objects:
  - `LOCK` on `.../source/main`
  - `DELETE` on the definition URI with `lockHandle` and `corrNr`
- DDLS create in transported packages now supports `corrNr` in the initial `POST`

### 0.5.0 And 0.4.0

These versions established the practical difference between a theoretical and a usable ADT client:

1. open a stateful session
2. fetch a CSRF token
3. lock the object
4. read `LOCK_HANDLE` and, if needed, `CORRNR`
5. `PUT` against the object-specific source or metadata URI
6. unlock the object
7. activate the object

The same iteration also verified that some DDIC objects behave as text-source objects while others behave as XML metadata objects:

- tables: `.../source/main`
- structures: `.../source/main`
- domains: XML metadata directly on the object URI
- data elements: XML metadata directly on the object URI
- table types: XML metadata directly on the object URI

## Available MCP Tools

- `sap_adt_discover`
- `sap_adt_read_object`
- `sap_adt_read_search_help`
- `sap_adt_create_search_help`
- `sap_adt_run_program`
- `sap_adt_run_class`
- `sap_adt_get_abap_unit_metadata`
- `sap_adt_run_abap_unit`
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
- `sap_adt_create_transport_request`
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

## Environment Variables

Required:

- `SAP_ADT_BASE_URL`
- `SAP_ADT_USERNAME`
- `SAP_ADT_PASSWORD`

Common:

- `SAP_ADT_TIMEOUT_MS`
- `SAP_ADT_VERIFY_TLS`
- `SAP_ADT_ALLOWED_PACKAGES`
- `SAP_ADT_ALLOWED_OBJECT_TYPES`
- `SAP_ADT_URI_TEMPLATES_FILE`

Default values for create-tools:

- `SAP_ADT_DEFAULT_MASTER_SYSTEM`
- `SAP_ADT_DEFAULT_ABAP_LANGUAGE_VERSION`
- `SAP_ADT_DEFAULT_SOFTWARE_COMPONENT`
- `SAP_ADT_DEFAULT_SOFTWARE_COMPONENT_DESCRIPTION`
- `SAP_ADT_DEFAULT_TRANSPORT_REQUEST`

## Recommended First Test In A New SAP System

1. Copy `.env.example` to `.env`
2. Fill in ADT base URL, user and password
3. Run `npm install`
4. Run `npm run check`
5. Run `npm run smoke`
6. Test `sap_adt_discover`
7. Test `sap_adt_read_object`
8. Then test a harmless `sap_adt_write_object` against a Z-object

## Verified Container Configuration

The following is verified against the local Docker container `a4h_2023`:

- ADT base:
  - `http://127.0.0.1:50000/sap/bc/adt`
- discovery works
- class source works
- program source works
- DDLS source works
- program creation works
- class creation works
- DDLS creation works
- scaffold creation of program + class + DDLS works
- data element creation works
- domain creation works
- table creation works
- structure creation works
- table type creation works
- stateful `write + activate` works
- empty modifiable transport requests can be created and deleted via ADT
- task release works via ADT
- request release must still be verified afterwards with a fresh `GET`

## Practical Scope Boundary

The latest UI5 demo work clarified an important scope rule for the project:

- this MCP is appropriate for ABAP repository artifacts that later feed SAPUI5 or Fiori applications
- it is not currently the right tool for:
  - UI5 BSP upload
  - `/UI5/APP_INDEX_CALCULATE`
  - Launchpad content maintenance
  - PFCG role maintenance

That boundary is now explicit in the documentation so the MCP is evaluated against the work it actually performs well.
