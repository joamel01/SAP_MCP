# SAP ADT MCP – Demo Package Reference

## Purpose

This document describes one compact demo package layout that has proven useful for MCP verification in SAP.

It is not a product template. It is a practical reference package for validating the most valuable repository-centric workflows.

## Recommended Focus

Use one small package that exercises:

- DDLS
- CDS table function
- AMDP implementation class
- consumer/service class
- executable report or classrun class

## Proven Object Pattern

One verified pattern in this repository has been:

- DDLS basic/composite layer:
  - `Z_I_FLIGHT_VIEW`
- DDLS table function:
  - `Z_I_FLIGHT_TABLEFUNC`
- AMDP implementation class:
  - `ZCL_FLIGHT_AMDP`
- consumer/service class:
  - `ZCL_FLIGHT_CONSUMER`
- executable verification object:
  - `Z_FLIGHT_DEMO_REPORT`

For lightweight runtime verification, a separate classrun object is also useful:

- `ZCL_MCP_CLASSRUN_DEMO`

For ABAP Unit verification, one small program with local tests is currently the most reliable ADT example in the local Docker trial:

- `Z_MCP_AUNIT_LV1`

## Why This Package Shape Works Well

It verifies the highest-value AI-assisted workflow in SAP ADT:

1. create interdependent backend objects
2. activate them in the right order
3. run a real executable consumer
4. confirm the output

This gives more confidence than a single isolated object because it exercises:

- object creation
- activation order
- runtime consumption
- error handling

## Suggested Verification Sequence

1. Create or update the DDLS objects.
2. Create or update the AMDP class.
3. Create or update the consumer class.
4. Activate the chain with `sap_adt_activate_object_set`.
5. Run `sap_adt_auto_verify_object` for:
   - the executable program
   - the classrun class
6. If tests exist, run `sap_adt_run_abap_unit` for the small ABAP Unit reference object.

## Scope Boundary

This package reference is meant for backend ADT validation only.

It does not include:

- BSP deployment
- UI5 upload
- app index work
- Launchpad content
- PFCG roles
