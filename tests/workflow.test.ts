import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const workflow = readFileSync(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8');
const gate = workflow.slice(workflow.indexOf('  gate:')).split('        run: |\n')[1].replace(/^          /gm, '');
const state = { SCOPE: 'success', HISTORY_ONLY: 'true', SCOPE_SHA: 'fixture-merge', OFFLINE: 'success', OFFLINE_SHA: 'fixture-merge', EVALUATE: 'skipped', POST: 'skipped', EVALUATED_SHA: '' };
function status(patch: Record<string, string | undefined> = {}): number | null {
  return spawnSync('bash', ['-e', '-c', gate], { env: { ...process.env, ...state, ...patch } }).status;
}
test('history-only gate permits skipped providers only with matching successful offline checks', () => {
  assert.equal(status(), 0);
  for (const patch of [{ SCOPE: 'failure' }, { OFFLINE: 'failure' }, { SCOPE_SHA: '' }, { OFFLINE_SHA: 'different' }, { EVALUATE: 'failure' }, { HISTORY_ONLY: '' }, { HISTORY_ONLY: 'false' }]) assert.notEqual(status(patch), 0);
});
test('ordinary changes still require evaluation, review and matching evidence SHA', () => {
  const pass = { HISTORY_ONLY: 'false', EVALUATE: 'success', POST: 'success', EVALUATED_SHA: 'fixture-merge' };
  assert.equal(status(pass), 0);
  for (const patch of [{ EVALUATE: 'skipped' }, { POST: 'failure' }, { EVALUATED_SHA: '' }, { EVALUATED_SHA: 'different' }]) assert.notEqual(status({ ...pass, ...patch }), 0);
});
