import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProject, plan, writeJSON } from '../tools/core.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
function copy(t: any): string {
  const out = mkdtempSync(join(tmpdir(), 'implementations-'));
  cpSync(root, out, { recursive: true, filter: p => !p.split('/').some(s => ['node_modules', 'build', '.git'].includes(s)) });
  t.after(() => rmSync(out, { recursive: true, force: true })); return out;
}
test('a change affects only bundles that select that implementation', t => {
  const out = copy(t), before = plan(out), selected = before.bundles.find(b => b.target.id === 'openai-api' && b.kind === 'prompt')!;
  writeFileSync(join(out, selected.implementation), 'Changed complete prompt.\n');
  for (const after of plan(out).bundles) {
    const prior = before.bundles.find(b => b.id === after.id && b.target.id === after.target.id)!;
    if (after.implementation === selected.implementation) assert.notEqual(after.input_digest, prior.input_digest);
    else assert.deepEqual(after, prior);
  }
});
test('targets can explicitly share one complete implementation', t => {
  const out = copy(t), path = join(out, 'project.json'), p = JSON.parse(readFileSync(path, 'utf8'));
  p.artifacts[0].implementations['chatgpt-manual'] = p.artifacts[0].implementations['openai-api']; writeJSON(path, p);
  const bundles = plan(out).bundles.filter(b => b.kind === 'prompt');
  assert.equal(bundles[0].implementation, bundles[1].implementation);
  assert.equal(bundles[0].package_digest, bundles[1].package_digest);
  assert.notEqual(bundles[0].input_digest, bundles[1].input_digest);
});
test('invalid and ambiguous implementation declarations have no fallback', t => {
  const out = copy(t), path = join(out, 'project.json'), original = JSON.parse(readFileSync(path, 'utf8'));
  for (const implementations of [{}, { '../escape': 'prompts/a.md' }, { 'openai-api': 'skills/technical-editor/SKILL.md' }, { 'openai-api': '../escape.md' }]) {
    const p = structuredClone(original); p.artifacts[0].implementations = implementations; writeJSON(path, p); assert.throws(() => loadProject(out));
  }
  const p = structuredClone(original); p.artifacts[0].source = 'prompts/old.md'; writeJSON(path, p); assert.throws(() => loadProject(out), /source|targets/);
  delete p.artifacts[0].source; p.artifacts[0].implementations['missing-tool'] = p.artifacts[0].implementations['openai-api']; writeJSON(path, p); assert.throws(() => plan(out), /ENOENT/);
});
