# Manual target evidence

Generate a template with `npm run pe -- manual-template --target chatgpt-manual` after
adding that target to an artefact in `project.json`.
Run every case and trial in the stated application. Fill in exact inputs, outputs,
model label, settings, timestamp, evidence link and reviewer identity.
Commit the resulting record under this directory.

CI validates the record against the current package, cases and target configuration.
It reports the execution method as `manual`; it does not claim to have run the session.
An empty, stale, skipped or incomplete record blocks promotion.
