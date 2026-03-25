# SAP ADT MCP – Transport Batch 2 2026-03-25

## Scope

Second and much broader cleanup batch for old CODEX transport requests.

## Verified Patterns

Several different blocker types were identified:

- request still modifiable even though task release had worked
- inactive real repository objects inside the task
- stale transport entries pointing to broken or non-existing objects
- ADT release still blocked by `E_TRKORR` even after technical cleanup

## Working Resolution Patterns

The following patterns were verified in practice:

1. activate the real underlying object if it still exists
2. release the task
3. if request release still fails in ADT, use the verified FM fallback
4. if the task contains a broken transport entry, remove that entry and retry

## Representative Results

Requests such as `A4HK900212`, `A4HK900236`, `A4HK900246`, `A4HK900130` and `A4HK900138` proved that different cleanup patterns were needed, not a single generic workaround.

## Main Lesson

Transport cleanup was not only a CTS problem. It was a mixture of:

- repository state
- task contents
- request release behavior
- ADT response interpretation
