# SAP ADT MCP – ABAP Unit Verification

This document describes the current ABAP Unit verification bundle for the MCP project.

## Purpose

The goal is to provide one repeatable verification path for ABAP Unit behavior in a new SAP system, even if the local ADT endpoint only returns an empty live `aunit:runResult` payload.

## Verification Assets

- Script:
  - `src/verify-abap-unit.ts`
- Live verification script:
  - `src/verify-abap-unit-live.ts`
- Built script:
  - `dist/verify-abap-unit.js`
- Built live script:
  - `dist/verify-abap-unit-live.js`
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

Run the broader live verification matrix:

```bash
node dist/verify-abap-unit-live.js --transportRequest=<WORKBENCH_REQUEST>
```

## What The Script Verifies

1. ABAP Unit metadata endpoint is reachable.
2. ABAP Unit execution endpoint returns a valid response for one reference object.
3. The MCP parser can classify the live payload.
4. The richer parser branch is validated against a stable JUnit-style reference sample.

## Current Verified Result In The Local Docker Trial

For the current `ABAP Cloud Developer Trial 2023 for Docker` environment, the broader verification now shows a split result:

- class-based own-test execution still came back as:
  - valid HTTP 200
  - but empty payload:
    - `<aunit:runResult .../>`
- program-based own-test execution returned a non-empty live payload

Verified live program example:

- program:
  - `Z_MCP_AUNIT_LV1`
- local test class:
  - `LTC_REPORT`
- local test method:
  - `BASIC_ASSERTION`

Verified live class example:

- class:
  - `ZCL_MCP_AUNIT_LV1`
- result in this environment:
  - still empty `aunit:runResult`

This means the MCP now has one documented live SAP example with a non-empty ABAP Unit payload through ADT, but that example is currently program-based rather than class-based.

## Why The Reference Sample Exists

The project now supports structured ABAP Unit parsing for richer payloads, including JUnit-style result XML. The bundled sample guarantees that this parser behavior can be validated even when a specific SAP system does not yet expose a rich live payload for the chosen test object.

The newer live verification script adds one more layer:

- it creates or updates one minimal class and one minimal program with local tests
- it executes a small parameter matrix
- it documents whether the current SAP system returns:
  - empty class payloads
  - non-empty program payloads
  - navigation URIs in the test output
