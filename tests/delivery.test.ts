import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, fingerprint, plan, unzip, writeJSON, zip } from '../tools/core.ts';
import { acceptedProof, catalogue, classifyPR, historyOnly, publish, releaseAssets, stageRelease } from '../tools/delivery.ts';
import type { ReleaseRecord } from '../tools/delivery.ts';
import { configuration } from '../tools/evaluation.ts';
import type { Run } from '../tools/evaluation.ts';
import { GitHub } from '../tools/services.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
beforeEach(() => { process.env.OPENAI_MODEL = 'fixture-model'; });
function record(): ReleaseRecord {
  const p = plan(root);
  return { schema: 1, tag: 'artifacts-aaaaaaaaaaaa', source_sha: 'a'.repeat(40), created_at: '2026-10-01T12:00:00Z', plan: p,
    tooling_digest: 'unit-test-only', review: { verdict: 'PASS', summary: 'Synthetic review.', findings: [], model: 'fixture', response_id: 'fixture' },
    runs: p.bundles.map(b => ({ schema: 1, implementation: b.implementation, id: b.id, target: b.target.id, input_digest: b.input_digest, package_digest: b.package_digest,
      case_digest: b.case_digest, source_revision: 'unit-test', created_at: '2026-10-01T12:00:00Z', execution: 'api', configuration: configuration(b),
      configuration_digest: fingerprint(configuration(b)), trials: [], baseline_trials: [], baseline_package_digest: null, baseline_kind: 'no-instructions', status: 'PASS', limitations: ['Synthetic publication fixture; not behavioural evidence.'] } as Run)) };
}
class MemoryGitHub extends GitHub {
  release: any = null; issues: any[] = []; assets = new Map<number, Buffer>(); created = 0; uploaded = 0; corrupt = false;
  constructor() { super('test/repository', 'fixture-token'); }
  override async request(path: string, method = 'GET', body?: any): Promise<any> {
    const short = path.slice(this.prefix.length).split('?')[0];
    if (short === '/releases' && method === 'POST') { this.created++; this.release = { id: 1, tag_name: body.tag_name, target_commitish: body.target_commitish, draft: body.draft, assets: [] }; return structuredClone(this.release); }
    if (short === '/releases/1' && method === 'PATCH') { this.release.draft = body.draft; return structuredClone(this.release); }
    if (short === '/releases/1') return structuredClone(this.release);
    if (short.startsWith('/releases/tags/')) return structuredClone(this.release);
    if (short === '/releases/latest') return this.release && !this.release.draft ? structuredClone(this.release) : null;
    if (short.startsWith('/git/ref/tags/')) return this.release && !this.release.draft ? { object: { type: 'commit', sha: this.release.target_commitish } } : null;
    if (short === '/issues' && method === 'GET') return structuredClone(this.issues);
    if (short === '/issues' && method === 'POST') { const issue = { number: this.issues.length + 1, ...body }; this.issues.push(issue); return structuredClone(issue); }
    if (/^\/issues\/\d+$/.test(short)) { const issue = this.issues[Number(short.split('/').at(-1)) - 1]; if (method === 'PATCH') Object.assign(issue, body); return structuredClone(issue); }
    throw new Error(`Unexpected mock request: ${method} ${path}`);
  }
  override async bytes(path: string): Promise<Buffer> {
    const id = Number(path.split('/').at(-1)), bytes = this.assets.get(id); assert(bytes);
    return this.corrupt ? Buffer.concat([bytes, Buffer.from('corrupt')]) : bytes;
  }
  override async upload(_release: number, name: string, bytes: Buffer): Promise<any> {
    const id = this.assets.size + 10; this.uploaded++; this.assets.set(id, bytes);
    const asset = { id, name, digest: `sha256:${digest(bytes)}` }; this.release.assets.push(asset); return asset;
  }
}
function stage(t: any): string {
  const path = mkdtempSync(join(tmpdir(), 'release-test-')); t.after(() => rmSync(path, { recursive: true, force: true }));
  const r = record(), assets = releaseAssets(r);
  for (const [name, bytes] of Object.entries(assets)) writeFileSync(join(path, name), bytes);
  writeJSON(join(path, 'publication.json'), { tag: r.tag, source_sha: r.source_sha, assets: Object.fromEntries(Object.entries(assets).map(([name, b]) => [name, digest(b)])) }); return path;
}
test('release packages preserve the exact evaluated source bytes', () => {
  const r = record(), assets = releaseAssets(r);
  for (const b of r.plan.bundles) {
    const files = unzip(assets[`${b.id}--${b.target.id}.zip`]);
    for (const [path, source] of Object.entries(b.files)) assert.equal(files[`${b.id}/${path}`].toString(), source);
    assert(files['evidence.json']); assert(files['INSTALL.md']);
    assert.equal(JSON.parse(files['manifest.json'].toString()).implementation, b.implementation);
    assert.equal(JSON.parse(files['evidence.json'].toString()).implementation, b.implementation);
  }
});
test('publication reads back assets, creates a catalogue and is idempotent', async t => {
  const path = stage(t), gh = new MemoryGitHub();
  await publish(path, gh); const count = gh.uploaded;
  assert.equal(gh.release.draft, false); assert.equal(gh.issues[0].title, 'Usage catalogue');
  assert.match(gh.issues[0].body, /prompts\/clear-technical-responses\/chatgpt.md/);
  await publish(path, gh); assert.equal(gh.created, 1); assert.equal(gh.uploaded, count); assert.equal(gh.issues.length, 1);
});
test('corrupt read-back prevents publication', async t => {
  const path = stage(t), gh = new MemoryGitHub(); gh.corrupt = true;
  await assert.rejects(publish(path, gh), /conflict/); assert.equal(gh.release.draft, true);
});
test('staged asset tampering is rejected before an external write', async t => {
  const path = stage(t), gh = new MemoryGitHub(); writeFileSync(join(path, 'release.json'), '{}');
  await assert.rejects(publish(path, gh), /digest mismatch/); assert.equal(gh.created, 0);
});
test('release conflict cannot overwrite previously published bytes', async t => {
  const path = stage(t), gh = new MemoryGitHub(); await publish(path, gh);
  const first = gh.release.assets[0]; gh.assets.set(first.id, Buffer.from('different published bytes'));
  await assert.rejects(publish(path, gh), /conflict/); assert.equal(gh.created, 1);
});
test('evidence from an untrusted workflow event is rejected', async () => {
  class WrongEvent extends GitHub {
    constructor() { super('test/repository'); }
    override async request(path: string): Promise<any> {
      if (path.includes('/actions/artifacts?')) return { total_count: 1, artifacts: [{ id: 3, expired: false, workflow_run: { id: 4 } }] };
      return { event: 'pull_request', conclusion: 'success', path: '.github/workflows/check.yml' };
    }
  }
  await assert.rejects(acceptedProof(new WrongEvent(), 'a'.repeat(40)), /No successful trusted/);
});
test('successful trusted evidence is loaded by exact head SHA', async () => {
  const head = 'a'.repeat(40);
  class TrustedEvent extends GitHub {
    constructor() { super('test/repository'); }
    override async request(path: string): Promise<any> {
      if (path.includes('/actions/artifacts?')) return { total_count: 1, artifacts: [{ id: 3, expired: false, workflow_run: { id: 4 } }] };
      return { event: 'pull_request_target', conclusion: 'success', path: '.github/workflows/check.yml' };
    }
    override async bytes(): Promise<Buffer> { return zip({ 'proof.json': JSON.stringify({ schema: 1, head_sha: head }) }); }
  }
  assert.equal((await acceptedProof(new TrustedEvent(), head)).head_sha, head);
  await assert.rejects(acceptedProof(new TrustedEvent(), 'b'.repeat(40)), /No successful trusted/);
});

test('a regression changes the catalogue without rewriting release history', async t => {
  const path = stage(t), gh = new MemoryGitHub(); await publish(path, gh);
  const before = Object.fromEntries([...gh.assets.entries()].map(([id, bytes]) => [id, digest(bytes)]));
  const b = record().plan.bundles[0], key = `${b.id}:${b.target.id}:${b.package_digest}`;
  await catalogue(gh, { [key]: { status: 'FAIL', date: '2026-10-02T12:00:00Z', detail: 'Synthetic regression fixture.' } });
  assert.match(gh.issues[0].body, /FAIL/);
  assert.deepEqual(Object.fromEntries([...gh.assets.entries()].map(([id, bytes]) => [id, digest(bytes)])), before);
});

test('only history changes qualify for offline-only checks, including renames', () => {
  assert.equal(historyOnly([{ filename: 'history/runs/2026-10/run.json' }]), true);
  for (const changes of [[], [{ filename: 'prompts/a.md' }], [{ filename: 'history/a.json' }, { filename: 'project.json' }], [{ filename: 'history/a.md', previous_filename: 'prompts/a.md' }]]) assert.equal(historyOnly(changes), false);
});
test('history-only merges cannot stage a release, even through manual dispatch', async () => {
  class HistoryGitHub extends GitHub {
    override async all(path: string): Promise<any[]> {
      if (path.includes('/commits/')) return [{ number: 1, merged_at: '2026-10-02', merge_commit_sha: 'a'.repeat(40) }];
      return [{ filename: 'history/runs/2026-10/fixture.json' }];
    }
    override async request(): Promise<any> { throw new Error('History must not request release evidence'); }
  }
  assert.equal(await stageRelease(root, '/unused', new HistoryGitHub('test/repository'), 'a'.repeat(40)), false);
});
test('trusted classification rejects stale events and incomplete file lists', async () => {
  class ScopeGitHub extends GitHub {
    count = 1; stale = false;
    override async request(): Promise<any> {
      return { state: 'open', changed_files: this.count, head: { sha: this.stale ? 'd'.repeat(40) : 'a'.repeat(40) }, base: { sha: 'b'.repeat(40) }, merge_commit_sha: 'c'.repeat(40) };
    }
    override async all(): Promise<any[]> { return [{ filename: 'history/runs/2026-10/fixture.json' }]; }
  }
  const gh = new ScopeGitHub('test/repository');
  assert.deepEqual(await classifyPR(gh, 1, 'a'.repeat(40), 'b'.repeat(40)), { history_only: true, source_sha: 'c'.repeat(40) });
  gh.count = 2; await assert.rejects(classifyPR(gh, 1, 'a'.repeat(40), 'b'.repeat(40)), /incomplete/);
  gh.stale = true; await assert.rejects(classifyPR(gh, 1, 'a'.repeat(40), 'b'.repeat(40)), /stale/);
});
