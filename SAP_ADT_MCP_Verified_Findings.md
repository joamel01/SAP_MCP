# SAP ADT MCP – Verified Findings

The findings in this document were gathered primarily from verification runs against `ABAP Cloud Developer Trial 2023 for Docker`.

## 1. Connectivity And Discovery

- ADT discovery is reachable and usable through HTTP in the target SAP container
- the local container ADT base was verified as:
  - `http://127.0.0.1:50000/sap/bc/adt`
- classes, programs and DDLS objects can be read through verified ADT URIs

## 2. Source Write And Activation

- naive write logic was not sufficient
- reliable repository updates require:
  1. stateful session
  2. CSRF token
  3. lock
  4. `PUT`
  5. unlock
  6. activation
- activation must use a full ADT URI and correct `adtcore:type`
- retry and session reset were needed for transient ADT failures such as:
  - `451 REASON_451`
  - `connection closed (no data)`
- activation input handling is now verified in a more user-friendly form:
  - program activation works with `objectType + objectName`
  - DDLS activation works with `objectType + objectName`
  - source URIs ending in `.../source/main` are normalized automatically before activation
- activation diagnostics are now verified at a more useful external-client level:
  - the MCP follows the activation result link returned by the background run
  - it parses `chkl:properties`
  - it extracts SAP activation messages from `<msg ...>`
  - it returns both a normalized failure category and the raw XML details
- verified failure examples:
  - `ZCL_FLIGHT_CONSUMER` failed because `FLTP` was not accepted as an ABAP type in the generated class source
  - temporary class `ZCL_MCP_ACTDIAG_T1` failed with:
    - category `syntax_or_semantic_error`
    - first relevant message `Type "DOES_NOT_EXIST" is unknown.`
- one more activation hardening was verified:
  - `activationExecuted="false"` is not always a real failure
  - if no `E/A/X` messages exist and the object is not left in the inactive-object log, the MCP now treats that as a no-op success

## 3. DDIC Object Behavior

The SAP container verified two different DDIC update families.

### Source-Main DDIC Objects

- table
- structure

These are updated through `.../source/main`.

### XML-Metadata DDIC Objects

- domain
- data element
- table type

These are updated directly on their DDIC object URIs as XML metadata.

Additional verified DDIC findings:

- domain fixed values are supported
- value table handling is supported
- DDIC `PUT` flows require stateful session handling

## 4. Search Help Creation

- search help create/update through plain DDIC URI guessing was not enough
- the verified practical solution is a helper-program flow using:
  - `DDIF_TABL_GET`
  - `DDIF_SHLP_PUT`
  - `TRINT_TADIR_INSERT`
  - `DDIF_SHLP_ACTIVATE`
- the verified scope is intentionally narrow:
  - elementary search help
  - one indexed base-table field
- `Z_SEARCHHELP1` served as the manual reference object for a correctly packaged search help

## 5. Runtime

- `programrun` works and returns plain text output
- `classrun` works after the implementation details were corrected
- runtime results are suitable for AI consumption because the MCP trims and normalizes the payloads
- runtime output parsing is now verified at a more helpful CLI level:
  - `Z_FLIGHT_DEMO_REPORT` is recognized as `tabular_text`
  - the parser extracts:
    - table title
    - headers
    - first result rows
  - `ZCL_MCP_CLASSRUN_DEMO` is recognized as `key_value_lines`
  - the parser preserves:
    - leading explanatory lines
    - structured `keyValues`
- one higher-level post-activation verification helper now exists:
  - `sap_adt_auto_verify_object`
- verified runtime paths used by the helper:
  - program `Z_FLIGHT_DEMO_REPORT` via `programrun`
  - class `ZCL_MCP_CLASSRUN_DEMO` via `classrun`
- verified explicit ABAP Unit path used by the helper:
  - program `Z_MCP_AUNIT_LV1`

## 6. Transport Handling

Verified:

- transport requests can be created through ADT
- request listing requires `requestStatus` in camelCase
- request detail is readable and exposes request, task and object levels
- empty modifiable requests can be deleted
- task release works
- request release must be treated as a sequence:
  - `sortandcompress`
  - `newreleasejobs`
  - fresh `GET` verification afterwards

Verified cleanup findings:

- older broken requests can require repository cleanup before CTS cleanup
- some tasks contain stale object references rather than real inactive objects
- `TRINT_DELETE_COMM_OBJECT_KEYS` was verified as part of the cleanup story
- `TRINT_RELEASE_REQUEST` served as a working fallback when ADT stalled on `E_TRKORR`
- after the full cleanup campaign, no modifiable CODEX requests remained

## 7. DCL, DDLX And End-To-End CDS Chains

Verified:

- DCL create namespace:
  - `http://www.sap.com/adt/acm/dclsources`
- DDLX create namespace:
  - `http://www.sap.com/adt/ddic/ddlxsources`
- DCL object type:
  - `DCLS/DL`
- DDLX object type:
  - `DDLX/EX`
- shell creation should not auto-activate empty DDLS/DCLS/DDLX objects

The complete CDS/AMDP chain was verified end-to-end with:

- package
- basic CDS
- CDS table function
- AMDP class
- composite CDS
- consumption CDS
- DCL
- DDLX
- service class
- executable program

Dependency-aware activation is now also verified as a separate helper behavior:

- helper tool:
  - `sap_adt_activate_dependency_chain`
- verified order profile:
  - `consumerProgram`
- verified SAP objects:
  - `Z_I_FLIGHT_TABLEFUNC`
  - `Z_I_FLIGHT_VIEW`
  - `ZCL_FLIGHT_CONSUMER`
  - `ZCL_FLIGHT_AMDP`
  - `Z_FLIGHT_DEMO_REPORT`
- the helper correctly reordered a scrambled caller input into:
  1. DDLS
  2. DDLS
  3. class
  4. class
  5. program

Small-set mass activation is now verified as a separate tool behavior:

- tool:
  - `sap_adt_activate_object_set`
- supported modes:
  - `stopOnError=true`
  - `stopOnError=false`
- verified behavior:
  - deterministic execution order is preserved even when the caller sends a scrambled object list
  - when `stopOnError=true`, the tool stops at the first failed activation and reports where it stopped
  - when `stopOnError=false`, the tool continues and returns per-object success and failure results for the full set
- verified SAP case:
  - valid chain members:
    - `Z_I_FLIGHT_TABLEFUNC`
    - `Z_I_FLIGHT_VIEW`
    - `ZCL_FLIGHT_CONSUMER`
    - `Z_FLIGHT_DEMO_REPORT`
  - intentional failure member:
    - `ZCL_MCP_DOES_NOT_EXIST`

Create-time failure normalization is also now verified:

- verified categories:
  - `already_exists`
  - `lock_or_transport_error`
  - `create_failed`
- verified duplicate-object cases:
  - program `ZUI5_R_CARRIER_DEMO_TEST`
  - class `ZCL_FLIGHT_CONSUMER`
  - DDLS `ZUI5_C_CARRIER_DEMO`

## 8. External Gemini Verification

Gemini CLI successfully used the MCP to:

- create a transport
- create a package
- create CDS artifacts
- create a table function and AMDP class
- create a service class
- create an executable consumer program

Verified package:

- `ZGEMINI_MCP_DEMO`

Gemini's qualitative feedback confirmed that:

- the capability breadth is high
- dependency errors are understandable enough for self-correction
- `activateAfterWrite` is particularly effective

A later Gemini `1.3.0` round added stronger verification:

- `sap_adt_activate_object_set` was identified as the biggest workflow improvement because it removed several manual activation turns
- a full CDS -> AMDP -> service -> classrun chain executed successfully
- `sap_adt_run_class` returned real business data from the chain, including carrier data coming from the table-function-backed logic
- clearer object-already-exists errors were good enough for direct autonomous recovery by the client
- URI normalization improvements reduced friction in manual and semi-manual activation calls
- ABAP Unit REST output remained empty in that environment as well, which reinforced the importance of `sap_adt_run_class` as a secondary verification path

## 9. ABAP Unit

Verified:

- ABAP Unit metadata endpoint:
  - `/abapunit/metadata`
- ABAP Unit execution endpoint:
  - `/abapunit/testruns`
- required payload structure:
  - `aunit:runConfiguration`
  - `adtcore:objectSets`
- content type:
  - `application/vnd.sap.adt.abapunit.testruns.config.v4+xml`
- accept type:
  - `application/vnd.sap.adt.abapunit.testruns.result.v2+xml`
- the MCP now parses ABAP Unit output into a structured summary when the payload contains test details
- verified parser support:
  - empty ADT payloads such as `<aunit:runResult .../>`
  - JUnit-style payloads with `testsuites`, `testsuite`, `testcase`, `failure` and `error`
  - ADT payloads are also handled structurally for `testClass`, `testMethod` and `alert` tags when present

Current limitation:

- standard and class-based own-test examples can still return empty `runResult` payloads in this environment
- but one broader live verification path now returns a non-empty payload:
  - program `Z_MCP_AUNIT_LV1`
  - local test class `LTC_REPORT`
  - local test method `BASIC_ASSERTION`
- class-based sibling object `ZCL_MCP_AUNIT_LV1` still returned empty payloads in the same environment
- therefore the richer parser is now verified against:
  - live non-empty ADT payload for a program object
  - live empty ADT payloads for class objects
  - parser verification against `references/abapunit-junit-sample.xml`
- repeatable verification entries now exist:
  - `npm run verify:abapunit`
  - `node dist/verify-abap-unit-live.js --transportRequest=<WORKBENCH_REQUEST>`

## 10. SAPUI5 Backend Scenario

The SAPUI5 demo work produced an important new practical finding:

- the MCP is highly useful for preparing backend artifacts consumed by a UI5 app

Verified through the MCP:

- CDS basic view for the demo service
- CDS consumption view for the demo service
- metadata extension
- backend test report
- active OData service consumed by the app

The exercise also clarified the scope boundary:

- backend repository work belongs in this MCP
- BSP upload does not
- `/UI5/APP_INDEX_CALCULATE` does not
- Launchpad catalog maintenance does not
- PFCG role maintenance does not

## 11. Overall Conclusion

The project is no longer only a technical prototype. It is a practically verified SAP ADT MCP for real repository-centric ABAP development, with a clearly documented edge around non-ADT SAP administration work.
