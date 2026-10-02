# Implementation notes

## Implemented

Source content, process files, case definitions, deterministic packages and the release-evidence gate.
Complete prompt implementations per target and file-based usage history with one recording command.
A Responses API adapter, text-only skill router and structured grader.
Trusted PR review, release preparation, asset read-back and a generated Usage catalogue issue.
Scoped and repository-wide source analysis, incremental comparison, evidence-link checks and ingestion PRs.
Scheduled source checks, API revalidation and deduplicated follow-up Issues.

## Deliberate simplifications

The architecture document includes the implementation mapping and usage-history extension.
Automation configuration uses JSON rather than YAML, so the CLI has no YAML-parser runtime dependency.
YAML remains in GitHub workflows and the small Agent Skills frontmatter.
There is one artefact registry, no database, no custom task board and no background service.

Ready outputs are release assets. Generated packages do not live in Git.
The Usage catalogue is an automatically maintained GitHub Issue, not another branch or website.
Release tags use `artifacts-<merge SHA prefix>` for an idempotent identity.
Content and tooling changes use separate PRs to preserve the trusted-runner boundary.

The first automated execution context is intentionally narrow.
Explicit prompt implementations and target profiles support multiple delivery contexts, but each native host needs its own evidence.
Skills retain one source directory with a target list. Usage records do not change their execution.
Generation is agent-led through `processes/develop.md`; no additional prompt-generation service is required.
Research proposes knowledge; it never directly promotes instructions.

## Not independently verified here

No live provider evaluation, AI PR review, GitHub workflow, remote repository ingestion or GitHub release was run.
No prompt or skill is marked as behaviourally verified in the source tree.
Synthetic test results must not be used as promotion evidence.

The seed grader has not been calibrated against a human-labelled set.
Review its reasons during the first live exercise.
The two-trial default is a small regression screen, not a claim of reliable performance across tasks.

The default token setup supports public source ingestion.
Reading private source repositories needs an explicit read token and permission to send their content to the model provider.
Source analysis has file and context limits. Incomplete coverage is retained as a limitation.

See [Verification](verification.md) for the checks actually executed while producing this archive.
