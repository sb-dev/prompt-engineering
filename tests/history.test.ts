import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { plan, validate, writeJSON } from '../tools/core.ts';
import { gate } from '../tools/evaluation.ts';
import { recordRun, renderHistory, validateHistory, validateToolRun, validateUsageRun } from '../tools/history.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
function copy(t: any): string {
  const out = mkdtempSync(join(tmpdir(), 'history-'));
  cpSync(root, out, { recursive: true, filter: p => !p.split('/').some(s => ['node_modules', 'build', '.git'].includes(s)) });
  t.after(() => rmSync(out, { recursive: true, force: true })); return out;
}
const options = { artifact: 'clear-technical-responses', target: 'chatgpt-manual', tool_run: { device: 'work-laptop', session_id: 'fixture-session' } };
test('tool references accept HTTPS, device/session, or both', () => {
  for (const value of [{ url: 'https://example.com/chat/1' }, options.tool_run, { ...options.tool_run, url: 'https://example.com/chat/1' }]) assert.doesNotThrow(() => validateToolRun(value));
  for (const value of [{}, { device: 'x' }, { session_id: 'x' }, { url: 'http://example.com' }, { url: 'https://' }, { url: 'https://user:secret@example.com' }, { ...options.tool_run, device: 'x\ny' }]) assert.throws(() => validateToolRun(value));
});
test('recording captures exact bytes, reads back, and retains each use of a session', t => {
  const out = copy(t), before = plan(out), a = recordRun(out, options), b = recordRun(out, options);
  assert.notEqual(a.run_id, b.run_id);
  assert.equal(a.package_digest, before.bundles.find(b => b.target.id === options.target)!.package_digest);
  assert.equal(a.source_revision, undefined); assert.equal(a.model, undefined);
  assert.deepEqual(JSON.parse(readFileSync(join(out, `history/runs/${a.created_at.slice(0, 7)}/${a.run_id}.json`), 'utf8')), a);
  assert.equal(validateHistory(out, before.project).length, 2);
  assert.equal(validate(out).digest, before.digest);
  assert.match(renderHistory([a]), /work-laptop:fixture-session/);
});
test('a recording retry is idempotent but cannot replace an existing run', t => {
  const out = copy(t), request = { ...options, run_id: 'fixture-retry' }, a = recordRun(out, request);
  assert.deepEqual(recordRun(out, request), a);
  assert.throws(() => recordRun(out, { ...request, model: 'different-model' }), /different content/);
  assert.equal(validateHistory(out, plan(out).project).length, 1);
});
test('old digests remain valid after instructions change and never become release passes', t => {
  const out = copy(t), a = recordRun(out, options);
  writeFileSync(join(out, a.implementation), 'Different instructions.\n');
  const p = validate(out);
  assert.notEqual(a.package_digest, p.bundles.find(b => b.target.id === a.target)!.package_digest);
  assert.deepEqual(validateHistory(out, p.project), [a]);
  assert.throws(() => gate(p, [a] as any), /coverage/);
});
test('history rejects unknown targets, mismatched implementations and malformed identities', t => {
  const out = copy(t), a = recordRun(out, options), p = plan(out).project;
  for (const patch of [{ artifact: 'unknown' }, { target: 'unknown' }, { implementation: 'prompts/other.md' }, { package_digest: 'bad' }, { created_at: '2026-02-30T00:00:00Z' }, { created_at: 'yesterday' }, { source_revision: 'main' }, { run_id: '../escape' }, { transcript: 'private' }]) {
    assert.throws(() => validateUsageRun({ ...a, ...patch }, p));
  }
  assert.throws(() => recordRun(out, { ...options, artifact: 'technical-editor', target: 'openai-api' }), /prompt/);
});
test('history rejects a filename mismatch and duplicate execution IDs across months', t => {
  const out = copy(t), a = recordRun(out, options), p = plan(out).project;
  writeJSON(join(out, 'history/runs/2000-01/wrong.json'), a);
  assert.throws(() => validate(out), /path/);
  rmSync(join(out, 'history/runs/2000-01/wrong.json'));
  writeJSON(join(out, `history/runs/2000-01/${a.run_id}.json`), { ...a, created_at: '2000-01-01T00:00:00Z' });
  assert.throws(() => validateHistory(out, p), /Duplicate/);
});
