# SAP ADT MCP – Examples

## Purpose

This document gives short, copy-friendly examples for the MCP tools that have proven most useful in external client workflows.

## `sap_adt_activate_object_set`

Use when you already know the affected object list and want one deterministic activation call.

Example:

```json
{
  "orderProfile": "consumerProgram",
  "stopOnError": false,
  "objects": [
    { "objectType": "program", "objectName": "Z_FLIGHT_DEMO_REPORT" },
    { "objectType": "class", "objectName": "ZCL_FLIGHT_CONSUMER" },
    { "objectType": "ddls", "objectName": "Z_I_FLIGHT_TABLEFUNC" },
    { "objectType": "ddls", "objectName": "Z_I_FLIGHT_VIEW" }
  ]
}
```

Use `stopOnError=true` when you want the call to halt on the first failed activation.

## `sap_adt_run_class`

Use for classes that implement the ADT classrun contract and should produce a small runtime check.

Example:

```json
{
  "className": "ZCL_MCP_CLASSRUN_DEMO"
}
```

Expected result shape:

- `status`
- `statusText`
- `parsedOutput`
- `body`

Typical parsed output:

- `format: "key_value_lines"`
- `leadingLines`
- `keyValues`

## `sap_adt_run_abap_unit`

Use when you explicitly want test execution rather than runtime execution.

Example:

```json
{
  "objectType": "program",
  "objectName": "Z_MCP_AUNIT_LV1",
  "withNavigationUri": true
}
```

Expected result shape:

- `status`
- `statusText`
- `parsedResult`
- `body`

Typical parsed result for a live program-based test object:

- `format: "adt-aunit"`
- `testClassCount`
- `testMethodCount`
- `testClasses`
- `testMethods`

## `sap_adt_auto_verify_object`

Use immediately after create/activate when the object is known to be runnable.

Program example:

```json
{
  "objectType": "program",
  "objectName": "Z_FLIGHT_DEMO_REPORT"
}
```

Class example:

```json
{
  "objectType": "class",
  "objectName": "ZCL_MCP_CLASSRUN_DEMO"
}
```

Explicit ABAP Unit example:

```json
{
  "objectType": "program",
  "objectName": "Z_MCP_AUNIT_LV1",
  "verificationMode": "abapUnit"
}
```
