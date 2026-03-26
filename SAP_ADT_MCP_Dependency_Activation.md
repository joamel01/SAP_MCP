# SAP ADT MCP – Dependency Activation Helper

This document describes the dependency-aware activation helper added for the `1.3.0` line of work.

## Purpose

External MCP clients often know which objects belong to one change, but should not have to determine the activation order themselves.

This helper adds one verified middle layer between:

- single-object activation
- and the fuller batch-style `sap_adt_activate_object_set`

## MCP Tool

- `sap_adt_activate_dependency_chain`

## Supported Order Profiles

### `auto`

Default order:

1. `ddls`
2. `dcls`
3. `ddlx`
4. `class`
5. `program`

### `consumerProgram`

Useful for CDS or table-function backed consumer stacks:

1. `ddls`
2. `class`
3. `program`
4. `dcls`
5. `ddlx`

### `consumptionView`

Useful for view + DCL + metadata scenarios:

1. `ddls`
2. `dcls`
3. `ddlx`
4. `class`
5. `program`

## Verified SAP Example

The helper was verified in the local Docker trial against a deliberately scrambled input order:

- requested:
  1. `Z_FLIGHT_DEMO_REPORT`
  2. `ZCL_FLIGHT_CONSUMER`
  3. `ZCL_FLIGHT_AMDP`
  4. `Z_I_FLIGHT_TABLEFUNC`
  5. `Z_I_FLIGHT_VIEW`

With profile `consumerProgram`, the MCP executed:

1. `Z_I_FLIGHT_TABLEFUNC`
2. `Z_I_FLIGHT_VIEW`
3. `ZCL_FLIGHT_CONSUMER`
4. `ZCL_FLIGHT_AMDP`
5. `Z_FLIGHT_DEMO_REPORT`

All returned `200 OK`.

## Important Hardening Finding

During this work, one important activation edge case was confirmed:

- ADT can return:
  - `checkExecuted="false"`
  - `activationExecuted="false"`
  - `generationExecuted="true"`
- without any detailed error messages
- even though the object is not listed as inactive afterwards

The MCP now treats that as a non-fatal no-op activation when:

- no `E/A/X` activation messages exist
- and the object is not present in the inactive-object log

Without that hardening, dependency-chain activation would fail on already-active objects even though the repository state was valid.

## Scope Boundary

This helper is intentionally narrow:

- it reorders a known small object set
- it does not yet implement broader bulk activation policy across large repositories or transports
- it does not yet attempt transitive dependency discovery inside SAP
