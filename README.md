# SAP ADT MCP

Reusable MCP server for SAP ADT repository access.

Swedish documentation is preserved in [readme_sv.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/readme_sv.md).

## Status

Version `1.0.0` is the first practical baseline.

The project now supports:

- ADT discovery
- read object source and metadata
- write object source with stateful session handling
- lock and unlock flows
- activation via ADT
- activation log / inactive objects lookup
- object deletion
- transport request creation, listing, inspection, checks, release and deletion
- package creation
- scaffold creation from templates
- creation of program, class, DDLS, DCLS and DDLX
- creation of DDIC objects:
  - data elements
  - domains
  - domains with fixed values and value table
  - transparent tables
  - structures
  - table types
- search help creation through the verified helper-program flow
- ABAP `programrun`
- ABAP `classrun`

The MCP has also been verified externally through Gemini CLI, including:

- transport creation
- package creation
- CDS creation
- table function + AMDP class creation
- service class creation
- executable consumer program creation

## Key Technical Findings

The following behaviour is now verified against SAP and reflected in the implementation:

- activation requires full ADT object URIs and correct `adtcore:type`
- DDIC metadata objects require stateful session handling for `PUT`
- transported package creation often needs `corrNr` already in the initial create step
- tables and structures are written through `.../source/main`
- domains, data elements and table types are written directly through their DDIC object URIs as XML metadata
- search help support is implemented through a verified ABAP helper-program flow
- DCL and DDLX creation require their specific root namespaces
- transport release works best through:
  - `sortandcompress`
  - followed by `newreleasejobs`
- request release must still be verified afterwards with a fresh request read
- default transport handling is now fallback-only:
  1. explicit `transportRequest`
  2. valid `.env` default if still modifiable
  3. automatic lookup if exactly one modifiable workbench request exists
  4. explicit error if several exist

## Main Documents

- [IMPLEMENTATION_README.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/IMPLEMENTATION_README.md)
- [SAP_ADT_MCP_Teknisk_Design.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_Teknisk_Design.md)
- [SAP_ADT_MCP_API_och_Fasning.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_API_och_Fasning.md)
- [SAP_ADT_MCP_Risker_och_Sakerhet.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_Risker_och_Sakerhet.md)
- [SAP_ADT_MCP_Verifierade_Fynd.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_Verifierade_Fynd.md)
- [SAP_ADT_MCP_E2E_Test_20260325.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_E2E_Test_20260325.md)
- [SAP_ADT_MCP_Gemini_Verifiering_20260325.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_Gemini_Verifiering_20260325.md)
- [SAP_ADT_MCP_Transporthantering.md](/mnt/c/users/joaki/ai/abap_codex/SAP_ADT_MCP/SAP_ADT_MCP_Transporthantering.md)

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

This is intentionally a focused SAP ADT MCP, not a generic SAP admin client.

It does not aim to cover:

- GUI automation
- transport import
- broad system administration
- unrestricted mass operations

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
