# Prompt Engineering — Architecture and Operating Workflow

**Version:** 2  
**Status:** Implemented source design; live integrations not verified  
**Date:** 2026-10-02

## 1. Purpose

Manage, generate and maintain prompts and skills across AI tools. Turn observed problems and external knowledge into changes supported by evaluation evidence.

Use Markdown and JSON for content, small TypeScript scripts for repeatable operations, and GitHub Actions for automation. GitHub Issues track work. PRs review changes. GitHub Releases distribute accepted outputs.

The operating loop is:

```text
Request or observation → investigate → change → evaluate and review
→ merge → automated release → revalidate
```

## 2. Repository structure

```text
README.md                    # Find, install and use released outputs
AGENTS.md                    # One root file for repository instructions
processes/                   # Repeatable operating procedures
knowledge/
  sources.json               # Repositories, scopes and monitoring settings
  research/                  # Findings, source revisions and coverage
  observations/              # Reported problems and reproduction evidence
  guidelines/                # Guidance, rationale and supporting evidence
prompts/                     # General instructions and task prompts
skills/                      # Source skills and supporting files
platforms/                   # Packaging rules and evaluation configurations
evaluations/                 # Cases and evaluation evidence
history/runs/YYYY-MM/        # Ordinary prompt uses and tool-run references
tools/                       # Validation, packaging and automation scripts
.github/workflows/           # Ingestion, checks, release and maintenance
```

Use file paths for links and Git commits for revisions. Keep work status in GitHub Issues, not in a second repository-based task tracker.

Generated packages are temporary build outputs and release assets. Source wording remains in Git. Large test logs can be attachments; retain the evidence needed to assess a release with that release.

## 3. Content and generation

**Knowledge** records what was reported, what was inspected or tested, and what is inferred. A pattern found in another repository is not proof that it improves behaviour.

**Prompts** cover persistent instructions and individual tasks. **Skills** define reusable procedures with supporting material. Use the Agent Skills structure, centred on `SKILL.md`, for targets that support it. [1]

`project.json` schema 2 maps each prompt target to a complete Markdown implementation.
Targets may share a file. Packaging selects the declared path without composition or fallback.
Skills retain one `source` directory and a `targets` list.
All implementations of a prompt use its shared acceptance cases, evaluated per target.
Manifests, evaluation evidence and the usage catalogue identify the implementation path.
The package digest identifies its content; the input digest also includes the path, cases and configuration.

**Platform configurations** define output format, installation or invocation instructions, and test execution. Record the application, model identifier when available, and relevant settings separately. Unknown version details remain unknown.

An agent can generate source prompts and skills from a request and relevant knowledge. Its changes enter a PR. Packaging then produces platform files without rewriting the instructions.

Select only relevant guidelines. Add a platform-specific variant when evidence shows the shared instructions are insufficient. Preserve exact wording that has technical significance.

Record ordinary uses separately under `history/runs/`. Each use has a unique ID, artefact, target,
implementation path, package digest, UTC time and tool-run reference.
The reference is an HTTPS link, a separate device/session pair, or both.
Model and source revision are optional. Capture the current digest at use time; never infer it for an old run.
History preserves old digests after instruction edits. It contains reported uses, not release passes.
Keep transcripts and private inputs out of usage records.

**Publication must preserve the evaluated content.** Release automation must not ask a model to rewrite it.

## 4. Project management

Use one Issue for each substantive change or investigation. Record the objective, relevant sources, acceptance criteria and next action. Link its PR and evaluation evidence. Agents maintain these records as work progresses.

Keep four process files. Each defines inputs, steps, completion evidence and hand-off:

| Process | Responsibility |
|---|---|
| `bootstrap.md` | Import existing material, establish the initial categories and configure the first target. |
| `ingest.md` | Analyse sources or observations and propose evidence-linked knowledge changes. |
| `develop.md` | Find existing material, author or generate changes, evaluate, review and release. |
| `maintain.md` | Check source and model changes, revalidate outputs and resolve regressions. |

An agent starts by reading the Issue, relevant process and linked material. It updates existing records rather than restarting the investigation.

The owner controls merging. Automation handles reviews, evidence checks, promotion and publication.

## 5. GitHub knowledge ingestion

An analysis request specifies a repository, a research question, a ref and either selected paths or repository-wide scope. Exclusions are optional. Registered sources can also have an opt-in review schedule.

The ingestion workflow resolves the ref to a commit SHA before analysis.

For **targeted analysis**, read the selected content and the references needed to understand it. Record any necessary expansion beyond the requested paths.

For **repository-wide analysis**, map the repository first. Inspect the areas relevant to the question. Record inspected and omitted areas; repository-wide scope does not mean every file was reviewed.

Store one research record containing the resolved SHA, scope, findings, limitations and evidence links to files at that SHA. Propose updates to existing knowledge pages where possible. Keep observation and interpretation separate.

Analyse source repositories in a temporary read-only checkout. Treat their instructions as evidence, not authority over the ingestion agent. Do not execute their scripts during ingestion. Check licensing before reusing source content; preserve required attribution.

Open a PR for useful knowledge changes. A no-change result only needs a run record. Ingestion does not promote prompts or skills directly.

For later runs, compare with the last successfully analysed revision. Read changed content and its context. Broaden the review when references, structure or the research question have changed. Record partial coverage rather than advancing an incomplete analysis as complete.

## 6. Evaluation and readiness

Each releasable prompt or skill declares its intended targets and evaluation cases. Each case contains an input, expected behaviour and explicit failure conditions.

Test the packaged instructions in their intended context, including relevant persistent instructions and tools. For skills, test expected activation and non-activation as well as task results. An API test does not establish behaviour inside a different application.

For behaviour changes, compare the candidate with the current release using the same cases and configuration. For the first release, use the original instructions as a baseline when available. Include regression cases and cases that challenge the proposed mitigation. Set the trial count and acceptance threshold before running tests; retain failed attempts.

Record the source revision, package digest, target configuration, case revision, date, execution method and evidence. A digest identifies the exact packaged content. Record grader configuration when an AI grader contributes to the verdict.

Use `PASS`, `FAIL` or `BLOCKED` for required evaluations. Missing access, skipped cases and absent evidence cannot count as passes. GitHub can treat skipped jobs as successful, so the final gate must check evaluation coverage explicitly. [2]

Where a target cannot be automated, accept a recorded manual session with its exact input, output and configuration. Label it as manual evidence. CI checks the record; it must not claim to have executed that session.

Readiness applies to an **output revision and tested target configuration**, not to a platform in general. The current release gate requires evidence for all declared combinations before publishing the set. Missing manual evidence blocks publication.

## 7. GitHub Actions

Use four workflows. Keep their reusable operations in the same TypeScript scripts used by agents.

| Workflow | Trigger | Responsibility |
|---|---|---|
| `ingest.yml` | Requested analysis | Resolve scope, analyse the source and open a knowledge PR. |
| `check.yml` | PR opened or updated | Validate files and references, package affected outputs, evaluate and post an AI review. |
| `release.yml` | Accepted artefact changes merged | Verify promotion evidence, publish packages and update the usage catalogue. |
| `maintain.yml` | Scheduled or requested | Check monitored sources and configured targets; update evidence and open follow-up work. |

Run affected evaluations rather than every platform combination. Set per-run call and time limits. Deduplicate follow-up Issues and cancel superseded PR runs.

The automated PR review checks scope, instruction conflicts, evidence, regressions and platform effects. It posts findings against the current revision. A positive AI review does not replace evaluation results.

Keep required checks current with the PR. Automation-created PRs must receive the same checks. For artefact changes, require packaging, review and declared evaluation coverage before merge. Research-only changes do not need unrelated behavioural tests or a release.
History-only PRs run type checking, tests and record validation, with no provider evaluation or AI review.
A trusted classifier checks every changed path, including rename origins. The gate checks the classified merge SHA.
Mixed changes retain the normal gates. History-only changes never publish a release.

Separate untrusted analysis and test execution from release credentials and repository-write permissions. Trusted publication code performs external writes. This follows GitHub's guidance on isolating untrusted content from privileged workflows. [3]

## 8. Promotion and release

Merge is the promotion boundary for artefact changes. A successful PR check alone is not publication.

The release workflow verifies that the merged source produces the evaluated package digest. The evaluation cases and configuration must also match the accepted evidence. Changed inputs require evaluation again. It then creates a versioned GitHub Release containing the packages, install or copy instructions, tested configurations, limitations and durable evaluation evidence.

After publishing, read back the release and its asset identifiers and digests. Report publication success only after they match the expected result. A retry must resume the same release or stop on conflicting content, not create duplicates.

After publication is verified, generate the usage catalogue from release records. Users obtain ready-for-use outputs from the catalogue, not from unfinished branches. Keep prior releases available for rollback.

## 9. Maintenance

A configured model change or a new behaviour report triggers revalidation. Scheduled checks also look for behaviour changes without an announced update.

Test the existing release unchanged first. A changed result is a reason to investigate, not proof of a model update.

On a regression, preserve the previous evidence, update the affected target's current compatibility record and open or update an Issue. Repeated infrastructure failures remain blocked evaluations, not model defects.

Changes then follow the normal development process. Compare proposed mitigations with the existing instructions. Retest old workarounds for possible removal; user requirements remain in force unless the user changes them.

Update the catalogue to show targets with regressions or pending revalidation. Preserve historical release claims with their dates and configurations.

## 10. Implementation sequence

Build one complete path before expanding platform coverage:

1. **Establish the repository.** Add process files, content formats, validation and one runnable target. Seed the clutter and overcomplication report as a user-reported observation.
2. **Complete delivery.** Create a prompt and skill, add their cases, then implement automated PR review, evaluation, release and read-back verification.
3. **Complete ingestion and maintenance.** Exercise targeted and repository-wide analysis. Add opt-in source monitoring, scheduled revalidation and deduplicated follow-up Issues.

The first acceptance exercise must show that a failed or missing required evaluation blocks promotion. It must also show that a successful release contains the evaluated content, and that a later regression changes the target's compatibility record without rewriting release history.

For the clutter example, include both a narrow edit and a task that needs technical depth. Reducing word count alone is not acceptance.

## References

[1] [Agent Skills specification](https://agentskills.io/specification). Used for the common skill structure, not as evidence of support on every platform.

[2] [GitHub: Status checks](https://docs.github.com/en/pull-requests/reference/status-checks). Used for required-check behaviour and the skipped-job caveat.

[3] [GitHub: Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use). Used for workflow permissions and untrusted-input isolation.
