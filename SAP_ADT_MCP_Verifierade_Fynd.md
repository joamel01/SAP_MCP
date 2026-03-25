# SAP ADT MCP – Verified Findings

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

Current limitation:

- the first verified demo objects in the container returned empty `runResult` payloads
- therefore the MCP returns raw XML plus simple counters, not over-structured test semantics

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
