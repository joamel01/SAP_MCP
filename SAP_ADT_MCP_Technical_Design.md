# SAP ADT MCP – Technical Design

## Goal

Build a small MCP server that acts as a controlled integration layer between an MCP-capable client and SAP ABAP Development Tools.

The design goal is not generic SAP administration. The goal is practical repository work:

- inspect repository objects
- create and update source-based objects
- create and update selected DDIC objects
- activate and run artifacts
- manage transport requests at a usable level

## Why ADT Instead Of SAP GUI

ADT is the correct integration surface because:

- it is already an HTTP-based machine interface
- repository objects can be read and updated through stable object URIs
- activation, runtime and parts of CTS are available without GUI automation
- the result is more robust and auditable than desktop scripting

## Architecture

1. MCP client
2. stdio MCP server
3. `AdtClient`
4. SAP ADT HTTP endpoints

The MCP server is intentionally thin:

- validate inputs
- enforce package and object-type allowlists
- translate MCP calls to ADT calls
- normalize the result into compact JSON text blocks

The `AdtClient` owns the protocol details:

- cookies
- stateful sessions
- CSRF
- lock and unlock flows
- content types
- request retry where verification proved it was needed

## Object Model Strategy

The server distinguishes between:

- source objects
  - program
  - class
  - DDLS
  - DCLS
  - DDLX
- DDIC source/main objects
  - table
  - structure
- DDIC XML-metadata objects
  - domain
  - data element
  - table type
- helper-program based flows
  - search help

That distinction is essential. Different ADT areas use different update paths and different activation behavior.

## Security Model

Security is intentionally narrow:

- only configured packages may be touched
- only configured object types may be touched
- credentials are injected through environment variables
- the MCP does not try to widen SAP authorizations
- no GUI automation is attempted
- mass operations are intentionally limited

## Transport Strategy

The transport strategy is pragmatic:

1. use an explicit `transportRequest` if provided
2. otherwise use `.env` fallback only if still valid and modifiable
3. otherwise auto-select only if exactly one modifiable workbench request exists
4. otherwise fail loudly

Release behavior is also pragmatic:

- release tasks first
- then release requests
- verify final state with a fresh `GET`
- use the verified `sortandcompress` + `newreleasejobs` sequence for request release

## Runtime Strategy

The MCP supports two kinds of execution:

- `programrun`
- `classrun`

ABAP Unit is treated as a third runtime category:

- metadata discovery
- raw test execution
- raw XML result return

The project deliberately avoids over-parsing ABAP Unit until a richer result payload is verified consistently.

## Scope Boundary

The latest SAPUI5 demo exercise clarified the correct scope boundary:

- backend artifacts for OData and UI5 consumption are in scope
- BSP upload is out of scope
- app index recalculation is out of scope
- Launchpad content maintenance is out of scope
- PFCG role maintenance is out of scope

## Acceptance Criteria

The practical acceptance criteria for this project are:

1. read repository objects reliably
2. write repository and selected DDIC objects reliably
3. activate objects without leaving stale inactive artifacts in the normal path
4. expose runtime execution for programs and classes
5. expose ABAP Unit in a usable raw form
6. create and manage transports well enough for real development work
7. work from an external MCP client such as Gemini CLI

## Current Design Verdict

The design is now proven for real SAP backend development work. The remaining gaps are mostly at the edge of the intended scope, not at its center.
