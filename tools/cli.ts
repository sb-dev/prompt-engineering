import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { assert, packagePlan, plan, readJSON, safeRelative, unzip, validate, writeJSON } from './core.ts';
import { checkPR, classifyPR, postReview, publish, stageRelease } from './delivery.ts';
import type { Proof, ReleaseRecord } from './delivery.ts';
import { evaluateBundle, gate, manualTemplate } from './evaluation.ts';
import type { Run } from './evaluation.ts';
import { ingest, publishIngestion } from './ingestion.ts';
import type { Source } from './ingestion.ts';
import { recordRun, renderHistory, validateHistory } from './history.ts';
import { maintain, publishMaintenance } from './maintenance.ts';
import { GitHub, OpenAI } from './services.ts';

const args = process.argv.slice(2), command = args.shift() ?? 'help';
const options: Record<string, string> = {};
while (args.length) { const key = args.shift()!; assert(key.startsWith('--') && args.length, `Expected --option value, got ${key}`); options[key.slice(2)] = args.shift()!; }
const root = resolve(options.root ?? '.'), out = resolve(options.out ?? 'build');
const gh = () => new GitHub(options.repository ?? process.env.GITHUB_REPOSITORY ?? '');
function output(key: string, value: string): void { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`); }
function loadProof(path: string): Proof { return JSON.parse(readFileSync(path, 'utf8')); }
async function main(): Promise<void> {
  if (command === 'help') {
    console.log('Commands: record-run, history, classify-pr, validate, package, evaluate, manual-template, ingest, check-pr, post-review, stage-release, publish, maintain, publish-maintenance, publish-ingestion, download-artifact'); return;
  }
  if (command === 'record-run') {
    const tool_run = { ...(options.url ? { url: options.url } : {}), ...(options.device ? { device: options.device } : {}), ...(options['session-id'] ? { session_id: options['session-id'] } : {}) };
    const record = recordRun(root, { artifact: options.artifact, target: options.target, tool_run, run_id: options['run-id'], model: options.model, notes: options.notes });
    console.log(JSON.stringify(record, null, 2)); return;
  }
  if (command === 'history') {
    const p = plan(root);
    if (options.artifact) assert(p.project.artifacts.some(a => a.id === options.artifact && a.kind === 'prompt'), 'Unknown prompt');
    const records = validateHistory(root, p.project).filter(r => !options.artifact || r.artifact === options.artifact);
    console.log(renderHistory(records)); return;
  }
  if (command === 'classify-pr') {
    const result = await classifyPR(gh(), Number(process.env.PR_NUMBER ?? options.pr), options.revision ?? process.env.PR_HEAD_SHA ?? '', options.base ?? process.env.PR_BASE_SHA ?? '');
    output('history_only', String(result.history_only)); output('source_sha', result.source_sha); return;
  }
  if (command === 'validate') { const p = validate(root); console.log(`Validated ${p.bundles.length} artifact/target combinations.`); return; }
  if (command === 'package') { const p = validate(root); packagePlan(p, out); console.log(`Packaged ${p.bundles.length} unreleased candidates in ${out}.`); return; }
  if (command === 'manual-template') {
    const p = plan(root); assert(p.bundles.some(b => b.target.id === options.target), 'Target is not declared by an artifact');
    manualTemplate(p, options.target, out); return;
  }
  if (command === 'evaluate') {
    const p = validate(root), client = new OpenAI(p.project.limits), runs: Run[] = [];
    const baseline: ReleaseRecord | null = options.baseline ? JSON.parse(readFileSync(options.baseline, 'utf8')) : null;
    for (const b of p.bundles) {
      const prior = baseline?.plan.bundles.find(x => x.id === b.id && x.target.id === b.target.id) ?? null;
      runs.push(await evaluateBundle(b, p, root, options.revision ?? `local-content:${p.digest}`, client, prior));
      writeJSON(join(out, 'runs.json'), runs);
    }
    gate(p, runs); console.log('Required evaluations passed for the recorded configurations.'); return;
  }
  if (command === 'check-pr') {
    try { await checkPR(root, out, gh(), Number(process.env.PR_NUMBER ?? options.pr)); }
    finally { if (existsSync(join(out, 'proof.json'))) output('source_sha', loadProof(join(out, 'proof.json')).source_sha); }
    return;
  }
  if (command === 'post-review') { await postReview(gh(), Number(process.env.PR_NUMBER ?? options.pr), loadProof(join(out, 'proof.json'))); return; }
  if (command === 'stage-release') { output('publish', String(await stageRelease(root, out, gh(), options.revision ?? process.env.GITHUB_SHA ?? ''))); return; }
  if (command === 'publish') { await publish(out, gh()); console.log('Release assets and catalogue were read back and verified.'); return; }
  if (command === 'ingest') {
    let source: Source;
    if (options.source) {
      const registry = readJSON<{ sources: Source[] }>(root, 'knowledge/sources.json');
      const match = registry.sources.find(s => s.id === options.source); assert(match, 'Registered source not found'); source = match;
    } else {
      const repository = process.env.SOURCE_REPOSITORY ?? options['source-repository'] ?? '';
      const paths = (v: string) => v.split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
      source = { id: repository.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), repository,
        ref: process.env.SOURCE_REF ?? options.ref ?? 'main', question: process.env.RESEARCH_QUESTION ?? options.question ?? '',
        include: paths(process.env.SOURCE_PATHS ?? options.paths ?? ''), exclude: paths(process.env.SOURCE_EXCLUDE ?? options.exclude ?? ''), monitor: false, max_files: 30, max_chars: 120000 };
    }
    mkdirSync(out, { recursive: true }); await ingest(root, out, gh(), source, new OpenAI(plan(root).project.limits)); return;
  }
  if (command === 'publish-ingestion') { await publishIngestion(root, out, gh()); return; }
  if (command === 'maintain') { await maintain(root, out, gh()); return; }
  if (command === 'publish-maintenance') { await publishMaintenance(out, gh()); return; }
  if (command === 'download-artifact') {
    const client = gh(), run = process.env.GITHUB_RUN_ID ?? options.run, name = process.env.ARTIFACT_NAME ?? options.name;
    assert(/^\d+$/.test(run ?? ''), 'Run ID must be numeric');
    const response = await client.request(`${client.prefix}/actions/runs/${run}/artifacts?per_page=100`);
    assert(response.total_count <= 100, 'Artifact listing is incomplete');
    const artifact = response.artifacts.find((a: any) => a.name === name && !a.expired); assert(artifact, `Artifact not found: ${name}`);
    const contents = unzip(await client.bytes(`${client.prefix}/actions/artifacts/${artifact.id}/zip`));
    for (const [path, value] of Object.entries(contents)) { safeRelative(path); const destination = join(out, path); mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, value); }
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
