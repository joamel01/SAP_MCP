# SAP ADT MCP – Mass Activation

## Purpose

`sap_adt_activate_object_set` is the pragmatic companion to `sap_adt_activate_dependency_chain`.

Use it when the caller already knows the affected objects and wants one MCP call that:

- activates them in deterministic order
- reports success or failure per object
- optionally stops at the first failure

## Scope

Current verified scope:

- object types:
  - `ddls`
  - `dcls`
  - `ddlx`
  - `class`
  - `program`
- order profiles:
  - `auto`
  - `consumerProgram`
  - `consumptionView`

This tool is intentionally limited to small sets. It is not meant to be a generic bulk-operation tool for large transports or packages.

## Input Model

Required:

- `objects`

Optional:

- `orderProfile`
- `stopOnError`

Example:

```json
{
  "orderProfile": "consumerProgram",
  "stopOnError": false,
  "objects": [
    { "objectType": "program", "objectName": "Z_FLIGHT_DEMO_REPORT" },
    { "objectType": "class", "objectName": "ZCL_FLIGHT_CONSUMER" },
    { "objectType": "ddls", "objectName": "Z_I_FLIGHT_TABLEFUNC" },
    { "objectType": "ddls", "objectName": "Z_I_FLIGHT_VIEW" },
    { "objectType": "class", "objectName": "ZCL_MCP_DOES_NOT_EXIST" }
  ]
}
```

## Result Model

The tool returns:

- `requestedCount`
- `attemptedCount`
- `successCount`
- `failureCount`
- `stopped`
- `stoppedAtExecutionOrder`
- `stoppedAtObject`
- `results[]`

Each result row contains:

- requested order
- execution order
- object reference
- `success`
- activation error message when applicable
- HTTP status and trimmed activation body for successful rows

## Verified Behavior

Verified against `ABAP Cloud Developer Trial 2023 for Docker`:

- deterministic reordering works with scrambled caller input
- `stopOnError=true` stops at the first failure and reports the stop point
- `stopOnError=false` continues and returns mixed success/failure output
- activation no-op cases do not fail the full set when SAP reports no real errors and leaves no inactive object behind

## Recommended Usage

Use `sap_adt_activate_dependency_chain` when:

- the caller wants a small convenience helper
- only successful ordered activation matters

Use `sap_adt_activate_object_set` when:

- the caller wants explicit batch-style visibility
- one or more failures are expected during first-time activation
- the caller wants to continue through the remaining objects and inspect the full result set
