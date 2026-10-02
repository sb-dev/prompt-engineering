# Formats and commands

## Source content

`project.json` schema 2 declares each artefact's ID, type and shared case files.
Prompts map each target profile to one complete implementation. Skills retain `source` and `targets`.
Limits and acceptance thresholds are fixed before an evaluation.
The seed policy runs two trials per case and requires both to pass.
This is a small regression screen, not a statistical reliability guarantee.

Each prompt implementation is a standalone Markdown file. There are no overlays, inheritance or fallback files.

```json
{
  "id": "clear-technical-responses",
  "kind": "prompt",
  "implementations": {
    "openai-api": "prompts/clear-technical-responses/openai-api.md",
    "chatgpt-manual": "prompts/clear-technical-responses/chatgpt.md"
  },
  "cases": ["evaluations/cases/narrow-edit.json"]
}
```

Targets can deliberately point to the same file. They still have separate evaluation configurations.
The supplied implementation files start with identical instructions; edit one when a tool needs different wording.
Schema 1 prompt declarations are not accepted. Replace `source` and `targets` with `implementations` when migrating.
Skills use a directory containing `SKILL.md` and optional text files.
This implementation accepts single-line `name` and `description` fields in its YAML frontmatter.
Keep the skill name, source directory and artefact ID identical.
Binary skill assets and native script execution are not supported by the current API harness.

A platform profile separates the application, execution method, model variable and installation instructions.
Use a new profile for a different host or context. Do not rename an API result as a native-application result.
The same source can declare multiple profiles. Packaging preserves source bytes for each target.

## Evaluation

Each case records `input`, `expected`, `fail_if`, literal `contains`/`not_contains` checks and `skill_activation`.
Skills need positive and negative activation cases.
The router sees skill metadata, decides whether to load it and then runs the task without external tools.
Supporting text files load with the skill; scripts are never executed.

The candidate and baseline run on the same cases and current model configuration.
The first release compares with the target's default instructions and no added prompt or skill.
Later changes compare with the released instructions, not an unreleased branch.

An evaluation run records the implementation path, all trials, raw answers, grades, source and package digests, settings, model IDs and response IDs.
Within each API trial, provenance order is optional router, task answer, then grader.
A grader `expected` boolean is true when that requirement is satisfied.
A grader `failures` boolean is true when that failure occurred.
Incomplete grades and execution errors are BLOCKED.

Case, target, threshold, token-limit, implementation-path or source changes invalidate the affected bundle evidence.
A changed model setting requires a new run.
Unchanged combinations can reuse matching release evidence during PR checks.
Maintenance does not reuse that evidence as a new API execution.

Manual records must contain the exact input/output for every trial, activation when relevant,
reviewer, timestamp, model label, application settings and an HTTPS evidence link.
Use `unknown` only when a model identity is unavailable, and explain this in the settings field.
Compute `configuration_digest` with the exported `fingerprint` function after changing configuration.
An agent can fill and validate the record. CI cannot independently prove that the recorded session occurred.
Scheduled manual revalidation remains pending until a new session goes through a PR.

## Usage history

Ordinary prompt uses are separate from evaluation evidence.
`history/runs/YYYY-MM/<run-id>.json` contains one record per use, even when several uses share a session.
All usage records are user-reported. A reference does not prove which prompt was used or whether it worked.
Usage records cannot satisfy release gates.

Required fields: `schema: 1`, `run_id`, `artifact`, `target`, `implementation`, `package_digest`, `created_at` and `tool_run`.
Optional fields: `source_revision`, `model` and `notes`. Unknown model and revision values are omitted.
Digests are 64 lowercase hexadecimal SHA-256 characters. Revisions are full 40-character Git commit SHAs.
Timestamps use UTC, for example `2026-10-02T18:30:00Z`.

`tool_run` accepts an HTTPS `url`, or both `device` and `session_id`, or all three.
The history command displays the separate device and session fields as `device:session_id`.
Transcripts, task inputs and answers are not supported usage fields. Keep notes brief and sanitised.

Record at the time of use, with the exact implementation selected or submitted:

```sh
npm run pe -- record-run --artifact clear-technical-responses --target chatgpt-manual --url https://example.com/chat/your-session
npm run pe -- record-run --artifact clear-technical-responses --target chatgpt-manual --device work-laptop --session-id abc123
npm run pe -- history --artifact clear-technical-responses
```

Replace the example reference with the actual run reference.
The recorder captures the current implementation path and package digest, UTC time and a UUID.
It records a Git revision only for a tracked, unchanged implementation in this repository.
`--model` and `--notes` accept reported details. `--run-id` supports retries without replacing an existing record.
A new use gets a new ID. Retry with the same ID and unchanged fields; conflicting writes fail.

Do not use this command retrospectively after changing the prompt, or for a prompt edited after copying it.
For older uses, add a record using the original package manifest's path and digest and the actual use time.
If that digest is unknown, keep the report in knowledge observations instead of assigning the current digest.
This initial format requires the artefact/target mapping to remain declared; it does not support retired or renamed mappings.
Old content digests remain valid after instruction edits. Validation never substitutes the current digest.

History-only PRs run type checking, tests and validation. They skip provider evaluation and AI review.
Mixed changes use the normal gates. History is excluded from package and evaluation identity and release triggers.
No hooks or background collectors are included. Other tools can call the same recorder when the exact prompt is known.

## Source registry

Use `knowledge/source-example.json` as the shape of an entry in `knowledge/sources.json`.
Do not add the example placeholder as an active source.
`include` and `exclude` contain literal file or directory paths, not glob patterns.
An empty `include` list requests repository-wide analysis.
Monitoring is opt-in through `monitor: true`.

The analyser records a SHA, question, scope, file map, evidence, interpretation and omissions.
Scope expansion is explicit. A complete *text-scope* result does not claim binary files were read.
Later analysis derives its baseline from accepted complete records; partial records do not advance it.
Changed-only analysis includes root guidance and can request a broader follow-up.
No-change runs remain workflow artifacts rather than generating an empty PR.

## CLI

`npm run pe -- <command>` runs the shared TypeScript CLI.
`--root` selects a source tree. `--out` selects temporary output, normally under `build/`.

| Command | Purpose |
|---|---|
| `validate` | Validate declarations, cases, history, source structure and local Markdown links. |
| `record-run` | Record the current prompt use with a URL or device/session reference. |
| `history` | List usage records; `--artifact` filters by prompt. |
| `package` | Build deterministic, unreleased candidate ZIPs. |
| `evaluate` | Execute required cases and enforce coverage. Accepts `--baseline` and `--revision`. |
| `manual-template` | Write incomplete records for a declared manual target. Requires `--target`. |
| `ingest` | Analyse a registered `--source`, or explicit source arguments. |
| `check-pr`, `post-review` | Trusted PR evaluation and separate read-back-verified posting. |
| `stage-release`, `publish` | Verify accepted evidence, then publish and read back assets. |
| `maintain`, `publish-maintenance` | Produce evidence, then update Issues and the catalogue. |
| `publish-ingestion` | Commit validated research and open its Issue and PR. |

GitHub commands use `GITHUB_REPOSITORY` and `GH_TOKEN`.
The workflows provide these values. They do not need to be placed in a file.
