# SAP ADT MCP – Auto Verify

## Purpose

`sap_adt_auto_verify_object` is a small helper for the common case where an external client has just created or activated a runnable artifact and wants one safe next verification step without choosing between runtime and ABAP Unit manually.

## Scope

Current verified scope:

- `program`
- `class`

Supported modes:

- `auto`
- `runtime`
- `abapUnit`

## Behavior

### `auto`

- programs use `programrun`
- classes use `classrun`

### `runtime`

- behaves like `auto` today
- included to keep the public input model explicit

### `abapUnit`

- runs `sap_adt_run_abap_unit` semantics for the supplied object
- useful when the caller explicitly wants test execution rather than runtime execution

## Returned Shape

The tool returns:

- chosen `verificationMode`
- object reference
- HTTP status
- raw trimmed body
- one parsed payload:
  - `parsedOutput` for runtime verification
  - `parsedResult` for ABAP Unit verification

## Verified SAP Examples

- program verification:
  - `Z_FLIGHT_DEMO_REPORT`
  - result path: `programrun`
- class verification:
  - `ZCL_MCP_CLASSRUN_DEMO`
  - result path: `classrun`
- explicit ABAP Unit verification:
  - `Z_MCP_AUNIT_LV1`
  - result path: `abapUnit`

## Why This Exists

This helper is intentionally small. It does not try to infer repository semantics beyond known runnable artifacts. Its purpose is to save one more client-side decision after create/activate, especially for external MCP clients that want a compact and predictable follow-up step.
