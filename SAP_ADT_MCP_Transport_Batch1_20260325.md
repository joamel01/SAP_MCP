# SAP ADT MCP – Transport Batch 1 2026-03-25

## Scope

First cautious cleanup batch against older CODEX transport requests.

## What Was Verified

- task release worked
- request release did not always follow automatically
- `releasejobs` was not sufficient for reliable request release
- a successful-looking ADT response was not always proof of actual release

## Key Lesson

The final request state must always be confirmed with a fresh request read. This was the batch that made that rule explicit.
