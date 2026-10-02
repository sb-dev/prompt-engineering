# GitHub setup

## Repository

Create a repository from the extracted folder, with `main` as its default branch.
The zip is a source tree, not a pre-initialised Git repository.
Run `npm ci --ignore-scripts` and `npm run check` before the first commit.
Choose the project licence before publishing the repository publicly.
No licence for your new project has been selected on your behalf.

## Credentials and model settings

Set these repository values in **Settings → Secrets and variables → Actions**:

| Name | Type | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | Secret | Responses API evaluation, grading, review and ingestion. |
| `OPENAI_MODEL` | Variable | Exact accessible model ID used for the task. |
| `OPENAI_GRADER_MODEL` | Optional variable | Grader model. Defaults to `OPENAI_MODEL`. |
| `OPENAI_REVIEW_MODEL` | Optional variable | Review and research model. Defaults to `OPENAI_MODEL`. |
| `AUTOMATION_TOKEN` | Secret | An automation identity that creates ingestion commits, Issues and PRs. |

The model must support Responses API structured JSON output.
Choose an ID enabled for your account. A display name in an application is not assumed to be an API ID.
Responses record the requested ID and the provider-reported model IDs.
An unavailable model or exhausted budget blocks the affected evaluation.

Use a fine-grained token or an externally supplied GitHub App installation token for `AUTOMATION_TOKEN`.
It needs this repository's Contents, Issues and Pull requests read/write permissions.
Do not use the workflow's own `GITHUB_TOKEN` for ingestion PR creation: the resulting PR must trigger the normal checks.
Token rotation or App-token issuance remains your account's responsibility.

For an explicitly authorised private source, set `ALLOW_PRIVATE_SOURCES=true` and supply a read-only `SOURCE_TOKEN` with access to that source.
Ingestion sends the selected source text to the configured model provider.
Do not enable this for confidential material without permission to transmit it.
Private-source monitoring with a separate token is not configured in the default maintenance workflow.

## Required checks and permissions

Enable Issues and GitHub Actions. Allow the workflows to write PR comments, Issues and releases using their declared job permissions.
Create a `release` environment restricted to `main`. No extra manual approval is needed unless you require it.

Protect `main` with required PRs, owner review and the **promotion-gate** check.
Require the branch to be up to date before merge. Disable bypass for ordinary work.
Use merge or squash merge; do not use rebase merge for the promotion path.
The release verifier associates the resulting commit with one merged PR.

`check.yml` uses `pull_request_target` to run trusted base-branch tooling.
Check your Actions event policy permits that event.
Candidate code executes only in the separate, read-only offline job.
The provider-key job reads candidate files as data and never executes them.
The PR-comment job has no provider key.
Do not change these trust boundaries when adding an adapter.

Fork PRs with content changes do not receive live evaluation. The promotion gate blocks them.
History-only PRs can pass with offline checks. A trusted base-branch classifier checks all changed and renamed paths.
The gate requires the offline result to match the classified merge SHA. Mixed changes cannot use this exception.
A maintainer must inspect the change and place it on a same-repository branch before live evaluation.
Automation-created ingestion PRs follow the same gate.

## First live acceptance exercise

The seed prompt declares both API and ChatGPT manual implementations. The skill declares the API target.
Generate the ChatGPT evidence template with `npm run pe -- manual-template --target chatgpt-manual`.
Run its cases, complete the attestation and save the record under `evaluations/manual/` through a PR.
Missing manual evidence blocks release for the full declared set.

Make a small, intended improvement to a seed prompt implementation on a new branch.
Check that a deliberately failing case blocks the PR. Restore the intended case and rerun it.
Inspect the raw answers and grader reasons, not only the final verdict.
Merge only after the gate passes.

Confirm the release contains the evaluated instruction bytes and evidence.
The publisher downloads the assets again and compares their digests.
Confirm the Usage catalogue points to that release and states its tested scope.
Then run maintenance and inspect its evidence and catalogue update.

These GitHub and model-provider steps were not executed while creating the archive.

## Local use

The deterministic checks need no API access after installing development dependencies.
To run provider-backed evaluation locally, export your credentials and model variables, then run `npm run evaluate`.
Supply `--baseline path/to/release.json` through `npm run pe -- evaluate` when comparing with a release.
Without that option, local evaluation explicitly uses a no-instructions baseline.
GitHub PR checks automatically use the current release baseline.

CI requires no runtime package installation in provider-key or write-token jobs.
Never put real keys in a tracked file.

## Upgrading the previous ZIP

Use `project.json` schema 2 and the new implementation paths.
Prior evaluation records lack `implementation`; obtain fresh evidence using the new tooling.
Keep existing usage and release history; do not rewrite historical results to claim new verification.
This ZIP is a fresh source tree. Its initial upload is not a prompt release.
