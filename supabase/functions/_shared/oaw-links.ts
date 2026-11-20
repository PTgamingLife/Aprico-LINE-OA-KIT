// Cross-account links between OA apps (e.g. 行政部 ⇄ 設計部). Aprico is only the relay:
// it pairs two apps with a one-time code that both owners accept, enforces each side's
// scope and daily limit, and forwards messages sealed end-to-end for the receiving app
// (Aprico never sees the text). Only metadata is logged: link, direction, kind, status.
const KINDS = ['manual', 'events', 'todos', 'expenses', 'notices'] as const;
type Kind = (typeof KINDS)[number];
type Grant = { project_id: string; line_subject: string };
type Respond = (data: unknown, status?: number) => Response;

export const DAILY_DEFAULT = 20;
const DAILY_MAX = 100;
const PROJECT_DAILY_MAX = 200;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type Scope = {
  send: Record<Kind, boolean>;
  accept: Record<Kind, boolean>;
  autoDigest: boolean;
  daily: number;
};
export const defaultScope = (): Scope => ({
  send: { manual: true, events: false, todos: false, expenses: false, notices: false },
  accept: { manual: true, events: true, todos: true, expenses: true, notices: true },
  autoDigest: false,
  daily: DAILY_DEFAULT,
});

/** Anything unknown becomes off; the daily limit is clamped to 1..100. */
export function cleanScope(v: any): Scope {
  const pick = (o: any) =>
    Object.fromEntries(KINDS.map((k) => [k, o?.[k] === true])) as Record<Kind, boolean>;
  const d = Number(v?.daily);
  return {
    send: pick(v?.send),
    accept: pick(v?.accept),
    autoDigest: v?.autoDigest === true,
    daily: Number.isInteger(d) ? Math.min(DAILY_MAX, Math.max(1, d)) : DAILY_DEFAULT,
  };
}

const label = (v: unknown) =>
  typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= 20 ? v.trim() : null;
const pubKey = (v: unknown) =>
  typeof v === 'string' && /^[A-Za-z0-9+/]{86}[A-Za-z0-9+/=]{2}$/.test(v) ? v : null;
// The receiving app's own API on its own Supabase project, nothing else.
export const inboxUrl = (v: unknown) =>
  typeof v === 'string' &&
  /^https:\/\/[a-z]{20}\.supabase\.co\/functions\/v1\/[a-z][a-z0-9]{1,7}-api$/.test(v)
    ? v
    : null;

async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}
const newCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => CODE_CHARS[b % 32]).join('');
const taipeiDayStart = () => {
  const now = new Date(Date.now() + 8 * 3600e3);
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 8 * 3600e3,
  ).toISOString();
};

/** Side of the link this project is on, or null. */
const sideOf = (l: any, project: string) =>
  l.a_project === project ? 'a' : l.b_project === project ? 'b' : null;

function view(l: any, me: 'a' | 'b') {
  const peer = me === 'a' ? 'b' : 'a';
  return {
    id: l.id,
    status: l.status,
    myLabel: l[`${me}_label`],
    peerLabel: l[`${peer}_label`] ?? null,
    peerKey: l.status === 'active' ? l[`${peer}_key`] : null,
    scope: cleanScope(l[`${me}_scope`]),
    peerScope: l.status === 'active' ? cleanScope(l[`${peer}_scope`]) : null,
  };
}

export async function oawLinks(
  body: any,
  db: any,
  grant: Grant,
  respond: Respond,
  fetcher: typeof fetch = fetch,
  later: (p: Promise<unknown>) => void = () => {},
) {
  const me = grant.project_id;
  const ping = (url: string | null) => {
    if (url)
      later(
        fetcher(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'link_ping' }),
          signal: AbortSignal.timeout(8000),
        }).catch(() => null),
      );
  };
  const load = async (id: unknown) => {
    if (typeof id !== 'string' || !UUID.test(id)) return null;
    const { data } = await db.from('line_oa_kit_links').select('*').eq('id', id).maybeSingle();
    return data && sideOf(data, me) ? data : null;
  };
  const log = (link_id: string, direction: string, kind: string, status: string) =>
    db.from('line_oa_kit_link_log').insert({ link_id, project_id: me, direction, kind, status });

  switch (body.op) {
    case 'create': {
      const l = label(body.label),
        key = pubKey(body.key),
        inbox = inboxUrl(body.inbox);
      if (!l || !key || !inbox) return respond({ error: 'invalid_input' }, 400);
      const code = newCode();
      const { data, error } = await db
        .from('line_oa_kit_links')
        .insert({
          a_project: me,
          a_label: l,
          a_key: key,
          a_inbox: inbox,
          a_scope: defaultScope(),
          status: 'pending',
          code_hash: await sha256(code),
          code_expires: new Date(Date.now() + 10 * 60e3).toISOString(),
        })
        .select('id')
        .single();
      if (error) return respond({ error: 'link_unavailable' }, 503);
      return respond({ id: data.id, code, expiresInMinutes: 10 });
    }
    case 'accept': {
      const l = label(body.label),
        key = pubKey(body.key),
        inbox = inboxUrl(body.inbox),
        code = String(body.code ?? '')
          .toUpperCase()
          .replace(/\s/g, '');
      if (!l || !key || !inbox || !/^[A-HJ-NP-Z2-9]{10}$/.test(code))
        return respond({ error: 'invalid_input' }, 400);
      const { data: link } = await db
        .from('line_oa_kit_links')
        .select('*')
        .eq('code_hash', await sha256(code))
        .eq('status', 'pending')
        .gt('code_expires', new Date().toISOString())
        .maybeSingle();
      if (!link) return respond({ error: 'code_invalid' }, 404);
      if (link.a_project === me) return respond({ error: 'same_account' }, 409);
      const { data: existing } = await db
        .from('line_oa_kit_links')
        .select('id')
        .eq('status', 'active')
        .or(
          `and(a_project.eq.${link.a_project},b_project.eq.${me}),and(a_project.eq.${me},b_project.eq.${link.a_project})`,
        )
        .limit(1);
      if (existing?.length) return respond({ error: 'already_linked' }, 409);
      const { data: done } = await db
        .from('line_oa_kit_links')
        .update({
          b_project: me,
          b_label: l,
          b_key: key,
          b_inbox: inbox,
          b_scope: cleanScope(body.scope ?? defaultScope()),
          status: 'active',
          code_hash: null,
          code_expires: null,
          accepted_at: new Date().toISOString(),
        })
        .eq('id', link.id)
        .eq('status', 'pending')
        .select('*')
        .single();
      if (!done) return respond({ error: 'code_invalid' }, 404);
      // Tell the inviting app (no content: just that the peer accepted).
      await db.from('line_oa_kit_link_queue').insert({
        link_id: done.id,
        to_project: done.a_project,
        from_label: l,
        kind: 'accepted',
        sealed: null,
      });
      ping(done.a_inbox);
      return respond({ link: view(done, 'b') });
    }
    case 'list': {
      const { data, error } = await db
        .from('line_oa_kit_links')
        .select('*')
        .or(`a_project.eq.${me},b_project.eq.${me}`)
        .neq('status', 'revoked')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return respond({ error: 'link_unavailable' }, 503);
      return respond({
        links: (data ?? [])
          .filter((l: any) => l.status === 'active' || Date.parse(l.code_expires) > Date.now())
          .map((l: any) => view(l, sideOf(l, me)!)),
      });
    }
    case 'scope': {
      const link = await load(body.linkId);
      if (!link || link.status === 'revoked') return respond({ error: 'link_not_found' }, 404);
      const side = sideOf(link, me)!;
      await db
        .from('line_oa_kit_links')
        .update({ [`${side}_scope`]: cleanScope(body.scope) })
        .eq('id', link.id);
      return respond({ ok: true });
    }
    case 'send': {
      const link = await load(body.linkId);
      if (!link || link.status !== 'active') return respond({ error: 'link_not_found' }, 404);
      const kind = KINDS.includes(body.kind) ? (body.kind as Kind) : null;
      if (!kind || typeof body.sealed !== 'string' || body.sealed.length > 12000)
        return respond({ error: 'invalid_input' }, 400);
      const side = sideOf(link, me)!,
        peer = side === 'a' ? 'b' : 'a',
        mine = cleanScope(link[`${side}_scope`]),
        theirs = cleanScope(link[`${peer}_scope`]);
      const direction = `${side}2${peer}`;
      if (!mine.send[kind] || !theirs.accept[kind]) {
        await log(link.id, direction, kind, 'refused');
        return respond({ error: 'scope_closed' }, 403);
      }
      const since = taipeiDayStart();
      const [{ count: onLink }, { count: onProject }] = await Promise.all([
        db
          .from('line_oa_kit_link_log')
          .select('id', { count: 'exact', head: true })
          .eq('link_id', link.id)
          .eq('direction', direction)
          .eq('status', 'queued')
          .gte('at', since),
        db
          .from('line_oa_kit_link_log')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', me)
          .eq('status', 'queued')
          .gte('at', since),
      ]);
      if ((onLink ?? 0) >= mine.daily || (onProject ?? 0) >= PROJECT_DAILY_MAX) {
        await log(link.id, direction, kind, 'limit');
        return respond({ error: 'daily_limit' }, 429);
      }
      const { error } = await db.from('line_oa_kit_link_queue').insert({
        link_id: link.id,
        to_project: link[`${peer}_project`],
        from_project: me,
        from_label: link[`${side}_label`],
        kind,
        sealed: body.sealed,
      });
      if (error) return respond({ error: 'link_unavailable' }, 503);
      await log(link.id, direction, kind, 'queued');
      ping(link[`${peer}_inbox`]);
      return respond({ queued: true, left: mine.daily - (onLink ?? 0) - 1 });
    }
    case 'inbox': {
      const { data, error } = await db
        .from('line_oa_kit_link_queue')
        .select('id,link_id,from_label,kind,sealed,created_at')
        .eq('to_project', me)
        .order('created_at')
        .limit(50);
      if (error) return respond({ error: 'link_unavailable' }, 503);
      return respond({ messages: data ?? [] });
    }
    case 'ack': {
      const ids = Array.isArray(body.ids)
        ? body.ids
            .filter((i: unknown) => typeof i === 'string' && UUID.test(i as string))
            .slice(0, 50)
        : [];
      if (!ids.length) return respond({ ok: true });
      const { data } = await db
        .from('line_oa_kit_link_queue')
        .delete()
        .in('id', ids)
        .eq('to_project', me)
        .select('link_id,kind');
      for (const r of data ?? []) await log(r.link_id, 'in', r.kind, 'delivered');
      return respond({ ok: true });
    }
    case 'revoke': {
      const link = await load(body.linkId);
      if (!link) return respond({ error: 'link_not_found' }, 404);
      const side = sideOf(link, me)!,
        peer = side === 'a' ? 'b' : 'a',
        wasActive = link.status === 'active';
      await db
        .from('line_oa_kit_links')
        .update({ status: 'revoked', revoked_at: new Date().toISOString(), code_hash: null })
        .eq('id', link.id);
      await db.from('line_oa_kit_link_queue').delete().eq('link_id', link.id);
      if (wasActive) {
        await db.from('line_oa_kit_link_queue').insert({
          link_id: link.id,
          to_project: link[`${peer}_project`],
          from_label: link[`${side}_label`],
          kind: 'revoked',
          sealed: null,
        });
        ping(link[`${peer}_inbox`]);
      }
      return respond({ ok: true });
    }
  }
  return respond({ error: 'unknown_op' }, 400);
}
