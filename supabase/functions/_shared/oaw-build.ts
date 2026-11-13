// Build a customer's OA from the oaw-template repo they created, through the Aprico GitHub App.
// The browser encrypts every secret with the repo's public key (libsodium sealed box), so
// the platform only relays ciphertext it cannot read. After a successful setup the App
// installation is removed, so Aprico keeps no access to the customer's GitHub.
import { appJwt, ghRequest, githubSettings } from './github-app.ts';
import { validOawConfig } from './oaw-api.ts';

export const OAW_ACTIONS = [
  'oaw_build_key',
  'oaw_build_start',
  'oaw_build_status',
  'oaw_build_finish',
];
// Secret names the setup workflow reads; nothing else can be written.
export const OAW_SECRETS = [
  'SUPABASE_ACCESS_TOKEN',
  'OAW_LINE_MSG_ID',
  'OAW_LINE_MSG_SECRET',
  'OAW_LINE_LOGIN_ID',
  'OAW_LINE_LOGIN_SECRET',
];
const PERMISSIONS = {
  contents: 'write',
  pages: 'write',
  secrets: 'write',
  actions: 'write',
  actions_variables: 'write',
} as const;

type Respond = (data: unknown, status?: number) => Response;
type Project = { id: string };

/** Short app prefix from the project id: stable, lowercase, starts with a letter. */
export const projectPx = (projectId: string) => 'oa' + projectId.replace(/-/g, '').slice(0, 6);

const settingsUrl = (installation: any) =>
  installation?.target_type === 'Organization' && /^[-\w]+$/.test(installation.account?.login || '')
    ? `https://github.com/organizations/${installation.account.login}/settings/installations/${installation.id}`
    : `https://github.com/settings/installations/${installation?.id}`;

/** GitHub App JWT; tests pass their own. */
async function defaultJwt() {
  const settings = githubSettings((k) => Deno.env.get(k));
  if (!settings) throw Error('github_app_not_configured');
  return appJwt(settings);
}

async function repoToken(conn: any, fetcher: typeof fetch, makeJwt: () => Promise<string>) {
  const jwt = await makeJwt();
  const installation = await ghRequest(
    `/repos/${conn.full_name}/installation`,
    jwt,
    'GET',
    undefined,
    fetcher,
  );
  if (installation?.id !== conn.installation_id || installation.suspended_at)
    throw Error('github_installation_unavailable');
  const missing = Object.entries(PERMISSIONS).filter(
    ([k, v]) => installation.permissions?.[k] !== v,
  );
  if (missing.length)
    throw Object.assign(Error('github_permissions_required'), { url: settingsUrl(installation) });
  const issued = await ghRequest(
    `/app/installations/${conn.installation_id}/access_tokens`,
    jwt,
    'POST',
    { repository_ids: [conn.repository_id], permissions: PERMISSIONS },
    fetcher,
  );
  if (typeof issued.token !== 'string') throw Error('github_installation_unavailable');
  return { token: issued.token as string, jwt };
}

async function setVariable(
  repo: string,
  token: string,
  name: string,
  value: string,
  f: typeof fetch,
) {
  try {
    await ghRequest(`/repos/${repo}/actions/variables/${name}`, token, 'PATCH', { name, value }, f);
  } catch {
    await ghRequest(`/repos/${repo}/actions/variables`, token, 'POST', { name, value }, f);
  }
}

async function readStatus(repo: string, token: string, f: typeof fetch) {
  const file = await ghRequest(
    `/repos/${repo}/contents/oaw/status.json`,
    token,
    'GET',
    undefined,
    f,
  ).catch(() => null);
  let status: any = null;
  try {
    status = file?.content
      ? JSON.parse(
          new TextDecoder().decode(
            Uint8Array.from(atob(file.content.replace(/\s/g, '')), (c) => c.charCodeAt(0)),
          ),
        )
      : null;
  } catch {
    status = null;
  }
  const runs = await ghRequest(
    `/repos/${repo}/actions/workflows/oaw-setup.yml/runs?per_page=1`,
    token,
    'GET',
    undefined,
    f,
  ).catch(() => null);
  const run = runs?.workflow_runs?.[0];
  return {
    ok: status?.ok === true,
    steps: status?.steps ?? {},
    finishedAt: status?.finished_at ?? null,
    basicId: typeof status?.basic_id === 'string' ? status.basic_id : '',
    run: run
      ? {
          status: run.status,
          conclusion: run.conclusion,
          url: run.html_url,
          startedAt: run.run_started_at,
        }
      : null,
  };
}

const sealed = (v: unknown) =>
  typeof v === 'string' && v.length <= 4000 && /^[A-Za-z0-9+/]+={0,2}$/.test(v);

export async function oawBuildAction(
  b: any,
  db: any,
  subject: string,
  project: Project,
  respond: Respond,
  fetcher: typeof fetch = fetch,
  makeJwt: () => Promise<string> = defaultJwt,
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
    return respond({ error: '請先連接 GitHub', code: 'github_binding_required' }, 409);
  const repo = conn.full_name;
  let token: string, jwt: string;
  try {
    ({ token, jwt } = await repoToken(conn, fetcher, makeJwt));
  } catch (e: any) {
    if (e?.message === 'github_permissions_required')
      return respond(
        { error: '請在 GitHub 同意 Aprico 新增的權限', code: e.message, url: e.url },
        409,
      );
    return respond({ error: 'GitHub 暫時無法存取', code: 'github_unavailable' }, 503);
  }
  try {
    if (b.action === 'oaw_build_key') {
      // The customer's repo must come from the template: its setup workflow has to exist.
      await ghRequest(
        `/repos/${repo}/contents/.github/workflows/oaw-setup.yml`,
        token,
        'GET',
        undefined,
        fetcher,
      ).catch(() => {
        throw Error('not_template');
      });
      const key = await ghRequest(
        `/repos/${repo}/actions/secrets/public-key`,
        token,
        'GET',
        undefined,
        fetcher,
      );
      return respond({ repo, keyId: key.key_id, key: key.key, secrets: OAW_SECRETS });
    }
    if (b.action === 'oaw_build_start') {
      const values = b.secrets ?? {};
      if (typeof b.keyId !== 'string' || !OAW_SECRETS.every((n) => sealed(values[n])))
        return respond({ error: '金鑰資料不完整', code: 'secrets_invalid' }, 400);
      if (b.config !== undefined && !validOawConfig(b.config))
        return respond({ error: '設定格式不正確', code: 'config_invalid' }, 400);
      for (const name of OAW_SECRETS)
        await ghRequest(
          `/repos/${repo}/actions/secrets/${name}`,
          token,
          'PUT',
          { encrypted_value: values[name], key_id: b.keyId },
          fetcher,
        );
      await setVariable(repo, token, 'OAW_PX', projectPx(project.id), fetcher);
      await setVariable(
        repo,
        token,
        'OAW_TEMPLATE',
        b.template === 'health' ? 'health' : 'general',
        fetcher,
      );
      if (b.config) {
        const path = `/repos/${repo}/contents/oaw/config.json`;
        const current = await ghRequest(path, token, 'GET', undefined, fetcher).catch(() => null);
        const content = btoa(
          String.fromCharCode(
            ...new TextEncoder().encode(JSON.stringify(b.config, null, 2) + '\n'),
          ),
        );
        await ghRequest(
          path,
          token,
          'PUT',
          {
            message: 'Aprico: initial OA settings',
            content,
            ...(current?.sha ? { sha: current.sha } : {}),
          },
          fetcher,
        );
      }
      // GitHub Pages hosts the LIFF pages; enabling twice is harmless.
      await ghRequest(
        `/repos/${repo}/pages`,
        token,
        'POST',
        { build_type: 'workflow' },
        fetcher,
      ).catch(() => {});
      await ghRequest(
        `/repos/${repo}/actions/workflows/oaw-setup.yml/dispatches`,
        token,
        'POST',
        { ref: 'main' },
        fetcher,
      );
      return respond({ started: true, repo });
    }
    if (b.action === 'oaw_build_status') return respond(await readStatus(repo, token, fetcher));
    if (b.action === 'oaw_build_finish') {
      const status = await readStatus(repo, token, fetcher);
      if (!status.ok) return respond({ error: '建置尚未完成', code: 'not_finished' }, 409);
      await ghRequest(
        `/app/installations/${conn.installation_id}`,
        jwt,
        'DELETE',
        undefined,
        fetcher,
      );
      await db
        .from('line_oa_kit_github_connections')
        .update({ revoked_at: new Date().toISOString() })
        .eq('project_id', project.id)
        .eq('line_subject', subject);
      return respond({ removed: true });
    }
  } catch (e: any) {
    if (e?.message === 'not_template')
      return respond({ error: '這個 repo 不是從 Aprico 範本建立的', code: 'not_template' }, 409);
    return respond({ error: 'GitHub 操作失敗，請稍後再試', code: 'github_failed' }, 502);
  } finally {
    await ghRequest('/installation/token', token, 'DELETE', undefined, fetcher).catch(() => {});
  }
  return respond({ error: '不支援的操作' }, 400);
}
