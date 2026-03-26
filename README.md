# SAP ADT MCP

Reusable MCP server for SAP ADT repository access.

The project is now maintained in English. The earlier Swedish overview is preserved in [readme_sv.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/readme_sv.md).

## Status

Version `1.3.0` is the current working baseline.

The practical verification work in this repository was carried out against `ABAP Cloud Developer Trial 2023 for Docker`.

The MCP now covers the main repository-centric SAP ADT workflows needed by an AI coding agent:

- ADT discovery
- read object source and metadata
- write object source with stateful session handling
- lock and unlock flows
- activation and activation log lookup
- dependency-aware activation helper for small known object chains
- small-set mass activation with optional stop-on-error behavior
- object deletion
- transport request creation, listing, inspection, checks, release and deletion
- package creation
- scaffold creation from templates
- creation of program, class, DDLS, DCLS and DDLX
- creation of DDIC objects:
  - data elements
  - domains
  - domains with fixed values and value tables
  - transparent tables
  - structures
  - table types
- search help creation through the verified helper-program flow
- ABAP Unit metadata lookup
- ABAP Unit execution for one class or executable program
- ABAP `programrun`
- ABAP `classrun`
- CLI-friendly runtime output summaries for `programrun` and `classrun`
- one-step post-activation verification for runnable programs and classrun classes

## Newly Consolidated Findings In 1.3.0

This version incorporates the most important lessons from the latest verification rounds:

- ABAP Unit metadata and execution endpoints are verified and exposed as MCP tools.
- ABAP Unit payload structure is confirmed, and the MCP now parses structured result summaries when the payload supports it.
- Broader live ABAP Unit verification now confirmed one non-empty ADT payload path in this environment:
  - a program with local test classes returned structured `aunit:runResult` XML
  - class-based own tests still returned empty payloads in the same container
- External verification through Gemini CLI confirmed that the MCP is usable from a real third-party MCP client, not only through local direct scripts.
- A later external Gemini verification round on `1.3.0` confirmed a full runtime chain through `sap_adt_run_class`:
  - AMDP table function returned carrier data
  - CDS consumer view joined flight data with the table function result
  - the service class consumed the CDS layer successfully
  - the resulting classrun output proved that the end-to-end backend chain was not only activatable but also executable
- A full SAPUI5 backend preparation flow was verified through the MCP:
  - CDS basic view
  - CDS consumption view
  - metadata extension
  - test report
  - active OData service used by a deployed UI5 app
- That same UI5 exercise also clarified a scope boundary:
  - the MCP is strong for ABAP backend artifacts consumed by UI5 apps
  - BSP upload, app index rebuild, Launchpad content setup and PFCG role work remain separate SAP administration steps outside the current ADT-only scope

## Key Technical Findings

The following behavior is verified against SAP and reflected in the implementation:

- activation requires full ADT object URIs and correct `adtcore:type`
- `sap_adt_activate_object` now normalizes common caller inputs internally:
  - `objectType + objectName`
  - direct definition URI
  - `.../source/main` URI
- `sap_adt_activate_dependency_chain` now supports deterministic helper ordering for:
  - mixed DDLS + class + program stacks
  - DDLS + DCL + DDLX stacks
- `sap_adt_activate_object_set` now supports deterministic activation of a small mixed object list with:
  - `stopOnError=true` for first-failure stop behavior
  - `stopOnError=false` for full per-object result collection
- external Gemini feedback confirmed that this mass-activation flow is the biggest practical ergonomics improvement in `1.3.0`
- `sap_adt_run_program` and `sap_adt_run_class` now return:
  - raw output
  - `parsedOutput`
  - table-like summaries for plain-text list output when feasible
  - key/value summaries for classrun-style output when feasible
- activation diagnostics now fetch the linked activation result and return:
  - a short normalized failure category
  - a compact summary with the first relevant SAP error
  - raw activation result XML
  - raw activation run XML
- DDIC metadata objects require stateful session handling for `PUT`
- transported package creation often needs `corrNr` already in the initial create step
- tables and structures are written through `.../source/main`
- domains, data elements and table types are written directly through their DDIC object URIs as XML metadata
- search help support is implemented through a verified ABAP helper-program flow
- ABAP Unit metadata is exposed through `/abapunit/metadata`
- ABAP Unit execution is exposed through `/abapunit/testruns`
- `sap_adt_run_abap_unit` now returns:
  - raw XML
  - parsed result format (`empty`, `adt-aunit`, `junit`, `unknown`)
  - structured test classes
  - structured test methods
  - failure messages when present
- the local Docker trial now also has one verified live ABAP Unit reference object:
  - program `Z_MCP_AUNIT_LV1`
  - local test class `LTC_REPORT`
  - local test method `BASIC_ASSERTION`
- the verified ABAP Unit payload requires:
  - root element `aunit:runConfiguration`
  - `adtcore:objectSets`
  - content type `application/vnd.sap.adt.abapunit.testruns.config.v4+xml`
  - accept type `application/vnd.sap.adt.abapunit.testruns.result.v2+xml`
- DCL and DDLX creation require their specific root namespaces
- transport release works best through:
  - `sortandcompress`
  - followed by `newreleasejobs`
- request release must still be verified afterwards with a fresh request read
- default transport handling is fallback-only:
  1. explicit `transportRequest`
  2. valid `.env` default if still modifiable
  3. automatic lookup if exactly one modifiable workbench request exists
  4. explicit error if several exist
- the `ZCL_FLIGHT_CONSUMER` verification case confirmed that this richer activation path now exposes real repository errors, such as:
  - unknown ABAP type names in generated class source
  - partially generated consumer programs that need follow-up content fixes
- create-time collisions are now normalized more clearly for external clients:
  - `already_exists`
  - `lock_or_transport_error`
  - `create_failed`
- the later Gemini verification also confirmed that `sap_adt_run_class` is an important secondary verification path when ABAP Unit REST results stay empty in a given SAP environment
- dependency-helper verification also confirmed one activation edge case:
  - `activationExecuted="false"` without real errors can still be acceptable when the object is not left inactive afterwards

## Main Documents

Historical filenames are preserved, but the document contents are now in English.

- [IMPLEMENTATION_README.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/IMPLEMENTATION_README.md)
- [SAP_ADT_MCP_Technical_Design.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_Technical_Design.md)
- [SAP_ADT_MCP_API_and_Phasing.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_API_and_Phasing.md)
- [SAP_ADT_MCP_Risks_and_Security.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_Risks_and_Security.md)
- [SAP_ADT_MCP_Verified_Findings.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_Verified_Findings.md)
- [SAP_ADT_MCP_ABAP_Unit_Verification.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_ABAP_Unit_Verification.md)
- [SAP_ADT_MCP_Dependency_Activation.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_Dependency_Activation.md)
- [SAP_ADT_MCP_Mass_Activation.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_Mass_Activation.md)
- [SAP_ADT_MCP_Auto_Verify.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_Auto_Verify.md)
- [SAP_ADT_MCP_Examples.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_Examples.md)
- [SAP_ADT_MCP_Demo_Package.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_Demo_Package.md)
- [SAP_ADT_MCP_E2E_Test_20260325.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_E2E_Test_20260325.md)
- [SAP_ADT_MCP_Gemini_Verification_20260325.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_Gemini_Verification_20260325.md)
- [SAP_ADT_MCP_Transport_Handling.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_Transport_Handling.md)

## Reuse In Another SAP Environment

You normally only need to adjust:

- `SAP_ADT_BASE_URL`
- `SAP_ADT_USERNAME`
- `SAP_ADT_PASSWORD`
- `SAP_ADT_VERIFY_TLS`
- `SAP_ADT_ALLOWED_PACKAGES`
- `SAP_ADT_DEFAULT_TRANSPORT_REQUEST` if you intentionally want a fallback request
- `config/object-uri-templates.json` if your ADT object paths differ

Optional defaults:

- `SAP_ADT_DEFAULT_MASTER_SYSTEM`
- `SAP_ADT_DEFAULT_ABAP_LANGUAGE_VERSION`
- `SAP_ADT_DEFAULT_SOFTWARE_COMPONENT`
- `SAP_ADT_DEFAULT_SOFTWARE_COMPONENT_DESCRIPTION`

## Gemini CLI

Basic flow:

1. Run `npm install`
2. Run `npm run build`
3. Configure `.env`
4. Start the wrapper:
   - [scripts/run-sap-adt-mcp.sh](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/scripts/run-sap-adt-mcp.sh)
5. Register the server in Gemini CLI
   - example: [gemini-settings.example.json](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/gemini-settings.example.json)

ABAP Unit verification bundle:

- build:
  - `npm run build`
- run:
  - `npm run verify:abapunit`
- broader live run:
  - `node dist/verify-abap-unit-live.js --transportRequest=<WORKBENCH_REQUEST>`
- reference document:
  - [SAP_ADT_MCP_ABAP_Unit_Verification.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_ABAP_Unit_Verification.md)

## Scope

This is intentionally a focused SAP ADT MCP, not a generic SAP administration client.

It does not aim to cover:

- GUI automation
- transport import
- broad system administration
- unrestricted mass operations
- BSP repository upload
- Launchpad catalog maintenance
- PFCG role maintenance

## Verified Against The Local SAP Container

Verified end-to-end:

- repository read/write
- activation
- package creation
- transport creation
- DDIC creation
- CDS + AMDP + consumer chain
- program execution
- class execution
- transport cleanup and release workflows
- ABAP Unit metadata and raw execution
- backend artifact creation for a working SAPUI5 demo app
