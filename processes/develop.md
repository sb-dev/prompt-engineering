# Develop

## Inputs

An Issue with an objective, acceptance criteria, linked knowledge and next action.
The current source and released baseline, when one exists.

## Steps

1. Find the closest existing prompt or skill and read its cases and target profiles.
2. Define the expected change and a case that could disprove the proposed benefit.
3. Author or generate the smallest source change supported by that requirement.
4. Preserve necessary depth. Add a variant only for an evidenced target-specific difference.
5. Run `npm run check`. Run the target cases or record complete manual sessions.
6. Commit using `AGENTS.md` and open a PR linked to the Issue.
7. Resolve automated review findings. Inspect raw trial outputs and grading reasons.
8. The owner merges after the current promotion gate passes.
9. Inspect the release workflow's read-back verification and the Usage catalogue.

## Generation prompt

> Read the Issue, the closest source artefact, its cases and relevant knowledge.
> Define or update the acceptance cases first.
> Generate the required prompt or skill as a source change that fits existing conventions.
> Select only relevant guidance. Preserve exact technical content.
> Run the required checks and report unavailable verification.
> Do not call the output ready before the release gate and publication verification.

## Completion evidence

Current PR checks, complete evaluation coverage, owner merge and verified release assets.
A successful PR check is not publication.

## Hand-off

Close the linked Issue through the merged PR. Monitor the released configuration through Maintain.
