# SAP ADT MCP – Gemini Verification 2026-03-25

## Goal

Verify that the MCP works from an external MCP client and not only from local direct scripts.

## Verified Scenario

Gemini CLI successfully used the MCP to create a realistic backend chain, including:

- transport creation
- package creation
- CDS creation
- table function creation
- AMDP class creation
- service class creation
- executable program creation

Verified package:

- `ZGEMINI_MCP_DEMO`

## Qualitative Gemini Feedback

Gemini's evaluation can be summarized as:

- broad coverage across the ABAP development lifecycle
- clear enough dependency failure messages to allow self-correction
- `write_object` with `activateAfterWrite` is especially effective
- strong potential for automating boilerplate, tests and data modeling

Gemini also identified the next highest-value areas correctly:

- ABAP Unit
- DCL-heavy scenarios

## Interpretation

This is important because it confirms three things:

1. the MCP works from a real external client
2. the tool descriptions and output shape are understandable to another AI agent
3. the project is no longer only a local technical prototype

## Follow-Up Finding

The later SAPUI5 demo work reinforced the same conclusion from another angle: the MCP is especially strong when it is used to prepare backend artifacts that another toolchain or user then consumes.
