# SAP ADT MCP – ABAP Unit Verification

This document describes the current ABAP Unit verification bundle for the MCP project.

## Purpose

The goal is to provide one repeatable verification path for ABAP Unit behavior in a new SAP system, even if the local ADT endpoint only returns an empty live `aunit:runResult` payload.

## Verification Assets

- Script:
  - `src/verify-abap-unit.ts`
- Built script:
  - `dist/verify-abap-unit.js`
- Parser reference sample:
  - `references/abapunit-junit-sample.xml`

## How To Run

Build first:

```bash
npm run build
```

Run the verification script with the default reference object:

```bash
npm run verify:abapunit
```

Run the verification script for a specific object:

```bash
npm run verify:abapunit -- --objectType class --objectName CL_ABAP_CHAR_UTILITIES
```

## What The Script Verifies

1. ABAP Unit metadata endpoint is reachable.
2. ABAP Unit execution endpoint returns a valid response for one reference object.
3. The MCP parser can classify the live payload.
4. The richer parser branch is validated against a stable JUnit-style reference sample.

## Current Expected Result In The Local Docker Trial

For the current `ABAP Cloud Developer Trial 2023 for Docker` environment, the live SAP response may still be:

- a valid HTTP 200 result
- but with an empty payload:
  - `<aunit:runResult .../>`

That is still useful, because the script verifies:

- endpoint connectivity
- runtime request correctness
- empty-payload handling
- richer parsing logic via the bundled reference sample

## Why The Reference Sample Exists

The project now supports structured ABAP Unit parsing for richer payloads, including JUnit-style result XML. The bundled sample guarantees that this parser behavior can be validated even when a specific SAP system does not yet expose a rich live payload for the chosen test object.
