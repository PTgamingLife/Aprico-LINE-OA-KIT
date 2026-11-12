// Connect a customer's OA app (OAW template) to their Aprico subscription, no secrets typed:
//   1. In the Aprico OA the owner sends 「連接我的OA」 → a card with a one-time code
//      (10 minutes, single use). Its button opens LINE's chat picker with 「連接 <code>」.
//   2. The owner sends it in their own OA. That OA posts the code to /connect and gets a
//      runtime key, which goes straight from here into the customer's own Supabase.
//   3. The owner gets a notice here with a button to revoke the key.
import { issueRuntimeKey, runtimeKeyDigest } from './runtime-ai.ts';

export const CONNECT_WORDS = ['連接我的OA', '連接我的 OA', '連接我的oa', '連接我的 oa'];
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
export const CODE_RE = /^[A-HJ-NP-Z2-9]{10}$/;
const CODE_TTL_MS = 10 * 60 * 1000;
const REVOKE_PREFIX = 'oaw-revoke:';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function connectCode() {
  // 32 symbols → each byte maps evenly; 10 symbols = 50 bits.
  return Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => ALPHABET[b % 32]).join('');
}

const card = (title: string, body: string, button?: Record<string, unknown>) => ({
  type: 'flex',
  altText: `${title}：${body}`.slice(0, 400),
  contents: {
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#E7C5A8',
      contents: [{ type: 'text', text: title, weight: 'bold', color: '#4A3B32' }],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#FAF7F2',
      contents: [{ type: 'text', text: body, wrap: true, size: 'sm', color: '#4A3B32' }],
    },
    ...(button
      ? {
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [{ type: 'button', style: 'primary', color: '#4A3B32', action: button }],
          },
        }
      : {}),
  },
});

type GatewayDeps = {
  authenticated: boolean;
  db: any;
  reply: (replyToken: string, messages: any[]) => Promise<unknown>;
};

/** Handles 「連接我的OA」 and the revoke button in the Aprico OA. Returns true when handled. */
export async function connectGateway(event: any, deps: GatewayDeps) {
  if (!deps.authenticated || event.source?.type !== 'user') return false;
  const subject = event.source.userId;
  const isAsk =
    event.type === 'message' &&
    event.message?.type === 'text' &&
    CONNECT_WORDS.includes(String(event.message.text ?? '').trim());
  const revoke =
    event.type === 'postback' && String(event.postback?.data ?? '').startsWith(REVOKE_PREFIX);
  if (!isAsk && !revoke) return false;
  if (!/^U[0-9a-f]{32}$/.test(subject || '') || typeof event.replyToken !== 'string' || !deps.db)
    return true;
  const say = (title: string, body: string, button?: Record<string, unknown>) =>
    deps.reply(event.replyToken, [card(title, body, button)]);

  if (revoke) {
    const projectId = String(event.postback.data).slice(REVOKE_PREFIX.length);
    if (!UUID_RE.test(projectId)) return true;
    const { error } = await deps.db
      .from('line_oa_kit_runtime_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('project_id', projectId)
      .eq('line_subject', subject);
    await say(
      error ? '撤銷失敗' : '已撤銷連接',
      error ? '請稍後再試一次。' : '那個官方帳號已無法再使用你的額度。',
    );
    return true;
  }

  const { data: quota } = await deps.db.rpc('line_oa_kit_quota_status', { p_subject: subject });
  if (quota?.paid !== true) {
    await say('尚未訂閱', '訂閱月費後就能把 AI 秘書連接到你的官方帳號。');
    return true;
  }
  const { data: project } = await deps.db
    .from('line_oa_kit_designs')
    .select('id')
    .eq('line_subject', subject)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!project?.id) {
    await say('還沒有專案', '請先在 Aprico 完成建置，再回來連接。');
    return true;
  }
  const code = connectCode();
  const { error } = await deps.db.from('line_oa_kit_connect_codes').insert({
    code_digest: await runtimeKeyDigest(code),
    line_subject: subject,
    project_id: project.id,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (error) {
    await say('暫時無法連接', '請稍後再試一次。');
    return true;
  }
  await say(
    '連接你的官方帳號',
    `按下方按鈕，選你自己的官方帳號，直接按送出就完成。\n\n連接碼 ${code}（10 分鐘內有效，只能用一次）`,
    {
      type: 'uri',
      label: '選擇我的官方帳號',
      uri: 'https://line.me/R/msg/text/?' + encodeURIComponent(`連接 ${code}`),
    },
  );
  return true;
}

const respond = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

/** POST /connect {code} from the customer's OA app → { key } once. */
export async function oawConnect(
  req: Request,
  db: any,
  push: (to: string, messages: any[]) => Promise<unknown>,
) {
  if (req.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405);
  const raw = await req.text();
  if (raw.length > 1000) return respond({ error: 'input_too_large' }, 413);
  let code = '';
  try {
    code = String(JSON.parse(raw)?.code ?? '')
      .trim()
      .toUpperCase();
  } catch {
    return respond({ error: 'invalid_input' }, 400);
  }
  if (!CODE_RE.test(code)) return respond({ error: 'invalid_code' }, 400);
  // Claim atomically: only an unused, unexpired code updates a row.
  const { data, error } = await db
    .from('line_oa_kit_connect_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('code_digest', await runtimeKeyDigest(code))
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('line_subject,project_id');
  if (error) return respond({ error: 'runtime_unavailable' }, 503);
  const row = data?.[0];
  if (!row) return respond({ error: 'invalid_code' }, 404);
  let key: string;
  try {
    key = (await issueRuntimeKey(db, row.project_id, row.line_subject)).key;
  } catch {
    return respond({ error: 'runtime_unavailable' }, 503);
  }
  await push(row.line_subject, [
    card(
      '✅ 已連接',
      'AI 秘書已連接到你的官方帳號，之後的使用會扣你的月費額度。不是你本人操作嗎？',
      {
        type: 'postback',
        label: '不是我，撤銷',
        data: REVOKE_PREFIX + row.project_id,
      },
    ),
  ]).catch(() => {});
  return respond({ key });
}
