# SAP ADT MCP – Risks And Security

## Security Principles

This project is intentionally restrictive:

- use package allowlists
- use object-type allowlists
- prefer explicit transport requests
- avoid destructive bulk actions
- keep the MCP surface smaller than the raw SAP surface

## Main Risks

### 1. Writing Into The Wrong Package

Risk:

- an MCP client can create technically valid but organizationally wrong artifacts

Mitigation:

- enforce `SAP_ADT_ALLOWED_PACKAGES`
- prefer explicit package assignment in client prompts

### 2. Writing Into The Wrong Transport

Risk:

- a stale fallback transport request can cause CTS confusion

Mitigation:

- explicit `transportRequest` wins
- fallback request is validated before use
- auto-selection only happens if exactly one modifiable workbench request exists

### 3. Inactive Artifact Residue

Risk:

- create/write/activate flows can leave inactive residue if activation is not handled correctly

Mitigation:

- verified activation through `POST /activation/runs`
- retry logic for known transient ADT failures
- explicit documentation of cleanup behavior

### 4. Search Help Special Cases

Risk:

- search help creation behaves differently from plain source-based objects

Mitigation:

- use the verified helper-program flow only
- keep the documented scope narrow

### 5. ABAP Unit Over-Interpretation

Risk:

- clients may assume fully parsed, semantically rich test results where only raw XML is currently verified

Mitigation:

- return raw XML plus simple counters
- document the current limitation explicitly

### 6. Scope Creep Into SAP Administration

Risk:

- users may expect the MCP to cover BSP upload, Launchpad maintenance or role administration

Mitigation:

- document the scope boundary
- keep ADT-focused functionality separate from UI and security administration work

## Verified Safe Boundaries

The project is verified for:

- repository-centric ABAP development
- selected DDIC generation
- transport request handling at developer level
- runtime execution
- ABAP Unit metadata and raw execution

The project is not positioned as:

- a generic admin tool
- a GUI automation framework
- a replacement for SAP Launchpad or PFCG administration

## Recommendation

Use the MCP for what it now proves well:

- build backend artifacts
- activate and run them
- inspect transport state
- automate repetitive repository work

Keep UI repository upload and Launchpad administration outside the MCP unless a separate, equally well-verified integration layer is added later.
