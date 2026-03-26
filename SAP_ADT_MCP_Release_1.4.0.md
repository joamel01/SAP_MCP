# SAP ADT MCP – Release 1.4.0

## Intent

Version `1.4.0` is the stabilization release after the large feature-expansion phase.

The main goal of this version is not breadth. It is to make the MCP easier to operate, easier to verify and easier to reuse as a stable baseline.

## Main Additions

- workspace-roots lookup through:
  - `sap_adt_get_workspace_roots`
- expanded documentation search through:
  - `sap_adt_search_docs`
  - now supports:
    - project documentation
    - optional workspace-root Markdown search
- reference-suite verification script:
  - `npm run verify:reference`
- reference-suite document:
  - `SAP_ADT_MCP_Reference_Suite.md`

## Why This Matters

- clients can now expose their workspace context to the MCP when they support roots
- the MCP can now search both its own verified documentation and client workspace Markdown notes
- regression checks no longer depend only on ad-hoc manual testing
- the project now has a clearer operational baseline for future smaller releases

## Recommended Baseline Workflow

1. `npm run check`
2. `npm run build`
3. `npm run smoke`
4. `npm run verify:reference`
5. use the MCP from an external client such as Gemini for one real object flow
