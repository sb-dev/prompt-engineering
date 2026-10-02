# Implementation references

Primary references checked on 1 October 2026:

- [Node.js TypeScript support](https://nodejs.org/api/typescript.html): native type stripping; type checking remains a separate command.
- [Responses API structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs): the grader, router and reviewer use JSON schemas.
- [Agent Skills specification](https://agentskills.io/specification): `SKILL.md`, names and descriptions.
- [GitHub pull_request_target security](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target): separate trusted tooling from candidate execution.
- [GitHub workflow triggers](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow): use a separate automation identity for generated PRs that need checks.
- [GitHub release assets](https://docs.github.com/en/rest/releases/assets): asset download and digest verification.

Workflow action references are pinned to inspected commits. Dependabot proposes updates.
These references establish interface and format choices, not successful integration execution.
