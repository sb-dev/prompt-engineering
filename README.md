# Prompt Engineering

Store, generate, evaluate and maintain prompts and skills across AI tools.
Use repository evidence and observed failures to improve instructions.
GitHub Issues track work. PRs carry changes. GitHub Actions reviews, evaluates and releases them.

## Start

Use Node.js 22.16 or later. Install the development tools and run the offline checks:

```sh
npm ci --ignore-scripts
npm run check
```

The command validates content and references, runs the tests, and builds candidate ZIPs in `build/`.
Packaging does **not** make a prompt ready for use.
Runtime scripts have no third-party dependencies. TypeScript and Node type definitions are development dependencies only.

For GitHub automation, follow [Setup](docs/setup.md).
The archive does not contain credentials, an existing Git history or a published release.
The default branch name is `main`.

## What is included

| Area | Use |
|---|---|
| `prompts/`, `skills/` | Reviewed source instructions. Agents author changes here. |
| `knowledge/` | Source registry, research, observations and guidance. |
| `platforms/` | Output use instructions and evaluation configurations. |
| `evaluations/` | Cases and optional manual evidence. |
| `history/runs/` | Prompt usage records with tool-run references. |
| `processes/` | Bootstrap, ingest, develop and maintain procedures. |
| `tools/` | One CLI for checks, packaging, evaluation and GitHub operations. |

The seed prompt is **clear-technical-responses**. The seed skill is **technical-editor**.
Their cases cover narrow edits, technical depth, justified complexity and skill non-activation.
The clutter observation is explicitly user-reported, not independently reproduced.

## Normal workflow

```text
Issue → investigate or ingest → author source changes → PR
→ automated checks, evaluation and review → owner merge → release
→ scheduled revalidation
```

Read [Develop](processes/develop.md) before changing instructions.
Agents can generate prompts and skills from a requirement and linked knowledge.
Packaging copies their reviewed text without asking a model to rewrite it.
Each prompt maps target profiles to complete Markdown implementations in `project.json`.
Targets can share a file. There is no fallback or prompt composition.
Add different wording when an observed problem and evaluation justify it.

## Use released outputs

Open the **Usage catalogue** issue created by the release workflow.
It lists the latest packages and their current compatibility status.
Download the package from GitHub Releases and follow its `INSTALL.md`.
The package includes its exact evaluation configuration and evidence.

No released outputs exist in this archive. Source examples are candidates.
The first automated target is the **OpenAI Responses API with a text-only skill router**.
It does not certify ChatGPT, Codex, Cursor, Claude Code or another native application.
The seed prompt also declares a **ChatGPT manual** implementation. It needs complete manual evaluation evidence before release.
The existing release gate requires evidence for every declared combination. Missing ChatGPT evidence blocks publication.

## Analyse another repository

Run **Actions → Ingest GitHub** on `main`.
Supply `owner/repository`, a ref and a research question.
Enter comma-separated literal paths for targeted analysis. Leave paths empty for repository-wide analysis.

The workflow records the resolved SHA, inspected and omitted files, source evidence and interpretation.
It proposes knowledge changes in a PR. It does not execute the source repository's code.
Repository-wide analysis can be partial; the record says which files were not inspected.
Register opt-in monitored sources in `knowledge/sources.json`.

## Commands

```sh
npm run validate
npm run package
npm run evaluate
npm run pe -- manual-template --target chatgpt-manual
npm run pe -- ingest --source registered-source-id
npm run pe -- record-run --artifact clear-technical-responses --target chatgpt-manual --device work-laptop --session-id abc123
npm run pe -- history --artifact clear-technical-responses
```

Evaluation and ingestion need configured access. A missing key produces blocked evidence, not a pass.
The ChatGPT manual target is already declared for the seed prompt.
See [Formats and commands](docs/formats.md) for configuration and evidence fields.

## Maintenance and limits

The four workflows are `check.yml`, `release.yml`, `ingest.yml` and `maintain.yml`.
Maintenance runs weekly and can be requested after changing a model setting.
It tests released instructions unchanged, updates the catalogue and deduplicates follow-up Issues.

The first implementation handles small text-based prompts and skills.
It does not execute skill scripts or provide a generic agent runtime.
AI grading needs human calibration during adoption. The model labels are supplied by your account configuration, not hard-coded guesses.

[Implementation notes](docs/implementation-notes.md) distinguish implemented code from unverified integrations.
The [architecture specification](docs/architecture-and-workflow.md) describes the current design.
