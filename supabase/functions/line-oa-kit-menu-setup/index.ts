// One-off publisher for the Aprico OA rich menus (展示中心 + 建置中心). Runs only with a
// database-issued, hashed, single-use tick (select line_oa_kit_internal.invoke_menu_setup()).
// Creates both menus from the images on GitHub Pages, points the aliases at them, makes the
// showcase every new friend's default, links the build menu for people who already have a
// design or a subscription, then removes the older Aprico menus.
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import {
  BUILD_ALIAS,
  centerMenu,
  CENTER_LEARNING,
  SHOWCASE_ALIAS,
  showcaseMenu,
} from '../../../src/center-menu.ts';

const PAGES = 'https://ptgaminglife.github.io/Aprico-LINE-OA-KIT/menus/';
const API = 'https://api.line.me/v2/bot';

async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('not found', { status: 404 });
  const tick = req.headers.get('x-menu-tick') ?? '';
  if (!/^[0-9a-f]{64}$/.test(tick)) return new Response('forbidden', { status: 403 });
  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: used } = await db
    .from('line_oa_kit_menu_ticks')
    .delete()
    .eq('token_hash', await sha256(tick))
    .gt('expires_at', new Date().toISOString())
    .select('token_hash');
  if (!used?.length) return new Response('forbidden', { status: 403 });

  const token = Deno.env.get('LINE_OA_KIT_MESSAGING_ACCESS_TOKEN') ?? '';
  const call = async (path: string, method = 'GET', body?: unknown) => {
    const r = await fetch(API + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    if (!r.ok)
      throw Object.assign(Error(`${path} → ${r.status} ${text.slice(0, 200)}`), {
        status: r.status,
      });
    return text ? JSON.parse(text) : {};
  };
  const steps: Record<string, unknown> = {};
  try {
    const bot = await call('/info');
    if (bot.basicId !== '@228srwlt') throw Error('wrong_oa');
    const { richmenus: before = [] } = await call('/richmenu/list');

    const made: Record<string, string> = {};
    for (const [key, menu] of [
      ['showcase', showcaseMenu()],
      ['build', centerMenu(CENTER_LEARNING)],
    ] as const) {
      const png = new Uint8Array(await (await fetch(PAGES + key + '.png')).arrayBuffer());
      const view = new DataView(png.buffer);
      if (png[0] !== 0x89 || view.getUint32(16) !== 1200 || view.getUint32(20) !== 810)
        throw Error(`${key}.png is not a 1200x810 PNG`);
      const { richMenuId } = await call('/richmenu', 'POST', menu);
      const up = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' },
        body: png,
      });
      if (!up.ok) throw Error(`upload ${key} → ${up.status}`);
      made[key] = richMenuId;
    }
    steps.menus = made;

    for (const [alias, id] of [
      [SHOWCASE_ALIAS, made.showcase],
      [BUILD_ALIAS, made.build],
    ]) {
      try {
        await call(`/richmenu/alias/${alias}`, 'POST', { richMenuId: id });
      } catch {
        await call('/richmenu/alias', 'POST', { richMenuAliasId: alias, richMenuId: id });
      }
    }
    steps.aliases = true;

    await call(`/user/all/richmenu/${made.showcase}`, 'POST');
    steps.default = 'showcase';

    // People who already designed or subscribed keep the build center.
    const [designs, subs] = await Promise.all([
      db.from('line_oa_kit_designs').select('line_subject').limit(5000),
      db.from('line_oa_kit_subscriptions').select('line_subject').limit(5000),
    ]);
    const users = [
      ...new Set(
        [...(designs.data ?? []), ...(subs.data ?? [])]
          .map((r: any) => r.line_subject)
          .filter((u: string) => /^U[0-9a-f]{32}$/.test(u)),
      ),
    ];
    for (let i = 0; i < users.length; i += 500)
      await call('/richmenu/bulk/link', 'POST', {
        richMenuId: made.build,
        userIds: users.slice(i, i + 500),
      });
    steps.buildUsers = users.length;

    let removed = 0;
    for (const m of before)
      if (!Object.values(made).includes(m.richMenuId)) {
        await call(`/richmenu/${m.richMenuId}`, 'DELETE').catch(() => null);
        removed++;
      }
    steps.removedOld = removed;
    return Response.json({ ok: true, steps });
  } catch (e) {
    return Response.json({ ok: false, steps, error: (e as Error).message }, { status: 500 });
  }
});
