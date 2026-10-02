# Archive verification

**Date:** 2 October 2026.
**Environment:** Node.js v24.19.0; TypeScript 5.8.3; pinned Node type definitions 24.0.4.

## Executed

| Check | Result |
|---|---|
| Dependency installation | `npm ci --ignore-scripts` installed all three pinned development packages. The first restricted attempt failed; the authorised retry succeeded. |
| `npm run check` | Type checking, tests, content validation and packaging passed. |
| Individual test files | 57 tests passed across seven files; none failed or skipped. |
| Validation | Three declared artefact/target combinations and local Markdown links passed. |
| Deterministic packaging | All three ZIPs were identical across repeated builds. |
| Independent ZIP inspection | Python verified each package and compared instruction bytes and implementation paths with the plan. |
| Source preservation | Both prompt implementations retain the original seed wording. All skill source files match the original archive byte-for-byte. |
| CLI exercise | Recorded an HTTPS link plus device/session, repeated the same run ID, listed history, validated it and read the JSON back in an isolated copy. No synthetic usage records remain in the archive. |
| Workflow inspection | All four workflow YAML files parsed. Action pins and job timeouts were checked. |
| Promotion-gate script | Executed the actual shell gate with history-only and ordinary-change fixtures. Failed, skipped and mismatched-SHA cases were rejected as required. |

New regression coverage checks implementation selection, explicit shared files, isolated digest changes,
invalid declarations, reference formats, repeated sessions, conflicting retry IDs, historical content digests,
record validation, rename handling, stale PR classification and history-only release exclusion.
Existing evaluation and publication tests still exercise failed or missing evidence, model changes,
publication conflicts and release read-back.

## Limits

Provider and GitHub integration tests use synthetic responses and an in-memory GitHub implementation.
They verify control flow, not model quality or live service behaviour.
The default environment's `npm test` reporter groups tests by file; each test file was also run directly to verify all 57 individual cases.

Live model evaluation, repository ingestion, an AI review on GitHub, GitHub Actions jobs,
remote commits and GitHub releases were not executed.
The workflow specifies Node.js 22; this local verification used Node.js 24.19.0.

No prompt or skill is released or marked as behaviourally verified.
The added ChatGPT manual target needs complete manual evidence before the existing all-target release gate can pass.
Use [Setup](setup.md) for the live acceptance exercise.
