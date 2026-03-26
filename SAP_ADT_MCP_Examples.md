# SAP ADT MCP – Examples

## Purpose

This document gives short, copy-friendly examples for the MCP tools that have proven most useful in external client workflows.

## `sap_adt_search_docs`

Use when you want to find verified examples, known limitations or implementation notes in the MCP's own Markdown documentation.

Example:

```json
{
  "query": "ABAP Unit empty payload classrun verification",
  "maxResults": 5
}
```

Optional narrowing:

```json
{
  "query": "transport release E_TRKORR",
  "fileFilter": "Transport",
  "maxResults": 3
}
```

Optional workspace search:

```json
{
  "query": "launchpad role odata",
  "scope": "workspace",
  "maxResults": 5
}
```

## `sap_adt_get_workspace_roots`

Use when you want to know which workspace roots the current MCP client exposed to the server.

Example:

```json
{}
```

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

## `sap_adt_create_transaction`

Use for the currently verified classic transaction scenario: a report transaction for an existing executable program.

Example:

```json
{
  "transactionCode": "ZMCP_REPORT_DEMO",
  "programName": "Z_MCP_FILL_SIMPLE_TAB",
  "shortText": "MCP report demo",
  "packageName": "Z_DEV_KODEXPORT",
  "transportRequest": "A4HK900315"
}
```

Current scope:

- report transaction only
- helper class is created and removed automatically by default

## `sap_adt_delete_transaction`

Use to remove a previously created classic transaction code.

Example:

```json
{
  "transactionCode": "ZMCP_REPORT_DEMO",
  "helperPackageName": "Z_DEV_KODEXPORT",
  "transportRequest": "A4HK900315"
}
```

Note:

- delete uses a temporary helper class
- the helper package is explicit so the client controls where the temporary class is created

## `sap_adt_get_user_parameters`

Use to read persistent user parameters through the verified SU3-style helper flow.

Example:

```json
{
  "helperPackageName": "Z_DEV_KODEXPORT",
  "userName": "CODEX",
  "parameterIds": ["/AIF/SKIP"],
  "withText": true,
  "transportRequest": "A4HK900315"
}
```

Current note:

- verified scope is persistent user parameters via `SUSR_USER_PARAMETERS_GET`
- this is not the same as transient in-session `SET PARAMETER ID` memory

## `sap_adt_set_user_parameters`

Use to merge one or more persistent user-parameter values into the current parameter list and write the full list back safely.

Example:

```json
{
  "helperPackageName": "Z_DEV_KODEXPORT",
  "userName": "CODEX",
  "parameters": [
    {
      "parameterId": "/AIF/SKIP",
      "value": "MCP"
    }
  ],
  "transportRequest": "A4HK900315"
}
```

Current note:

- the verified update path reads the full parameter list first, merges the requested entries and then calls `SUSR_USER_PARAMETERS_PUT`

## `sap_adt_create_function_group`

Use to create a classic ABAP function group shell.

Example:

```json
{
  "groupName": "Z_MCP_FG_DEMO",
  "description": "MCP function group demo",
  "packageName": "Z_DEV_KODEXPORT",
  "transportRequest": "A4HK900315"
}
```

## `sap_adt_create_function_module`

Use to create a function module shell inside an existing function group.

Example:

```json
{
  "groupName": "Z_MCP_FG_DEMO",
  "functionModuleName": "Z_MCP_FM_DEMO",
  "description": "MCP function module demo",
  "packageName": "Z_DEV_KODEXPORT",
  "transportRequest": "A4HK900315"
}
```

Typical follow-up:

- write the module source through `sap_adt_write_object`
- set:
  - `objectType: "functionmodule"`
  - `objectName: "Z_MCP_FM_DEMO"`
  - `containerName: "Z_MCP_FG_DEMO"`

## `sap_adt_create_bdef`

Use for a RAP behavior-definition shell when you already know the target name and package.

Example:

```json
{
  "bdefName": "ZI_MCP_BEHAVIOR_DEMO",
  "description": "MCP behavior definition demo",
  "packageName": "Z_DEV_KODEXPORT",
  "transportRequest": "A4HK900315"
}
```

Typical follow-up:

- write the BDEF source through `sap_adt_write_object`
- set:
  - `objectType: "bdef"`
  - `objectName: "ZI_MCP_BEHAVIOR_DEMO"`

Current note:

- create, read, source write and delete are verified
- generic ADT activation is still environment-sensitive for BDEF in the Docker trial

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
