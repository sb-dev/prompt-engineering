import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { fingerprint, plan } from '../tools/core.ts';
import type { Bundle, Plan } from '../tools/core.ts';
import { assertRun, configuration, evaluateBundle, gate, trialPass, trialsStatus } from '../tools/evaluation.ts';
import type { Run, Trial } from '../tools/evaluation.ts';
import { OpenAI } from '../tools/services.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
beforeEach(() => { process.env.OPENAI_MODEL = 'fixture-model'; process.env.OPENAI_API_KEY = 'fixture-not-a-real-key'; delete process.env.OPENAI_GRADER_MODEL; });
function syntheticRun(b: Bundle, p: Plan): Run {
  // These fabricated unit-test records are not persisted as model-evaluation evidence.
  const trials: Trial[] = b.cases.flatMap(c => Array.from({ length: p.project.evaluation.trials }, (_, i) => ({
    case_id: c.id, trial: i + 1, input: c.input, output: c.contains.join(' ') || 'Synthetic unit-test answer.',
    activated: b.kind === 'skill' ? c.skill_activation : null, grade: { expected: c.expected.map(() => true), failures: c.fail_if.map(() => false), rationale: 'Synthetic unit-test judgement.' },
    models: ['fixture-model', 'fixture-model'], response_ids: ['fixture-answer', 'fixture-grade'], error: null,
  })));
  const config = configuration(b);
  return { schema: 1, implementation: b.implementation, id: b.id, target: b.target.id, input_digest: b.input_digest, package_digest: b.package_digest, case_digest: b.case_digest,
    source_revision: 'unit-test-only', created_at: '2026-10-01T12:00:00Z', execution: b.target.execution, manual: b.target.execution === 'manual' ? { reviewer: 'fixture', evidence_url: 'https://example.com/fixture', settings: 'unknown model; synthetic fixture', session_date: '2026-10-01' } : undefined, configuration: config, configuration_digest: fingerprint(config),
    trials, baseline_trials: structuredClone(trials), baseline_kind: 'no-instructions', baseline_package_digest: null, status: 'PASS', limitations: ['Synthetic fixtures, not live evaluations.'] };
}
test('complete matching synthetic coverage passes the gate', () => { const p = plan(root); assert.doesNotThrow(() => gate(p, p.bundles.map(b => syntheticRun(b, p)))); });
test('missing target evidence blocks promotion', () => { const p = plan(root); assert.throws(() => gate(p, []), /coverage/); });
test('missing trial blocks promotion', () => {
  const p = plan(root), runs = p.bundles.map(b => syntheticRun(b, p)); runs[0].trials.pop(); assert.throws(() => gate(p, runs), /verdict/);
});
test('duplicate trial cannot substitute for coverage', () => {
  const p = plan(root), b = p.bundles[0], r = syntheticRun(b, p); r.trials[1] = r.trials[0]; assert.equal(trialsStatus(b, r.trials, 2, 1), 'BLOCKED');
});
test('a failing criterion overrides a positive verdict label', () => {
  const p = plan(root), b = p.bundles[0], r = syntheticRun(b, p); r.trials[0].grade!.expected[0] = false;
  assert.equal(trialsStatus(b, r.trials, 2, 1), 'FAIL'); assert.throws(() => assertRun(b, p, r), /verdict/);
});
test('literal checks are independent of AI grading', () => {
  const p = plan(root), b = p.bundles[0], r = syntheticRun(b, p); r.trials[0].output += ' 5 seconds';
  assert.equal(trialPass(r.trials[0], b.cases[0], b.kind), false);
});
test('skill non-activation failure is detected', () => {
  const p = plan(root), b = p.bundles.find(b => b.kind === 'skill')!, r = syntheticRun(b, p), c = b.cases.find(c => !c.skill_activation)!;
  const t = r.trials.find(t => t.case_id === c.id)!; t.activated = true; assert.equal(trialPass(t, c, b.kind), false);
});
test('stale bytes, cases and model settings block reuse', () => {
  const p = plan(root), b = p.bundles[0], r = syntheticRun(b, p);
  r.package_digest = 'bad'; assert.throws(() => assertRun(b, p, r), /Stale/);
  r.package_digest = b.package_digest; process.env.OPENAI_MODEL = 'another-model'; assert.throws(() => assertRun(b, p, r), /configuration changed/);
});
test('missing baseline or API provenance blocks promotion', () => {
  const p = plan(root), b = p.bundles[0], r = syntheticRun(b, p);
  r.baseline_trials = []; assert.throws(() => assertRun(b, p, r), /Baseline/);
  r.baseline_trials = structuredClone(r.trials); r.trials[0].response_ids = []; assert.throws(() => assertRun(b, p, r), /provenance/);
});
test('missing credentials produce BLOCKED without a network call', async () => {
  const p = plan(root); delete process.env.OPENAI_API_KEY;
  const client = new OpenAI(p.project.limits, async () => { throw new Error('The network must not be called'); });
  const r = await evaluateBundle(p.bundles[0], p, root, 'fixture', client); assert.equal(r.status, 'BLOCKED'); assert.equal(client.calls, 0);
  assert(r.trials.every(t => t.error?.includes('OPENAI_API_KEY')));
});
test('model call limits cannot be silently exceeded', async () => {
  const p = plan(root), client = new OpenAI({ ...p.project.limits, max_calls: 1 }, async () => new Response(JSON.stringify({ status: 'completed', model: 'reported-model', id: 'response-fixture', output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }] }), { status: 200 }));
  const answer = await client.complete('fixture-model', 'instructions', 'input'); assert.equal(answer.model, 'reported-model');
  await assert.rejects(client.complete('fixture-model', 'instructions', 'input'), /budget/);
});
test('incomplete provider response is not a successful answer', async () => {
  const p = plan(root), client = new OpenAI(p.project.limits, async () => new Response(JSON.stringify({ status: 'incomplete', model: 'x', id: 'y', output: [] })));
  await assert.rejects(client.complete('fixture-model', 'instructions', 'input'), /not completed/);
});
test('mocked API evaluation handles both answer and grader calls', async () => {
  const p = plan(root), b = p.bundles[0];
  const client = new OpenAI(p.project.limits, async (_url, init) => {
    const body = JSON.parse(String(init!.body));
    let value: string;
    if (body.text?.format) {
      const prompt = JSON.parse(body.input); value = JSON.stringify({ expected: prompt.expected.map(() => true), failures: prompt.fail_if.map(() => false), rationale: 'Synthetic response for control-flow testing.' });
    } else value = b.cases.find(c => c.input === body.input)!.contains.join(' ') || 'Synthetic answer';
    return new Response(JSON.stringify({ status: 'completed', model: 'fixture-model', id: 'fixture-response', output: [{ type: 'message', content: [{ type: 'output_text', text: value }] }] }));
  });
  const run = await evaluateBundle(b, p, root, 'unit-test', client); assert.equal(run.status, 'PASS'); assertRun(b, p, run);
  assert.equal(client.calls, b.cases.length * p.project.evaluation.trials * 4);
});

test('a resolved model change during a comparison blocks promotion', () => {
  const p = plan(root), b = p.bundles[0], r = syntheticRun(b, p);
  r.trials[0].models[0] = 'different-resolved-model';
  assert.throws(() => assertRun(b, p, r), /verdict/);
});
