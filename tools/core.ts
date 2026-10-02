import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { validateHistory } from './history.ts';

export type Verdict = 'PASS' | 'FAIL' | 'BLOCKED';
export type Artifact = { id: string; cases: string[] } & (
  { kind: 'prompt'; implementations: Record<string, string> } |
  { kind: 'skill'; source: string; targets: string[] }
);
export type Case = { id: string; input: string; expected: string[]; fail_if: string[]; contains: string[]; not_contains: string[]; skill_activation: boolean };
export type Target = { id: string; application: string; execution: 'api' | 'manual'; model_env: string; grader_model_env: string; instructions: string; install: string; limitations: string[] };
export type Project = { schema: number; limits: { max_calls: number; timeout_seconds: number; max_output_tokens: number }; evaluation: { trials: number; minimum_pass_rate: number }; artifacts: Artifact[] };
export type Bundle = { implementation: string; id: string; kind: 'prompt' | 'skill'; target: Target; limits: Project['limits']; files: Record<string, string>; package_digest: string; cases: Case[]; case_digest: string; input_digest: string };
export type Plan = { schema: 1; project: Project; bundles: Bundle[]; manual_evidence: Record<string, string>; digest: string };

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
export const digest = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
export const fingerprint = (value: unknown): string => digest(stable(value));
export function object(value: unknown, label: string): asserts value is Record<string, unknown> {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
}
export function text(value: unknown, label: string, max = 100000): asserts value is string {
  assert(typeof value === 'string' && value.trim().length > 0 && value.length <= max, `${label} must be non-empty text (max ${max})`);
}
export function texts(value: unknown, label: string, nonempty = true): asserts value is string[] {
  assert(Array.isArray(value) && (!nonempty || value.length > 0), `${label} must be a list`);
  for (const item of value) text(item, label);
  assert(new Set(value).size === value.length, `${label} contains duplicates`);
}
export function safeRelative(path: string): string {
  assert(typeof path === 'string' && /^[A-Za-z0-9_.-][A-Za-z0-9_./-]*$/.test(path) && path.length <= 512, `Unsafe path: ${path}`);
  assert(path.split('/').every(p => p !== '..' && p !== '.' && p !== ''), `Unsafe path: ${path}`);
  return path;
}
export function safeRead(root: string, relative: string, max = 300000): string {
  safeRelative(relative);
  const base = realpathSync(root);
  let current = base;
  for (const part of relative.split('/')) {
    current = join(current, part);
    assert(!lstatSync(current).isSymbolicLink(), `Symlink is not allowed: ${relative}`);
  }
  assert(realpathSync(current).startsWith(base + sep), `Path escapes root: ${relative}`);
  const stat = lstatSync(current);
  assert(stat.isFile() && stat.size <= max, `Not a bounded file: ${relative}`);
  const value = readFileSync(current, 'utf8');
  assert(!value.includes('\0'), `Binary file is not supported: ${relative}`);
  return value;
}
export function readJSON<T = unknown>(root: string, path: string): T {
  return JSON.parse(safeRead(root, path)) as T;
}
export function writeJSON(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}
export function walk(root: string, prefix = ''): string[] {
  const names = readdirSync(join(root, prefix)).sort();
  return names.flatMap(name => {
    if (['.git', 'node_modules', 'build'].includes(name)) return [];
    const path = prefix ? `${prefix}/${name}` : name;
    safeRelative(path);
    const stat = lstatSync(join(root, path));
    assert(!stat.isSymbolicLink(), `Symlink is not allowed: ${path}`);
    return stat.isDirectory() ? walk(root, path) : [path];
  });
}
export function validateCase(value: unknown): Case {
  object(value, 'case');
  text(value.id, 'case.id', 80); text(value.input, 'case.input');
  texts(value.expected, 'case.expected'); texts(value.fail_if, 'case.fail_if');
  texts(value.contains, 'case.contains', false); texts(value.not_contains, 'case.not_contains', false);
  assert(typeof value.skill_activation === 'boolean', 'case.skill_activation must be boolean');
  return value as Case;
}
export function validateTarget(value: unknown): Target {
  object(value, 'target');
  for (const key of ['id', 'application', 'model_env', 'instructions', 'install']) text(value[key], `target.${key}`);
  assert(value.execution === 'api' || value.execution === 'manual', 'Unknown target execution');
  assert(typeof value.grader_model_env === 'string', 'Missing grader_model_env');
  assert(/^[A-Z][A-Z0-9_]*$/.test(value.model_env as string), 'Invalid model environment variable');
  assert(value.grader_model_env === '' || /^[A-Z][A-Z0-9_]*$/.test(value.grader_model_env), 'Invalid grader environment variable');
  texts(value.limitations, 'target.limitations', false);
  return value as Target;
}
export function loadProject(root: string): Project {
  const p = readJSON(root, 'project.json'); object(p, 'project');
  assert(p.schema === 2, 'Unsupported project schema'); object(p.limits, 'limits'); object(p.evaluation, 'evaluation');
  for (const [key, max] of [['max_calls', 200], ['timeout_seconds', 120], ['max_output_tokens', 8000]] as const) {
    assert(Number.isInteger(p.limits[key]) && Number(p.limits[key]) > 0 && Number(p.limits[key]) <= max, `Invalid limits.${key}`);
  }
  assert(Number.isInteger(p.evaluation.trials) && Number(p.evaluation.trials) >= 1 && Number(p.evaluation.trials) <= 5, 'trials must be 1–5');
  assert(typeof p.evaluation.minimum_pass_rate === 'number' && p.evaluation.minimum_pass_rate >= 0.5 && p.evaluation.minimum_pass_rate <= 1, 'Invalid minimum_pass_rate');
  assert(Array.isArray(p.artifacts) && p.artifacts.length > 0 && p.artifacts.length <= 30, 'Expected 1–30 artifacts');
  const ids = new Set();
  for (const a of p.artifacts) {
    object(a, 'artifact'); text(a.id, 'artifact.id', 64);
    assert(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.id) && !ids.has(a.id), 'Invalid or duplicate artifact id'); ids.add(a.id);
    assert(a.kind === 'prompt' || a.kind === 'skill', 'Unknown artifact kind');
    let targets: string[];
    if (a.kind === 'prompt') {
      assert(!('source' in a) && !('targets' in a), 'Prompts use implementations, not source or targets');
      object(a.implementations, 'artifact.implementations');
      targets = Object.keys(a.implementations); texts(targets, 'implementation targets');
      for (const source of Object.values(a.implementations)) {
        text(source, 'implementation path');
        assert(safeRelative(source).startsWith('prompts/') && source.endsWith('.md'), 'Prompt implementation must be Markdown under prompts/');
      }
    } else {
      assert(!('implementations' in a), 'Skills use source and targets');
      text(a.source, 'artifact.source');
      assert(safeRelative(a.source).startsWith('skills/'), 'Artifact source is outside its content directory');
      texts(a.targets, 'artifact.targets'); targets = a.targets;
    }
    texts(a.cases, 'artifact.cases');
    assert(a.cases.length <= 20, 'Too many cases in one artifact');
    for (const t of targets) assert(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(t), 'Invalid target id');
    for (const path of a.cases) assert(safeRelative(path).startsWith('evaluations/cases/'), 'Case must be under evaluations/cases/');
  }
  return p as Project;
}
export function skillMetadata(content: string): { name: string; description: string; body: string } {
  // This repo deliberately uses only two single-line frontmatter fields.
  const m = /^---\r?\n([\s\S]+?)\r?\n---\r?\n([\s\S]*)$/.exec(content);
  assert(m, 'SKILL.md requires YAML frontmatter');
  const name = /^name: ([a-z0-9]+(?:-[a-z0-9]+)*)$/m.exec(m[1])?.[1];
  const description = /^description: (.+)$/m.exec(m[1])?.[1];
  text(name, 'skill name', 64); text(description, 'skill description', 1024); text(m[2], 'skill body');
  return { name, description, body: m[2] };
}
export function plan(root: string): Plan {
  const project = loadProject(root);
  const bundles: Bundle[] = [];
  for (const artifact of project.artifacts) {
    const cases = artifact.cases.map(path => validateCase(readJSON(root, path)));
    assert(new Set(cases.map(c => c.id)).size === cases.length, 'Duplicate case IDs');
    if (artifact.kind === 'skill') assert(cases.some(c => c.skill_activation) && cases.some(c => !c.skill_activation), 'Skills require activation and non-activation cases');
    const implementations = artifact.kind === 'prompt' ? artifact.implementations : Object.fromEntries(artifact.targets.map(id => [id, artifact.source]));
    for (const [id, implementation] of Object.entries(implementations)) {
      const files: Record<string, string> = Object.create(null);
      if (artifact.kind === 'prompt') files[`${artifact.id}.md`] = safeRead(root, implementation);
      else {
        for (const file of walk(root, implementation)) files[file.slice(implementation.length + 1)] = safeRead(root, file);
        const meta = skillMetadata(files['SKILL.md']);
        assert(meta.name === artifact.id && implementation.endsWith(`/${artifact.id}`), 'Skill id, directory and name must match');
      }
      assert(Object.keys(files).length <= 50, 'Too many files in artifact');
      const target = validateTarget(readJSON(root, `platforms/${id}.json`));
      assert(id === target.id, 'Target filename/id mismatch');
      const package_digest = fingerprint(files), case_digest = fingerprint(cases);
      const input_digest = fingerprint({ implementation, package_digest, cases, target, evaluation: project.evaluation, limits: project.limits });
      bundles.push({ implementation, id: artifact.id, kind: artifact.kind, target, limits: project.limits, files, package_digest, cases, case_digest, input_digest });
    }
  }
  const manual_evidence = Object.fromEntries(bundles.filter(b => b.target.execution === 'manual').map(b => {
    const path = `evaluations/manual/${b.id}--${b.target.id}.json`;
    return [path, existsSync(join(root, path)) ? digest(safeRead(root, path)) : 'missing'];
  }));
  return { schema: 1, project, bundles, manual_evidence, digest: fingerprint({ inputs: bundles.map(b => b.input_digest), manual_evidence }) };
}
export function validate(root: string): Plan {
  const result = plan(root);
  validateHistory(root, result.project);
  for (const path of walk(root).filter(p => p.endsWith('.json') && !p.includes('package-lock'))) readJSON(root, path);
  for (const path of walk(root).filter(p => p.endsWith('.md'))) {
    const content = safeRead(root, path);
    for (const match of content.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
      const link = match[1].split('#')[0];
      if (!link || /^(https?:|mailto:|\/)/.test(link)) continue;
      const target = resolve(root, dirname(path), link);
      assert(target.startsWith(resolve(root) + sep) && existsSync(target), `Broken local link in ${path}: ${link}`);
    }
  }
  return result;
}

// Deterministic stored ZIP. A fixed timestamp and sorted names make digest checks repeatable.
// Packages are small text files; compression would add a runtime dependency without much benefit.
export function zip(files: Record<string, string | Buffer>): Buffer {
  const local: Buffer[] = [], central: Buffer[] = []; let offset = 0;
  for (const name of Object.keys(files).sort()) {
    safeRelative(name);
    const bytes = Buffer.isBuffer(files[name]) ? files[name] as Buffer : Buffer.from(files[name] as string);
    const filename = Buffer.from(name); let crc = 0xffffffff;
    for (const byte of bytes) { crc ^= byte; for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    crc = (crc ^ 0xffffffff) >>> 0;
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x800, 6);
    h.writeUInt16LE(33, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(bytes.length, 18); h.writeUInt32LE(bytes.length, 22); h.writeUInt16LE(filename.length, 26);
    local.push(h, filename, bytes);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x800, 8);
    c.writeUInt16LE(33, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(bytes.length, 20); c.writeUInt32LE(bytes.length, 24);
    c.writeUInt16LE(filename.length, 28); c.writeUInt32LE(offset, 42); central.push(c, filename);
    offset += h.length + filename.length + bytes.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22), count = Object.keys(files).length;
  assert(count <= 65535, 'ZIP has too many entries');
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
export function unzip(buffer: Buffer, maxBytes = 12000000): Record<string, Buffer> {
  assert(buffer.length <= maxBytes, 'Archive exceeds limit');
  let e = buffer.length - 22;
  while (e >= Math.max(0, buffer.length - 65557) && buffer.readUInt32LE(e) !== 0x06054b50) e--;
  assert(e >= 0 && buffer.readUInt32LE(e) === 0x06054b50, 'ZIP end record not found');
  const count = buffer.readUInt16LE(e + 10); let position = buffer.readUInt32LE(e + 16), total = 0;
  const out: Record<string, Buffer> = Object.create(null);
  for (let i = 0; i < count; i++) {
    assert(buffer.readUInt32LE(position) === 0x02014b50, 'Invalid ZIP directory');
    const method = buffer.readUInt16LE(position + 10), size = buffer.readUInt32LE(position + 20), expanded = buffer.readUInt32LE(position + 24);
    const n = buffer.readUInt16LE(position + 28), extra = buffer.readUInt16LE(position + 30), comment = buffer.readUInt16LE(position + 32);
    const name = buffer.subarray(position + 46, position + 46 + n).toString();
    const start = buffer.readUInt32LE(position + 42); position += 46 + n + extra + comment;
    if (name.endsWith('/')) continue;
    safeRelative(name); assert(!Object.hasOwn(out, name), 'Duplicate ZIP member');
    assert(buffer.readUInt32LE(start) === 0x04034b50, 'Invalid ZIP local header');
    total += expanded; assert(total <= maxBytes, 'Expanded archive exceeds limit');
    const dataStart = start + 30 + buffer.readUInt16LE(start + 26) + buffer.readUInt16LE(start + 28);
    const packed = buffer.subarray(dataStart, dataStart + size);
    assert(packed.length === size && [0, 8].includes(method), 'Unsupported or truncated ZIP entry');
    out[name] = method === 0 ? packed : inflateRawSync(packed, { maxOutputLength: maxBytes });
    assert(out[name].length === expanded, 'ZIP entry size mismatch');
  }
  return out;
}
export function packagePlan(p: Plan, out: string): void {
  mkdirSync(out, { recursive: true });
  for (const bundle of p.bundles) {
    const files = Object.fromEntries(Object.entries(bundle.files).map(([path, content]) => [`${bundle.id}/${path}`, content]));
    files['INSTALL.md'] = bundle.target.install + '\n\n' + bundle.target.limitations.map(s => `- ${s}`).join('\n') + '\n';
    files['manifest.json'] = JSON.stringify({ id: bundle.id, implementation: bundle.implementation, target: bundle.target, package_digest: bundle.package_digest, input_digest: bundle.input_digest, readiness: 'UNRELEASED: packaging is not behavioural verification' }, null, 2) + '\n';
    writeFileSync(join(out, `${bundle.id}--${bundle.target.id}.zip`), zip(files));
  }
  writeJSON(join(out, 'plan.json'), p);
}
