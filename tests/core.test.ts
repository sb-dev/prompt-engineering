import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, fingerprint, loadProject, packagePlan, plan, safeRead, safeRelative, skillMetadata, unzip, validate, validateCase, zip } from '../tools/core.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
function copy(t: any): string {
  const out = mkdtempSync(join(tmpdir(), 'prompt-test-'));
  cpSync(root, out, { recursive: true, filter: p => !p.split('/').some(s => ['node_modules', 'build', '.git'].includes(s)) });
  t.after(() => rmSync(out, { recursive: true, force: true })); return out;
}
test('seed content and references validate', () => { assert.equal(validate(root).bundles.length, 3); });
test('fingerprints ignore object key insertion order', () => { assert.equal(fingerprint({ a: 1, b: 2 }), fingerprint({ b: 2, a: 1 })); });
test('package output is deterministic', t => {
  const p = plan(root), a = mkdtempSync(join(tmpdir(), 'package-')), b = mkdtempSync(join(tmpdir(), 'package-'));
  t.after(() => { rmSync(a, { recursive: true }); rmSync(b, { recursive: true }); });
  packagePlan(p, a); packagePlan(p, b);
  for (const bundle of p.bundles) {
    const name = `${bundle.id}--${bundle.target.id}.zip`;
    assert.equal(digest(readFileSync(join(a, name))), digest(readFileSync(join(b, name))));
    const contents = unzip(readFileSync(join(a, name)));
    for (const [name, value] of Object.entries(bundle.files)) assert.equal(contents[`${bundle.id}/${name}`].toString(), value);
    assert.match(contents['manifest.json'].toString(), /UNRELEASED/);
    assert.equal(JSON.parse(contents['manifest.json'].toString()).implementation, bundle.implementation);
  }
});
test('ZIP round-trip preserves Unicode and bytes', () => {
  const original = { 'b.md': 'British English — evidence', 'a.bin': Buffer.from([0, 1, 255]) };
  const content = unzip(zip(original)); assert.equal(content['b.md'].toString(), original['b.md']); assert.deepEqual(content['a.bin'], original['a.bin']);
});
test('ZIP rejects traversal and inflated-size abuse', () => {
  assert.throws(() => zip({ '../secret': 'bad' }), /Unsafe path/);
  assert.throws(() => unzip(zip({ 'a.txt': 'x'.repeat(1000) }), 100), /limit/);
});
test('unsafe relative paths are rejected', () => {
  for (const path of ['../secret', '/absolute', 'x/../../y', 'a\\b', 'a//b', './a']) assert.throws(() => safeRelative(path));
});
test('source symlinks cannot escape repository', t => {
  const out = copy(t); symlinkSync('/etc/passwd', join(out, 'prompts', 'escape.md'));
  assert.throws(() => safeRead(out, 'prompts/escape.md'), /Symlink/);
});
test('changed instruction bytes invalidate package and input digests', t => {
  const out = copy(t), before = plan(out);
  writeFileSync(join(out, 'prompts/clear-technical-responses/openai-api.md'), 'Changed instructions.\n');
  const after = plan(out); assert.notEqual(before.bundles[0].package_digest, after.bundles[0].package_digest); assert.notEqual(before.digest, after.digest);
});
test('case changes invalidate evidence without changing packaged instructions', t => {
  const out = copy(t), before = plan(out), path = join(out, 'evaluations/cases/narrow-edit.json');
  const c = JSON.parse(readFileSync(path, 'utf8')); c.expected.push('Another expectation'); writeFileSync(path, JSON.stringify(c));
  const after = plan(out); assert.equal(before.bundles[0].package_digest, after.bundles[0].package_digest); assert.notEqual(before.digest, after.digest);
});
test('runtime token limit changes invalidate evaluation inputs', t => {
  const out = copy(t), before = plan(out), path = join(out, 'project.json');
  const p = JSON.parse(readFileSync(path, 'utf8')); p.limits.max_output_tokens += 1; writeFileSync(path, JSON.stringify(p));
  assert.notEqual(before.digest, plan(out).digest);
});
test('duplicate IDs and invalid trial policies are rejected', t => {
  const out = copy(t), path = join(out, 'project.json'), p = JSON.parse(readFileSync(path, 'utf8'));
  p.artifacts[1].id = p.artifacts[0].id; writeFileSync(path, JSON.stringify(p)); assert.throws(() => loadProject(out), /duplicate/);
  p.artifacts[1].id = 'technical-editor'; p.evaluation.trials = 0; writeFileSync(path, JSON.stringify(p)); assert.throws(() => loadProject(out), /trials/);
});
test('skills require positive and negative activation coverage', t => {
  const out = copy(t), path = join(out, 'project.json'), p = JSON.parse(readFileSync(path, 'utf8'));
  p.artifacts[1].cases = ['evaluations/cases/narrow-edit.json']; writeFileSync(path, JSON.stringify(p)); assert.throws(() => plan(out), /non-activation/);
});
test('incomplete cases and invalid skill metadata fail', () => {
  assert.throws(() => validateCase({ id: 'missing-case' }));
  assert.throws(() => skillMetadata('# Missing metadata'));
  assert.equal(skillMetadata(safeRead(root, 'skills/technical-editor/SKILL.md')).name, 'technical-editor');
});
test('broken Markdown references fail validation', t => {
  const out = copy(t); writeFileSync(join(out, 'prompts/clear-technical-responses/openai-api.md'), '[Broken](not-there.md)\n'); assert.throws(() => validate(out), /Broken local link/);
});

test('archive member names cannot alter object prototypes', () => {
  const contents = unzip(zip(Object.fromEntries([['__proto__', 'ordinary file']])));
  assert(Object.hasOwn(contents, '__proto__'));
  assert.equal(contents['__proto__'].toString(), 'ordinary file');
});
