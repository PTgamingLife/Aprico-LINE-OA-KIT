// Apply a new oaw-template release to a customer's own repo, with their one-time consent.
// Only template code is touched: customer data (oaw/config.json, oaw/status.json,
// liff/config.js) and the database rows are never written. A file the customer changed
// is a conflict; it is kept unless they choose the new version. No AI is involved.
// Conflict reports carry no personal data: a project hash, the version, path and choice.
import { ghRequest } from './github-app.ts';
import { defaultJwt, PERMISSIONS, readStatus, repoToken } from './oaw-build.ts';
import RELEASE from './oaw-release.json' with { type: 'json' };
import RELEASE_FILES from './oaw-release-files.json' with { type: 'json' };

export const UPDATE_ACTIONS = ['oaw_update_plan', 'oaw_update_apply'];
// Updating workflow files needs one more permission than building.
const UPDATE_PERMISSIONS = { ...PERMISSIONS, workflows: 'write' };
const TEMPLATE_RAW = 'https://raw.githubusercontent.com/PTgamingLife/oaw-template/';
const VERSION_FILE = 'oaw/template-version.json';
// Customer data: never written, whatever a release manifest says.
const PROTECTED = new Set(['oaw/config.json', 'oaw/status.json', 'liff/config.js', VERSION_FILE]);

type Respond = (data: unknown, status?: number) => Response;
type FileSpec = { sha: string | null; mode: string; known: string[] };
export type Release = { version: string; ref: string; files: Record<string, FileSpec> };
export type Step = {
  path: string;
  action: 'add' | 'update' | 'delete' | 'conflict';
  kind?: 'modified' | 'deleted';
};

/** Compare the customer's tree with the release. Pure; tested directly. */
export function classify(release: Release, current: Record<string, string>): Step[] {
  const steps: Step[] = [];
  for (const [path, f] of Object.entries(release.files)) {
    if (PROTECTED.has(path) || path.includes('..')) continue;
    const have = current[path];
    if (f.sha === null) {
      // Removed from the template: delete only an untouched copy.
      if (!have) continue;
      steps.push(
        f.known.includes(have)
          ? { path, action: 'delete' }
          : { path, action: 'conflict', kind: 'modified' },
      );
      continue;
    }
    if (have === f.sha) continue;
    if (!have) {
      // Missing: new in this release, or the customer deleted a file they used to have.
      steps.push(
        f.known.length ? { path, action: 'conflict', kind: 'deleted' } : { path, action: 'add' },
      );
      continue;
    }
    steps.push(
      f.known.includes(have)
        ? { path, action: 'update' }
        : { path, action: 'conflict', kind: 'modified' },
    );
  }
  return steps.sort((a, b) => a.path.localeCompare(b.path));
}

/** Git blob SHA-1, to prove the downloaded file is exactly the released one. */
export async function blobSha(bytes: Uint8Array) {
  const head = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const all = new Uint8Array(head.length + bytes.length);
  all.set(head);
  all.set(bytes, head.length);
  const d = await crypto.subtle.digest('SHA-1', all);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

const b64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

async function projectHash(projectId: string) {
  const d = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode('oaw-update:' + projectId),
  );
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function readTree(repo: string, token: string, f: typeof fetch) {
  const info = await ghRequest(`/repos/${repo}`, token, 'GET', undefined, f);
  const branch = String(info.default_branch || 'main');
  if (!/^[-\w./]+$/.test(branch)) throw Error('branch_invalid');
  const ref = await ghRequest(`/repos/${repo}/git/ref/heads/${branch}`, token, 'GET', undefined, f);
  const head = ref.object.sha as string;
  const commit = await ghRequest(`/repos/${repo}/git/commits/${head}`, token, 'GET', undefined, f);
  const tree = await ghRequest(
    `/repos/${repo}/git/trees/${commit.tree.sha}?recursive=1`,
    token,
    'GET',
    undefined,
    f,
  );
  if (tree.truncated) throw Error('tree_too_large');
  const files: Record<string, string> = {};
  for (const e of tree.tree ?? []) if (e.type === 'blob') files[e.path] = e.sha;
  return { branch, head, baseTree: commit.tree.sha as string, files };
}

async function currentVersion(repo: string, token: string, f: typeof fetch) {
  const file = await ghRequest(
    `/repos/${repo}/contents/${VERSION_FILE}`,
    token,
    'GET',
    undefined,
    f,
  ).catch(() => null);
  try {
    const v = JSON.parse(atob(String(file?.content ?? '').replace(/\s/g, ''))).version;
    return typeof v === 'string' && /^[\d.]{8,20}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

export async function oawUpdateAction(
  b: any,
  db: any,
  subject: string,
  project: { id: string },
  respond: Respond,
  fetcher: typeof fetch = fetch,
  makeJwt: () => Promise<string> = defaultJwt,
  release: Release = { ...RELEASE_FILES, version: RELEASE.version } as Release,
) {
  const { data: quota } = await db.rpc('line_oa_kit_quota_status', { p_subject: subject });
  if (quota?.paid !== true)
    return respond({ error: '請先訂閱月費', code: 'subscription_required' }, 402);
  const { data: conn } = await db
    .from('line_oa_kit_github_connections')
    .select('installation_id,repository_id,full_name,revoked_at')
    .eq('project_id', project.id)
    .eq('line_subject', subject)
    .maybeSingle();
  if (!conn || conn.revoked_at || !/^[-\w.]+\/[-\w.]+$/.test(conn.full_name ?? ''))
    return respond({ error: '請先授權 GitHub', code: 'github_binding_required' }, 409);
  const repo = conn.full_name;
  let token: string;
  try {
    ({ token } = await repoToken(conn, fetcher, makeJwt, UPDATE_PERMISSIONS));
  } catch (e: any) {
    if (e?.message === 'github_permissions_required')
      return respond(
        { error: '請在 GitHub 同意 Aprico 新增的權限', code: e.message, url: e.url },
        409,
      );
    return respond({ error: 'GitHub 暫時無法存取', code: 'github_unavailable' }, 503);
  }
  try {
    const tree = await readTree(repo, token, fetcher);
    if (!tree.files['.github/workflows/oaw-setup.yml'])
      return respond({ error: '這個 repo 不是從 Aprico 範本建立的', code: 'not_template' }, 409);
    const steps = classify(release, tree.files);
    const conflicts = steps.filter((s) => s.action === 'conflict');
    if (b.action === 'oaw_update_plan')
      return respond({
        repo,
        version: release.version,
        current: await currentVersion(repo, token, fetcher),
        upToDate: steps.length === 0,
        changes: steps.length - conflicts.length,
        conflicts: conflicts.map(({ path, kind }) => ({ path, kind })),
      });

    // oaw_update_apply: the plan is recomputed here; the browser only sends choices.
    const choices = b.choices && typeof b.choices === 'object' ? b.choices : {};
    const take = (path: string) => choices[path] === 'take';
    const entries: any[] = [];
    for (const s of steps) {
      if (s.action === 'conflict' && !take(s.path)) continue;
      const spec = release.files[s.path];
      if (spec.sha === null) {
        entries.push({ path: s.path, mode: spec.mode, type: 'blob', sha: null });
        continue;
      }
      const res = await fetcher(TEMPLATE_RAW + release.ref + '/' + s.path, {
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (!res.ok || (await blobSha(bytes)) !== spec.sha) throw Error('release_mismatch');
      const blob = await ghRequest(
        `/repos/${repo}/git/blobs`,
        token,
        'POST',
        { content: b64(bytes), encoding: 'base64' },
        fetcher,
      );
      entries.push({ path: s.path, mode: spec.mode, type: 'blob', sha: blob.sha });
    }
    const stamp = JSON.stringify({ version: release.version, ref: release.ref }, null, 2) + '\n';
    entries.push({ path: VERSION_FILE, mode: '100644', type: 'blob', content: stamp });
    const newTree = await ghRequest(
      `/repos/${repo}/git/trees`,
      token,
      'POST',
      { base_tree: tree.baseTree, tree: entries },
      fetcher,
    );
    const commit = await ghRequest(
      `/repos/${repo}/git/commits`,
      token,
      'POST',
      {
        message: `Aprico update ${release.version}`,
        tree: newTree.sha,
        parents: [tree.head],
      },
      fetcher,
    );
    // Not forced: if the customer pushed meanwhile, this fails and they can retry.
    await ghRequest(
      `/repos/${repo}/git/refs/heads/${tree.branch}`,
      token,
      'PATCH',
      { sha: commit.sha, force: false },
      fetcher,
    );
    const hash = await projectHash(project.id);
    const rows = [
      {
        project_hash: hash,
        version: release.version,
        kind: 'applied',
        path: null,
        choice: null,
        changes: entries.length - 1,
      },
      ...conflicts.map((c) => ({
        project_hash: hash,
        version: release.version,
        kind: c.kind,
        path: c.path,
        choice: take(c.path) ? 'take' : 'keep',
        changes: null,
      })),
    ];
    await db.from('line_oa_kit_update_reports').insert(rows);
    const startedAt = new Date().toISOString();
    await ghRequest(
      `/repos/${repo}/actions/workflows/oaw-setup.yml/dispatches`,
      token,
      'POST',
      { ref: tree.branch },
      fetcher,
    );
    return respond({ applied: true, commit: commit.sha, startedAt, version: release.version });
  } catch (e: any) {
    if (e?.message === 'release_mismatch')
      return respond({ error: '更新檔核對失敗，請稍後再試', code: e.message }, 502);
    if (e?.status === 422)
      return respond({ error: 'repo 剛有新變更，請重新檢查後再更新', code: 'repo_changed' }, 409);
    return respond({ error: 'GitHub 操作失敗，請稍後再試', code: 'github_failed' }, 502);
  } finally {
    await ghRequest('/installation/token', token, 'DELETE', undefined, fetcher).catch(() => {});
  }
}
