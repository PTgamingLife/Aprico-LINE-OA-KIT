// Owner protection from the build center: emergency lock, unlock and ownership recovery.
// Locking needs only the LINE login (it can only make things safer). Unlocking and
// recovery need the Aprico GitHub App on the customer's repo, which proves control of the
// repo; a stolen LINE account does not give that. The new bind code is made and sealed in
// the browser with the repo's Actions key, so Aprico never sees it.
import { ghRequest } from './github-app.ts';
import { defaultJwt, repoToken, setVariable } from './oaw-build.ts';

export const SECURITY_ACTIONS = [
  'oaw_security_status',
  'oaw_lock',
  'oaw_unlock',
  'oaw_recover_key',
  'oaw_recover',
];
type Respond = (data: unknown, status?: number) => Response;
const sealed = (v: unknown) =>
  typeof v === 'string' && v.length <= 400 && /^[A-Za-z0-9+/]+={0,2}$/.test(v);
const randomHex = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');

/** Lock every OA app of this LINE user (used by 「鎖定我的 OA」 in the Aprico OA). */
export async function lockAllFor(db: any, subject: string) {
  const { data: keys, error } = await db
    .from('line_oa_kit_runtime_keys')
    .select('project_id')
    .eq('line_subject', subject)
    .is('revoked_at', null);
  if (error) throw Error('lock_failed');
  const ids = [...new Set((keys ?? []).map((k: any) => k.project_id))];
  if (ids.length) {
    const r = await db.from('line_oa_kit_owner_locks').upsert(
      ids.map((project_id) => ({ project_id, source: 'chat' })),
      {
        onConflict: 'project_id',
        ignoreDuplicates: true,
      },
    );
    if (r.error) throw Error('lock_failed');
  }
  return ids.length;
}

export async function oawSecurityAction(
  b: any,
  db: any,
  subject: string,
  project: { id: string },
  respond: Respond,
  fetcher: typeof fetch = fetch,
  makeJwt: () => Promise<string> = defaultJwt,
) {
  const lockRow = () =>
    db
      .from('line_oa_kit_owner_locks')
      .select('locked_at,source')
      .eq('project_id', project.id)
      .maybeSingle();
  if (b.action === 'oaw_security_status') {
    const { data, error } = await lockRow();
    if (error) return respond({ error: '暫時無法讀取狀態' }, 503);
    return respond({ locked: Boolean(data), lockedAt: data?.locked_at ?? null });
  }
  if (b.action === 'oaw_lock') {
    const r = await db
      .from('line_oa_kit_owner_locks')
      .upsert({ project_id: project.id, source: 'page' }, { onConflict: 'project_id' });
    if (r.error) return respond({ error: '鎖定失敗，請再試一次' }, 503);
    return respond({ locked: true });
  }

  // Unlock and recovery: prove control of the repo with the GitHub App.
  const { data: conn } = await db
    .from('line_oa_kit_github_connections')
    .select('installation_id,repository_id,full_name,revoked_at')
    .eq('project_id', project.id)
    .eq('line_subject', subject)
    .maybeSingle();
  if (!conn || conn.revoked_at || !/^[-\w.]+\/[-\w.]+$/.test(conn.full_name ?? ''))
    return respond({ error: '請先授權 GitHub', code: 'github_binding_required' }, 409);
  let token: string;
  try {
    ({ token } = await repoToken(conn, fetcher, makeJwt));
  } catch (e: any) {
    if (e?.message === 'github_permissions_required')
      return respond({ error: '請在 GitHub 同意 Aprico 的權限', code: e.message, url: e.url }, 409);
    return respond(
      { error: 'GitHub 授權已失效，請重新授權', code: 'github_binding_required' },
      409,
    );
  }
  const repo = conn.full_name;
  try {
    if (b.action === 'oaw_unlock') {
      const r = await db.from('line_oa_kit_owner_locks').delete().eq('project_id', project.id);
      if (r.error) return respond({ error: '解鎖失敗，請再試一次' }, 503);
      return respond({ locked: false, repo });
    }
    if (b.action === 'oaw_recover_key') {
      const key = await ghRequest(
        `/repos/${repo}/actions/secrets/public-key`,
        token,
        'GET',
        undefined,
        fetcher,
      );
      return respond({ repo, keyId: key.key_id, key: key.key });
    }
    if (b.action === 'oaw_recover') {
      if (typeof b.keyId !== 'string' || !sealed(b.code))
        return respond({ error: '綁定碼資料不完整', code: 'code_invalid' }, 400);
      await ghRequest(
        `/repos/${repo}/actions/secrets/OAW_BIND_CODE`,
        token,
        'PUT',
        { encrypted_value: b.code, key_id: b.keyId },
        fetcher,
      );
      // A new value per request: setup clears the owner and PIN once for it.
      await setVariable(repo, token, 'OAW_OWNER_RESET', randomHex(), fetcher);
      const startedAt = new Date().toISOString();
      await ghRequest(
        `/repos/${repo}/actions/workflows/oaw-setup.yml/dispatches`,
        token,
        'POST',
        { ref: 'main' },
        fetcher,
      );
      await db.from('line_oa_kit_owner_locks').delete().eq('project_id', project.id);
      return respond({ started: true, startedAt, repo });
    }
  } catch {
    return respond({ error: 'GitHub 操作失敗，請稍後再試', code: 'github_failed' }, 502);
  } finally {
    await ghRequest('/installation/token', token, 'DELETE', undefined, fetcher).catch(() => {});
  }
  return respond({ error: '不支援的操作' }, 400);
}

const LOCK_WORDS = ['鎖定我的OA', '鎖定我的 OA', '緊急鎖定'];
const BUILD_URL = 'https://liff.line.me/2012197506-Vmb4O5iT/build.html?security=1';

/** 「鎖定我的 OA」 in the Aprico OA: lock every OA app of the sender right away. */
export async function lockGateway(
  event: any,
  deps: { authenticated: boolean; db: any; reply: (token: string, m: any[]) => Promise<unknown> },
) {
  if (!deps.authenticated || event.source?.type !== 'user') return false;
  if (event.type !== 'message' || event.message?.type !== 'text') return false;
  if (!LOCK_WORDS.includes(String(event.message.text ?? '').trim())) return false;
  const subject = event.source.userId;
  if (!/^U[0-9a-f]{32}$/.test(subject || '') || typeof event.replyToken !== 'string' || !deps.db)
    return true;
  let text: string;
  try {
    const n = await lockAllFor(deps.db, subject);
    text = n
      ? `🔒 已鎖定你的 ${n} 個官方帳號的管理功能，客人那邊照常運作。\n\n解鎖或找回老闆身分，請到會員中心的「帳號安全」用 GitHub 驗證：\n${BUILD_URL}`
      : '這個 LINE 帳號沒有連接中的官方帳號，不需要鎖定。';
  } catch {
    text = '鎖定暫時失敗，請再傳一次「鎖定我的 OA」，或到會員中心的「帳號安全」按「緊急鎖定」。';
  }
  await deps.reply(event.replyToken, [{ type: 'text', text }]);
  return true;
}
