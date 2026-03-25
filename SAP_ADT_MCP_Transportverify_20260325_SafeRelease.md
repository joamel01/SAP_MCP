# SAP ADT MCP – Safe Release Verification 2026-03-25

## Objective

Verify a safer request-release sequence against the SAP container.

## Verified Sequence

The following sequence was verified:

1. `sortandcompress`
2. `newreleasejobs`
3. fresh `GET` of the request afterwards

## Main Finding

`releasejobs` alone was not sufficient. It could return `200 OK` without a true request release.

## Consequence For The MCP

The release logic and the transport documentation were updated to treat request release as a verified sequence, not a single optimistic call.
