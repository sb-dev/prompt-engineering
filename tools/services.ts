import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { assert, safeRelative, text } from './core.ts';
import type { Project } from './core.ts';

export type Fetcher = typeof fetch;
export type Completion = { text: string; model: string; id: string; usage: unknown };
export const stringSchema = { type: 'string' };
export const boolSchema = { type: 'boolean' };
export const arraySchema = (items: unknown) => ({ type: 'array', items });
export const objectSchema = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export class OpenAI {
  calls = 0;
  readonly limits: Project['limits'];
  readonly fetcher: Fetcher;
  constructor(limits: Project['limits'], fetcher: Fetcher = fetch) { this.limits = limits; this.fetcher = fetcher; }
  async complete(model: string, instructions: string, input: string, schema?: unknown): Promise<Completion> {
    text(process.env.OPENAI_API_KEY, 'OPENAI_API_KEY'); text(model, 'model ID');
    assert(++this.calls <= this.limits.max_calls, 'Model call budget exhausted');
    const response = await this.fetcher('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, instructions, input, store: false, max_output_tokens: this.limits.max_output_tokens,
        ...(schema ? { text: { format: { type: 'json_schema', name: 'result', strict: true, schema } } } : {}) }),
      signal: AbortSignal.timeout(this.limits.timeout_seconds * 1000),
    });
    assert(response.ok, `OpenAI request failed: HTTP ${response.status}`);
    const data = await response.json() as any;
    assert(data.status === 'completed', `OpenAI response was not completed (${data.status ?? 'unknown'})`);
    const output = (data.output ?? []).filter((x: any) => x.type === 'message').flatMap((x: any) => x.content ?? []);
    assert(!output.some((x: any) => x.type === 'refusal'), 'OpenAI returned a refusal');
    const result = output.filter((x: any) => x.type === 'output_text').map((x: any) => x.text).join('\n');
    text(result, 'model output', 200000); text(data.model, 'reported model'); text(data.id, 'response ID');
    return { text: result, model: data.model, id: data.id, usage: data.usage ?? null };
  }
}
export function repoName(value: string): string {
  assert(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value) && !value.includes('..'), 'Expected owner/repository');
  return value;
}
export class GitHub {
  readonly repository: string;
  readonly token: string;
  readonly fetcher: Fetcher;
  constructor(repository: string, token = process.env.GH_TOKEN ?? '', fetcher: Fetcher = fetch) {
    this.repository = repoName(repository); this.token = token; this.fetcher = fetcher;
  }
  async request(path: string, method = 'GET', body?: unknown): Promise<any> {
    assert(path.startsWith('/') && !path.startsWith('//'), 'Invalid GitHub API path');
    const r = await this.fetcher(`https://api.github.com${path}`, { method,
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(60000) });
    if (r.status === 404 && method === 'GET') return null;
    assert(r.ok, `GitHub ${method} ${path.split('?')[0]} failed: HTTP ${r.status}`);
    return r.status === 204 ? null : r.json();
  }
  get prefix(): string { return `/repos/${this.repository}`; }
  async all(path: string): Promise<any[]> {
    const out: any[] = [];
    for (let page = 1; page <= 10; page++) {
      const result = await this.request(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      assert(Array.isArray(result), `Expected a paginated list: ${path}`);
      out.push(...result); if (result.length < 100) return out;
    }
    throw new Error('Pagination limit reached; result would be incomplete');
  }
  async bytes(path: string): Promise<Buffer> {
    assert(path.startsWith(`${this.prefix}/`), 'Asset endpoint is outside the repository');
    const r = await this.fetcher(`https://api.github.com${path}`, { headers: { Accept: 'application/octet-stream', Authorization: `Bearer ${this.token}` }, signal: AbortSignal.timeout(60000) });
    assert(r.ok, `GitHub download failed: HTTP ${r.status}`);
    const bytes = Buffer.from(await r.arrayBuffer()); assert(bytes.length <= 12000000, 'Downloaded asset exceeds 12 MB'); return bytes;
  }
  async upload(release: number, name: string, bytes: Buffer): Promise<any> {
    safeRelative(name); assert(!name.includes('/'), 'Release asset name must be a filename');
    const r = await this.fetcher(`https://uploads.github.com${this.prefix}/releases/${release}/assets?name=${encodeURIComponent(name)}`, {
      method: 'POST', headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array(bytes), signal: AbortSignal.timeout(60000),
    });
    assert(r.ok, `GitHub upload failed: HTTP ${r.status}`); return r.json();
  }
  async snapshot(sha: string, out: string): Promise<void> {
    assert(/^[a-f0-9]{40}$/.test(sha), 'Snapshot requires an exact commit SHA');
    const data = await this.request(`${this.prefix}/git/trees/${sha}?recursive=1`);
    assert(data && !data.truncated, 'Repository tree is missing or truncated');
    const rows = data.tree.filter((f: any) => f.type === 'blob' && (!/(^|\/)\.env($|\.)/.test(f.path) || f.path.endsWith('.env.example')));
    assert(rows.length <= 500, 'Repository exceeds the 500-file snapshot limit');
    let total = 0;
    for (const file of rows) {
      safeRelative(file.path); assert(['100644', '100755'].includes(file.mode), `Unsafe file mode: ${file.path}`);
      assert(file.size <= 300000, `File exceeds snapshot limit: ${file.path}`); total += file.size;
      assert(total <= 3000000, 'Snapshot exceeds 3 MB limit');
      const blob = await this.request(`${this.prefix}/git/blobs/${file.sha}`);
      assert(blob?.encoding === 'base64', 'Unsupported GitHub blob response');
      const bytes = Buffer.from(blob.content, 'base64');
      const path = join(out, file.path); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes);
    }
  }
  async upsertIssue(marker: string, title: string, body: string): Promise<number> {
    const issues = await this.all(`${this.prefix}/issues?state=all`);
    const old = issues.find((i: any) => !i.pull_request && i.body?.includes(marker));
    const payload = { title, body: `${marker}\n\n${body}`, state: 'open' };
    const written = old ? await this.request(`${this.prefix}/issues/${old.number}`, 'PATCH', payload) : await this.request(`${this.prefix}/issues`, 'POST', payload);
    const current = await this.request(`${this.prefix}/issues/${written.number}`);
    assert(current?.body === payload.body && current?.state === 'open', 'Issue read-back mismatch');
    return current.number;
  }
}
