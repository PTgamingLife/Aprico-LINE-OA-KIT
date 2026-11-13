import {
  githubSettings,
  githubReturn,
  randomValue,
  digest,
  authorizeUrl,
  exchangeCode,
  choicesForUser,
  webhookValid,
} from './github-app.ts';
const uuid = (v: any) =>
  typeof v === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(v);
const connectionFields = 'full_name,login,verified_at,revoked_at';
export function callbackPage(ok: boolean, projectId?: string, reason = 'authorization_failed') {
  const url = new URL(githubReturn);
  url.searchParams.set('github', ok ? 'complete' : 'failed');
  if (
    !ok &&
    [
      'platform_configuration',
      'invalid_callback',
      'browser_context',
      'expired_or_replayed',
      'github_code_exchange_failed',
      'github_account_list_failed',
      'github_callback_save_failed',
    ].includes(reason)
  )
    url.searchParams.set('reason', reason);
  if (uuid(projectId)) url.searchParams.set('project', projectId!);
  return new Response(null, {
    status: 303,
    headers: { Location: url.href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}
export async function githubCallbackAction(
  req: Request,
  db: any,
  env: (k: string) => string | undefined,
  fetcher: typeof fetch = fetch,
) {
  const settings = githubSettings(env);
  if (!settings) return callbackPage(false, undefined, 'platform_configuration');
  const url = new URL(req.url),
    state = url.searchParams.get('state') || '',
    code = url.searchParams.get('code') || '';
  if (!/^[\w-]{43}$/.test(state) || !code || code.length > 1024)
    return callbackPage(false, undefined, 'invalid_callback');
  const cookieName = 'aprico_gh_' + state.slice(0, 16),
    cookie =
      req.headers
        .get('cookie')
        ?.split(';')
        .map((s) => s.trim())
        .find((s) => s.startsWith(cookieName + '='))
        ?.slice(cookieName.length + 1) || '';
  if (!/^[\w-]{43}$/.test(cookie)) return callbackPage(false, undefined, 'browser_context');
  // Claim before any exchange. Replays and parallel callbacks cannot exchange again.
  const { data: flow, error } = await db
    .from('line_oa_kit_github_flows')
    .update({ status: 'processing' })
    .eq('state_hash', await digest(state))
    .eq('browser_hash', await digest(cookie))
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .select('id,verifier,project_id')
    .maybeSingle();
  if (error || !flow) return callbackPage(false, undefined, 'expired_or_replayed');
  let token = '',
    stage = 'github_code_exchange_failed';
  try {
    token = await exchangeCode(settings, code, flow.verifier, fetcher);
    stage = 'github_account_list_failed';
    const result = await choicesForUser(settings, token, fetcher);
    stage = 'github_callback_save_failed';
    const saved = await db
      .from('line_oa_kit_github_flows')
      .update({
        status: 'ready',
        verifier: '',
        github_user_id: result.githubUserId,
        login: result.login,
        choices: result.choices,
        truncated: result.truncated,
        expires_at: new Date(Date.now() + 600000).toISOString(),
      })
      .eq('id', flow.id)
      .eq('status', 'processing')
      .select('id')
      .maybeSingle();
    if (saved.error || !saved.data) throw Error('github_callback_save_failed');
    return callbackPage(true, flow.project_id);
  } catch {
    await db
      .from('line_oa_kit_github_flows')
      .update({ status: 'failed', verifier: '', choices: [], error_code: stage })
      .eq('id', flow.id)
      .eq('status', 'processing');
    return callbackPage(false, flow.project_id, stage);
  } finally {
    token = '';
  }
}
export async function githubAction(
  b: any,
  db: any,
  subject: string,
  project: any,
  response: (v: any, status?: number) => Response,
  env: (k: string) => string | undefined,
) {
  const settings = githubSettings(env);
  if (b.action === 'github_disconnect') {
    const r = await db
      .from('line_oa_kit_github_connections')
      .update({ revoked_at: new Date().toISOString() })
      .eq('project_id', project.id)
      .eq('line_subject', subject);
    const f = await db
      .from('line_oa_kit_github_flows')
      .update({ status: 'failed', verifier: '', choices: [] })
      .eq('project_id', project.id)
      .eq('line_subject', subject)
      .in('status', ['pending', 'processing', 'ready']);
    return r.error || f.error
      ? response({ error: '解除連線失敗，請重試' }, 503)
      : response({ disconnected: true });
  }
  if (!settings) return response({ configured: false, connection: null, flow: null });
  if (b.action === 'github_status') {
    const r = await db
      .from('line_oa_kit_github_connections')
      .select(connectionFields)
      .eq('project_id', project.id)
      .eq('line_subject', subject)
      .maybeSingle();
    const f = await db
      .from('line_oa_kit_github_flows')
      .select('id,status,login,choices,truncated,expires_at')
      .eq('project_id', project.id)
      .eq('line_subject', subject)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (r.error || f.error) return response({ error: '讀取 GitHub 連線失敗' }, 503);
    return response({
      configured: true,
      installationUrl: `https://github.com/apps/${settings.slug}/installations/new`,
      connection: r.data && !r.data.revoked_at ? r.data : null,
      flow: f.data?.status === 'ready' ? f.data : null,
    });
  }
  if (b.action === 'github_begin') {
    const state = randomValue(),
      verifier = randomValue(),
      browser = randomValue();
    const r = await db.rpc('line_oa_kit_github_begin', {
      p_project: project.id,
      p_subject: subject,
      p_hash: await digest(state),
      p_verifier: verifier,
      p_browser_hash: await digest(browser),
    });
    if (r.error) return response({ error: '目前無法建立連線，短時間多次嘗試請等候 15 分鐘' }, 429);
    return new Response(null, {
      status: 303,
      headers: {
        Location: authorizeUrl(settings, state, await digest(verifier)),
        'Set-Cookie': `aprico_gh_${state.slice(0, 16)}=${browser}; Path=/functions/v1/line-oa-kit-github; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  }
  if (b.action === 'github_select') {
    if (!uuid(b.flowId) || !Number.isSafeInteger(b.repositoryId) || b.repositoryId <= 0)
      return response({ error: '請從已核對的清單選擇專案' }, 400);
    const r = await db.rpc('line_oa_kit_github_bind', {
      p_project: project.id,
      p_subject: subject,
      p_flow: b.flowId,
      p_repository: b.repositoryId,
    });
    return r.error
      ? response({ error: '保存連線失敗' }, 503)
      : r.data === true
        ? response({ connected: true })
        : response({ error: '選擇已過期或不屬於此帳號，請重新連接' }, 409);
  }
  return response({ error: '不支援的 GitHub 操作' }, 400);
}
export async function githubWebhook(req: Request, db: any, env: (k: string) => string | undefined) {
  const secret = env('LINE_OA_KIT_GITHUB_WEBHOOK_SECRET') || '';
  let raw: Uint8Array;
  try {
    raw = await boundedBody(req, 262144);
  } catch {
    return new Response('', { status: 413 });
  }
  if (!(await webhookValid(raw, req.headers.get('x-hub-signature-256') || '', secret)))
    return new Response('', { status: 401 });
  try {
    const b = JSON.parse(new TextDecoder().decode(raw)),
      event = req.headers.get('x-github-event');
    let filter: null | [string, number] = null;
    if (
      event === 'github_app_authorization' &&
      b.action === 'revoked' &&
      Number.isSafeInteger(b.sender?.id)
    )
      filter = ['github_user_id', b.sender.id];
    if (
      event === 'installation' &&
      ['deleted', 'suspend', 'new_permissions_accepted'].includes(b.action) &&
      Number.isSafeInteger(b.installation?.id)
    )
      filter = ['installation_id', b.installation.id];
    if (
      event === 'installation_repositories' &&
      b.action === 'removed' &&
      Number.isSafeInteger(b.installation?.id)
    )
      filter = ['installation_id', b.installation.id];
    if (filter) {
      const r = await db
        .from('line_oa_kit_github_connections')
        .update({ revoked_at: new Date().toISOString() })
        .eq(filter[0], filter[1]);
      if (r.error) return new Response('', { status: 503 });
      // Also invalidate ready snapshots; never let an old OAuth result rebind revoked access.
      let query = db
        .from('line_oa_kit_github_flows')
        .update({ status: 'failed', choices: [], verifier: '' })
        .eq('status', 'ready');
      query =
        filter[0] === 'github_user_id'
          ? query.eq('github_user_id', filter[1])
          : query.contains('choices', [{ installationId: filter[1] }]);
      const f = await query;
      if (f.error) return new Response('', { status: 503 });
    }
    return new Response(null, { status: 204 });
  } catch {
    return new Response('', { status: 400 });
  }
}
export async function boundedBody(req: Request, limit: number) {
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > limit) {
      await reader.cancel();
      throw Error('body_limit');
    }
    chunks.push(part.value);
  }
  const raw = new Uint8Array(size);
  let offset = 0;
  for (const part of chunks) {
    raw.set(part, offset);
    offset += part.length;
  }
  return raw;
}
