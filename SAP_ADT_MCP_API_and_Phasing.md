# SAP ADT MCP – API And Phasing

## Current Public Tool Surface

### Discovery And Read

- `sap_adt_get_workspace_roots`
- `sap_adt_search_docs`
- `sap_adt_discover`
- `sap_adt_read_object`
- `sap_adt_read_search_help`
- `sap_adt_get_abap_unit_metadata`

### Write, Activate, Delete

- `sap_adt_write_object`
- `sap_adt_activate_object`
- `sap_adt_activate_dependency_chain`
- `sap_adt_activate_object_set`
- `sap_adt_get_activation_log`
- `sap_adt_delete_object`

### Runtime

- `sap_adt_run_program`
- `sap_adt_run_class`
- `sap_adt_run_abap_unit`
- `sap_adt_auto_verify_object`

### User Parameters

- `sap_adt_get_user_parameters`
- `sap_adt_set_user_parameters`

### Transport Handling

- `sap_adt_create_transport_request`
- `sap_adt_list_transport_requests`
- `sap_adt_get_transport_request`
- `sap_adt_check_transport_request`
- `sap_adt_release_transport_request`
- `sap_adt_delete_transport_request`
- `sap_adt_apply_transport_policy`

### Repository Creation

- `sap_adt_create_package`
- `sap_adt_create_function_group`
- `sap_adt_create_function_module`
- `sap_adt_create_interface`
- `sap_adt_create_transaction`
- `sap_adt_delete_transaction`
- `sap_adt_create_program`
- `sap_adt_create_class`
- `sap_adt_create_ddls`
- `sap_adt_create_bdef`
- `sap_adt_create_dcls`
- `sap_adt_create_ddlx`
- `sap_adt_create_abap_scaffold`

### DDIC Creation

- `sap_adt_create_dataelement`
- `sap_adt_create_domain`
- `sap_adt_create_table`
- `sap_adt_create_structure`
- `sap_adt_create_tabletype`
- `sap_adt_create_search_help`

## Input Philosophy

The tool surface is designed for AI clients:

- explicit object names
- small schemas
- optional direct ADT URI where needed
- optional `transportRequest`
- no attempt to emulate the full ADT or SAP GUI surface
- a small amount of workspace-awareness where MCP clients already support roots

## Output Philosophy

Outputs are returned as text payloads containing compact JSON:

- status
- headers where relevant
- trimmed body
- tool-specific summaries for transport and ABAP Unit flows

This is deliberate. It is easier for MCP clients to reason over compact JSON text than over raw XML only.

When the top-level result is a JSON object, the server can also expose the same payload as `structuredContent`.

- default:
  - enabled
- compatibility switch:
  - `SAP_ADT_MCP_RESPONSE_NO_STRUCTURED_CONTENT=true`

## Verified Phases

### Phase 1

- discovery
- read object
- naive write experiments

### Phase 2

- stateful write
- lock/unlock
- activation
- activation logs

### Phase 3

- package creation
- program, class, DDLS creation
- runtime execution

### Phase 4

- DDIC object creation
- search help helper-program flow

### Phase 5

- transport request lifecycle
- transport cleanup
- policy-based classification
- safe release sequence

### Phase 6

- DCL and DDLX create flows
- full CDS/AMDP end-to-end chain
- external Gemini verification

### Phase 7

- ABAP Unit metadata
- ABAP Unit execution
- backend provisioning scenario for a working SAPUI5 app
- dependency-aware activation helper
- small-set mass activation with stop-or-continue behavior
- verified report-transaction create/delete helper flow
- verified native RAP behavior-definition create/read/write/delete flow
- verified persistent user-parameter get/set helper flow

## Recommended Next Phase

The next valuable phase would be:

1. optional higher-level generators for common ABAP/CDS solution bundles
2. more client-friendly program output capture
3. broader live verification of non-empty ABAP Unit result payloads

## Out Of Scope For Now

Even with transaction support, the MCP still does not aim to cover the full classic SAP GUI transaction-maintenance surface. The current verified scope is narrow and deliberate:

- classic report transaction creation
- classic report transaction deletion
- no generic dynpro transaction modeling
- no parameter transaction modeling yet
- no generic transient SAP memory parameter tooling yet
- no fully verified BDEF activation flow yet in this Docker environment

- BSP upload
- app index calculation
- Launchpad content management
- PFCG maintenance
- transport import
- generic BASIS operations
