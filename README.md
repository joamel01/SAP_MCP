# SAP ADT MCP

Reusable MCP server for SAP ADT repository access.

The project is now maintained in English. The earlier Swedish overview is preserved in [readme_sv.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/readme_sv.md).

## Status

Version `1.2.0` is the current practical baseline.

The practical verification work in this repository was carried out against `ABAP Cloud Developer Trial 2023 for Docker`.

The MCP now covers the main repository-centric SAP ADT workflows needed by an AI coding agent:

- ADT discovery
- read object source and metadata
- write object source with stateful session handling
- lock and unlock flows
- activation and activation log lookup
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

## Newly Consolidated Findings In 1.2.0

This version incorporates the most important lessons from the latest verification rounds:

- ABAP Unit metadata and execution endpoints are verified and exposed as MCP tools.
- ABAP Unit payload structure is confirmed, but the current SAP container still returned empty `runResult` data for the initial demo objects. The MCP therefore returns raw XML plus simple counters instead of pretending to provide full semantic parsing.
- External verification through Gemini CLI confirmed that the MCP is usable from a real third-party MCP client, not only through local direct scripts.
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
- DDIC metadata objects require stateful session handling for `PUT`
- transported package creation often needs `corrNr` already in the initial create step
- tables and structures are written through `.../source/main`
- domains, data elements and table types are written directly through their DDIC object URIs as XML metadata
- search help support is implemented through a verified ABAP helper-program flow
- ABAP Unit metadata is exposed through `/abapunit/metadata`
- ABAP Unit execution is exposed through `/abapunit/testruns`
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

## Main Documents

Historical filenames are preserved, but the document contents are now in English.

- [IMPLEMENTATION_README.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/IMPLEMENTATION_README.md)
- [SAP_ADT_MCP_Technical_Design.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_Technical_Design.md)
- [SAP_ADT_MCP_API_and_Phasing.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_API_and_Phasing.md)
- [SAP_ADT_MCP_Risks_and_Security.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_Risks_and_Security.md)
- [SAP_ADT_MCP_Verified_Findings.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_Verified_Findings.md)
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
