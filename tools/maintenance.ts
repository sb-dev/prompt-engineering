import { join } from 'node:path';
import { assert, fingerprint, readJSON, writeJSON } from './core.ts';
import { catalogue, latestRelease } from './delivery.ts';
import { evaluateBundle } from './evaluation.ts';
import { previousAnalysis, sourceValid } from './ingestion.ts';
import type { Source } from './ingestion.ts';
import { GitHub, OpenAI } from './services.ts';

type Maintenance = { schema: 1; release_tag: string | null; updates: Record<string, { status: string; date: string; detail: string }>; issues: { marker: string; title: string; body: string }[] };
export async function maintain(root: string, out: string, gh: GitHub): Promise<void> {
  const result: Maintenance = { schema: 1, release_tag: null, updates: {}, issues: [] };
  const save = () => writeJSON(join(out, 'maintenance.json'), result); save();
  const sources = readJSON<{ sources: Source[] }>(root, 'knowledge/sources.json').sources;
  for (const source of sources.filter(s => s.monitor)) {
    sourceValid(source);
    const remote = new GitHub(source.repository, gh.token, gh.fetcher);
    const current = await remote.request(`${remote.prefix}/commits/${encodeURIComponent(source.ref)}`);
    const previous = previousAnalysis(root, source);
    if (!current || current.sha === previous?.source_sha) continue;
    let relevant = true;
    if (previous) {
      const diff = await remote.request(`${remote.prefix}/compare/${previous.source_sha}...${current.sha}`);
      if (diff?.status === 'ahead' && diff.files?.length < 300) relevant = diff.files.some((f: any) => [f.filename, f.previous_filename].filter(Boolean).some((p: string) =>
        (!source.include.length || source.include.some(q => p === q || p.startsWith(q + '/'))) && !source.exclude.some(q => p === q || p.startsWith(q + '/'))));
    }
    if (relevant) result.issues.push({ marker: `<!-- source-update:${source.id} -->`, title: `Source update: ${source.id}`,
      body: `Source: ${source.repository}. Previous complete scoped analysis: ${previous?.source_sha ?? 'none'}. Current revision: ${current.sha}.\n\nRun the ingestion workflow with the registered scope and question:\n\n${source.question}\n\nNo knowledge or prompt change has been assumed.` });
    save();
  }
  const release = await latestRelease(gh); if (!release) return;
  result.release_tag = release.tag;
  const client = new OpenAI(release.plan.project.limits);
  result.updates = Object.fromEntries(release.plan.bundles.map(b => [`${b.id}:${b.target.id}:${b.package_digest}`, { status: 'PENDING', date: new Date().toISOString(), detail: 'Revalidation did not yet complete.' }])); save();
  for (const bundle of release.plan.bundles) {
    if (bundle.target.execution === 'manual') {
      result.issues.push({ marker: `<!-- compatibility:${fingerprint(bundle.id + bundle.target.id).slice(0, 16)} -->`, title: `Record a new manual session for ${bundle.id}`, body: `Target ${bundle.target.id} requires fresh manual evidence. Run its cases and commit the record through the normal PR process. Historical evidence is not a new execution.` });
      save(); continue;
    }
    const run = await evaluateBundle(bundle, release.plan, root, release.source_sha, client, bundle);
    writeJSON(join(out, `${bundle.id}--${bundle.target.id}.json`), run);
    const key = `${bundle.id}:${bundle.target.id}:${bundle.package_digest}`;
    result.updates[key] = { status: run.status, date: run.created_at,
      detail: `Unchanged release tested with ${String(run.configuration.requested_model)}. ${run.status === 'BLOCKED' ? 'Missing evidence or execution failure; not a model defect.' : 'See maintenance run evidence.'}` };
    if (run.status !== 'PASS') result.issues.push({ marker: `<!-- compatibility:${fingerprint(key).slice(0, 16)} -->`, title: `Revalidate ${bundle.id} on ${bundle.target.id}`,
      body: `Result: ${run.status}. Release: ${release.tag}. Package: ${bundle.package_digest}.\n\nConfiguration: ${JSON.stringify(run.configuration)}\n\n`
      + `Run evidence: ${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${gh.repository}/actions/runs/${process.env.GITHUB_RUN_ID ?? 'unknown'}.\n\nInvestigate the recorded cases. A changed result is not proof of a model update.` });
    save();
  }
}
export async function publishMaintenance(root: string, gh: GitHub): Promise<void> {
  const record = readJSON<Maintenance>(root, 'maintenance.json'); assert(record.schema === 1, 'Unsupported maintenance record');
  for (const issue of record.issues) {
    assert(/^<!-- (source-update|compatibility):[a-z0-9-]+ -->$/.test(issue.marker), 'Invalid maintenance issue identity');
    await gh.upsertIssue(issue.marker, issue.title, issue.body);
  }
  const current = await latestRelease(gh);
  if (current?.tag === record.release_tag) await catalogue(gh, record.updates);
}
