import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { assert, object, plan, readJSON, safeRelative, stable, text, walk } from './core.ts';
import type { Project } from './core.ts';

export type ToolRun = { url?: string; device?: string; session_id?: string };
export type UsageRun = {
  schema: 1; run_id: string; artifact: string; target: string; implementation: string;
  package_digest: string; created_at: string; tool_run: ToolRun;
  source_revision?: string; model?: string; notes?: string;
};
export function validateToolRun(value: unknown): asserts value is ToolRun {
  object(value, 'tool_run');
  for (const key of Object.keys(value)) assert(['url', 'device', 'session_id'].includes(key), `Unknown tool_run field: ${key}`);
  for (const key of ['url', 'device', 'session_id']) if (key in value) {
    text(value[key], `tool_run.${key}`, 4096);
    assert(!/[\u0000-\u0020\u007f]/.test(value[key] as string), `tool_run.${key} cannot contain whitespace or controls`);
  }
  if (value.url !== undefined) {
    const url = new URL(value.url as string);
    assert(url.protocol === 'https:' && !!url.hostname && !url.username && !url.password, 'Tool run URL must use HTTPS without credentials');
  }
  assert((value.device === undefined) === (value.session_id === undefined), 'Supply both device and session_id');
  assert(value.url !== undefined || value.device !== undefined, 'Tool run requires a URL or device and session_id');
}
export function validateUsageRun(value: unknown, project: Project): UsageRun {
  object(value, 'usage run');
  assert(value.schema === 1, 'Unsupported usage schema');
  const keys = ['schema', 'run_id', 'artifact', 'target', 'implementation', 'package_digest', 'created_at', 'tool_run', 'source_revision', 'model', 'notes'];
  for (const key of Object.keys(value)) assert(keys.includes(key), `Unknown usage field: ${key}`);
  for (const key of ['run_id', 'artifact', 'target', 'implementation', 'package_digest', 'created_at']) text(value[key], key);
  assert(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value.run_id as string), 'Invalid run_id');
  const artifact = project.artifacts.find(a => a.id === value.artifact);
  assert(artifact?.kind === 'prompt', 'Usage artifact must be a declared prompt');
  assert(Object.hasOwn(artifact.implementations, value.target as string), 'Usage target is not declared by this prompt');
  assert(artifact.implementations[value.target as string] === value.implementation, 'Usage implementation does not match the target');
  safeRelative(value.implementation as string);
  assert(/^[a-f0-9]{64}$/.test(value.package_digest as string), 'Invalid package_digest');
  const date = value.created_at as string;
  assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(date) && Number.isFinite(Date.parse(date))
    && new Date(date).toISOString() === date.replace(/Z$/, date.includes('.') ? 'Z' : '.000Z'), 'Invalid UTC timestamp');
  validateToolRun(value.tool_run);
  if (value.source_revision !== undefined) assert(typeof value.source_revision === 'string' && /^[a-f0-9]{40}$/.test(value.source_revision), 'Invalid source_revision');
  for (const key of ['model', 'notes']) if (value[key] !== undefined) text(value[key], key, 4000);
  return value as UsageRun;
}
export function validateHistory(root: string, project: Project): UsageRun[] {
  if (!existsSync(join(root, 'history'))) return [];
  assert(!lstatSync(join(root, 'history')).isSymbolicLink(), 'History directory must not be a symlink');
  const ids = new Set<string>();
  return walk(root, 'history').filter(path => path.endsWith('.json')).map(path => {
    const record = validateUsageRun(readJSON(root, path), project);
    assert(path === `history/runs/${record.created_at.slice(0, 7)}/${record.run_id}.json`, `History path must match date and run_id: ${path}`);
    assert(!ids.has(record.run_id), 'Duplicate usage run_id'); ids.add(record.run_id);
    return record;
  }).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.run_id.localeCompare(b.run_id));
}
function sourceRevision(root: string, implementation: string): string | undefined {
  try {
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (realpathSync(git('rev-parse', '--show-toplevel')) !== realpathSync(root)) return undefined;
    git('ls-files', '--error-unmatch', '--', implementation);
    if (git('status', '--porcelain', '--', implementation)) return undefined;
    return git('rev-parse', 'HEAD');
  } catch { return undefined; }
}
export function recordRun(root: string, options: {
  artifact: string; target: string; tool_run: ToolRun; run_id?: string; model?: string; notes?: string;
}): UsageRun {
  const p = plan(root), existing = validateHistory(root, p.project);
  const b = p.bundles.find(b => b.id === options.artifact && b.target.id === options.target);
  assert(b?.kind === 'prompt', 'Select a declared prompt and target');
  const run_id = options.run_id ?? randomUUID(), prior = existing.find(r => r.run_id === run_id);
  const revision = sourceRevision(root, b.implementation);
  const record: UsageRun = { schema: 1, run_id, artifact: b.id, target: b.target.id, implementation: b.implementation,
    package_digest: b.package_digest, created_at: prior?.created_at ?? new Date().toISOString(), tool_run: options.tool_run,
    ...(revision ? { source_revision: revision } : {}), ...(options.model ? { model: options.model } : {}), ...(options.notes ? { notes: options.notes } : {}) };
  validateUsageRun(record, p.project);
  if (prior) { assert(stable(prior) === stable(record), 'run_id already exists with different content'); return prior; }
  const path = join(root, 'history/runs', record.created_at.slice(0, 7), `${run_id}.json`);
  mkdirSync(dirname(path), { recursive: true });
  // Refuse replacement, including concurrent retries. Read the saved state back.
  writeFileSync(path, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
  const saved = readJSON(root, `history/runs/${record.created_at.slice(0, 7)}/${run_id}.json`);
  assert(stable(saved) === stable(record), 'Usage record read-back mismatch');
  return validateUsageRun(saved, p.project);
}
export function renderHistory(records: UsageRun[]): string {
  // Escape control characters in labels so imported records cannot alter terminal output.
  const cell = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, c => JSON.stringify(c).slice(1, -1));
  return ['DATE\tTARGET\tIMPLEMENTATION\tPACKAGE DIGEST\tTOOL RUN', ...records.map(r => [r.created_at, r.target, r.implementation, r.package_digest,
    [r.tool_run.url, r.tool_run.device ? `${r.tool_run.device}:${r.tool_run.session_id}` : undefined].filter(Boolean).join(' ')].map(cell).join('\t'))].join('\n');
}
