// 領航者版: redeem a one-time unlock code for the calling app's own project, and report the
// tier in /status. A code only works for the project it was issued to.
const sha256Hex = async (text: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');

/** 12 characters without I, O, 0, 1; dashes and spaces are ignored. */
export const cleanCode = (v: unknown) => {
  const code = typeof v === 'string' ? v.toUpperCase().replace(/[\s-]/g, '') : '';
  return /^[A-HJ-NP-Z2-9]{12}$/.test(code) ? code : '';
};

export async function isNavigator(db: any, projectId: string) {
  const { data } = await db
    .from('line_oa_kit_navigator')
    .select('project_id')
    .eq('project_id', projectId)
    .maybeSingle();
  return Boolean(data);
}

/** POST /unlock { code }. */
export async function oawUnlock(
  body: any,
  db: any,
  projectId: string,
  respond: (data: unknown, status?: number) => Response,
) {
  const code = cleanCode(body?.code);
  if (!code) return respond({ error: 'code_invalid' }, 400);
  // Mark it used in one statement so a code cannot be redeemed twice.
  const { data, error } = await db
    .from('line_oa_kit_navigator_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('code_hash', await sha256Hex(code))
    .eq('project_id', projectId)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('project_id');
  if (error) return respond({ error: 'runtime_unavailable' }, 503);
  if (!data?.length) return respond({ error: 'code_invalid' }, 400);
  const saved = await db
    .from('line_oa_kit_navigator')
    .upsert({ project_id: projectId }, { onConflict: 'project_id', ignoreDuplicates: true });
  if (saved.error) return respond({ error: 'runtime_unavailable' }, 503);
  return respond({ plan: 'navigator' });
}
