# SAP ADT MCP – Reference Suite

## Purpose

This document defines a small, stable verification bundle for regression checks after MCP changes.

The goal is not to cover every tool. The goal is to prove that the most important repository and runtime paths still work in one repeatable run.

## Default Reference Objects

Current default environment variables in `.env.example` point at:

- package:
  - `Z_DEV_KODEXPORT`
- program:
  - `Z_FLIGHT_DEMO_REPORT`
- class:
  - `ZCL_MCP_CLASSRUN_DEMO`

Optional additions:

- interface:
  - `SAP_ADT_REFERENCE_INTERFACE`
- function group:
  - `SAP_ADT_REFERENCE_FUNCTION_GROUP`
- function module:
  - `SAP_ADT_REFERENCE_FUNCTION_MODULE`

## Verification Script

Build first:

```bash
npm run build
```

Run the reference suite:

```bash
npm run verify:reference
```

## What The Script Verifies

- ADT discovery
- read executable program source
- run executable program
- read class source
- run class via classrun
- optional interface read
- optional function group read
- optional function module read

## Result Shape

The script returns:

- `packageName`
- `passedCount`
- `failedCount`
- `skippedCount`
- one result entry per check

Each result includes:

- `name`
- `status`
- `details`

## Expected Use

Use the reference suite after:

- activation changes
- runtime parsing changes
- transport-selection changes
- tool-surface additions
- response-format changes

It is intentionally lightweight so it can be run often.
