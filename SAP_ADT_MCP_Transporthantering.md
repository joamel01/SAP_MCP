# SAP ADT MCP – Transport Handling

## Recommended Workflow

1. List relevant requests
2. Read request detail
3. Run consistency checks where appropriate
4. Release tasks first
5. Release the request afterwards
6. Verify the final request state with a fresh read
7. Delete only requests that are still modifiable and known to be clean

For larger backlogs, `sap_adt_apply_transport_policy` can classify requests into:

- `keep`
- `release`
- `delete`
- `review`

## Verified Findings

- listing modifiable requests requires:
  - `GET /cts/transportrequests?targets=&requestStatus=D`
- `requestStatus` is camelCase
- request detail exposes three relevant levels:
  - `tm:request`
  - `tm:task`
  - `tm:abap_object`
- request release works best through:
  - `sortandcompress`
  - then `newreleasejobs`
  - both with XML containing `tm:number`
- `releasejobs` alone is not a reliable request-release path
- final request status must always be verified with a new `GET`

## Practical Cleanup Model

For older broken requests the fully verified cleanup model is:

1. inspect the task content
2. activate the real repository object if it still exists
3. remove stale task entries if the task points to broken or non-existing objects
4. release the task
5. release the request
6. use the verified FM fallback if ADT still stalls on `E_TRKORR`

## Current Limitation

Completely fresh requests that are created, filled and released in the same immediate automation flow can still hit edge cases. The release story is strongest for normal development flow and cleanup of older requests, not for hyper-compressed one-shot CTS scripting.
