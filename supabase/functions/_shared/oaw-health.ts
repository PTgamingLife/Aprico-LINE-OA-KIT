// /health-scan for the OAW 「個人健康 AI 秘書」 template: face + tongue photos in,
// a wellness report (養生版) out. Billed to the elder's own subscription quota.
// Photos are passed straight to the model and never stored here.
import { meteredText } from './metered-text.ts';
import { oawGrant } from './oaw-api.ts';
import { HEALTH_SCAN_PROMPT } from './oaw-health-prompt.ts';

const MAX_IMAGE_B64 = 1_400_000; // ~1 MB per photo after base64
const respond = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

// Weights from facialmonitor score.ts v4 (each list sums to 1; blocks 35/35/30).
const BLOCKS = {
  face: { len: 6, w: [0.15, 0.2, 0.2, 0.15, 0.15, 0.15], block: 0.35 },
  tongue: { len: 5, w: [0.25, 0.2, 0.2, 0.2, 0.15], block: 0.35 },
  eye: { len: 4, w: [0.3, 0.3, 0.2, 0.2], block: 0.3 },
} as const;

/** Total 0-100 computed here, never by the model. Null when the scores are unusable. */
export function healthScore(scores: any) {
  const raw = { face: scores?.faceZone, tongue: scores?.tongue, eye: scores?.eye };
  const breakdown: Record<string, number> = {};
  let total = 0;
  for (const [key, b] of Object.entries(BLOCKS)) {
    const arr = raw[key as keyof typeof raw];
    if (!Array.isArray(arr) || arr.length !== b.len) return null;
    if (!arr.every((v) => Number.isInteger(v) && v >= 1 && v <= 10)) return null;
    const avg = arr.reduce((s: number, v: number, i: number) => s + v * b.w[i], 0);
    breakdown[key] = Math.round(avg * 10);
    total += avg * b.block;
  }
  return { version: 4, total: Math.round(total * 10), breakdown };
}

// The full report is too large for strict structured output (the API rejects the compiled
// grammar), so the model writes JSON from the prompt and the shape is enforced here.
function parseJson(text: string) {
  const body = text.replace(/```(?:json)?/g, '').trim();
  const start = body.indexOf('{'),
    end = body.lastIndexOf('}');
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const o = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as any) : {});
const s = (v: unknown) => (typeof v === 'string' ? v : '');
/** Every field the LIFF reads exists with the right type; text items keep only strings. */
export function normalize(r: any) {
  if (!r || typeof r !== 'object') return null;
  const items = (v: unknown, keys: string[]) =>
    arr(v)
      .map(o)
      .map((x) => Object.fromEntries(keys.map((k) => [k, s(x[k])])))
      .filter((x) => Object.values(x).some(Boolean));
  const feat = (v: unknown) => ({
    detected: arr(o(v).detected).map(s).filter(Boolean),
    normal: o(v).normal === true,
  });
  const diet = o(r.dietAdvice);
  return {
    scores: o(r.scores),
    tongueFeatures: feat(r.tongueFeatures),
    faceFeatures: feat(r.faceFeatures),
    eyeFeatures: feat(r.eyeFeatures),
    faceZones: items(r.faceZones, ['zone', 'organ', 'status']),
    tongueAnalysis: items(r.tongueAnalysis, ['item', 'observation', 'meaning']),
    eyeAnalysis: items(r.eyeAnalysis, ['item', 'observation', 'meaning']),
    constitution: {
      type: s(o(r.constitution).type),
      description: s(o(r.constitution).description),
      crossVerify: s(o(r.constitution).crossVerify),
    },
    focus: items(r.focus, ['issue', 'advice']),
    nutrients: items(r.nutrients, ['name', 'reason', 'foods']),
    dietAdvice: {
      eat: items(diet.eat, ['food', 'reason']),
      avoid: { food: s(o(diet.avoid).food), reason: s(o(diet.avoid).reason) },
    },
    acupoints: items(r.acupoints, ['name', 'location', 'effect']),
    lifestyle: arr(r.lifestyle).map(s).filter(Boolean),
    nourish: {
      organ: s(o(r.nourish).organ),
      theory: s(o(r.nourish).theory),
      foods: arr(o(r.nourish).foods).map(s).filter(Boolean),
    },
  };
}

// No disease names or western-medicine notes reach the elder or the caregivers.
const BANNED = /癌|腫瘤|糖尿病|高血壓|中風|心臟病|腎衰竭|肝硬化|失智/;
const clean = (v: unknown): unknown =>
  typeof v === 'string'
    ? BANNED.test(v)
      ? '建議請醫師確認'
      : v.slice(0, 300)
    : Array.isArray(v)
      ? v.slice(0, 10).map(clean)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)]))
        : v;

const photo = (p: any) =>
  p &&
  ['image/jpeg', 'image/png'].includes(p.type) &&
  typeof p.data === 'string' &&
  p.data.length <= MAX_IMAGE_B64 &&
  /^[A-Za-z0-9+/]+={0,2}$/.test(p.data);

export async function healthScan(
  req: Request,
  db: any,
  aiKey: string,
  fetcher: typeof fetch = fetch,
) {
  if (req.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405);
  const grant = await oawGrant(req, db);
  if (grant instanceof Response) return grant;
  const raw = await req.text();
  if (raw.length > 2 * MAX_IMAGE_B64 + 2000) return respond({ error: 'input_too_large' }, 413);
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return respond({ error: 'invalid_input' }, 400);
  }
  if (
    typeof body?.requestId !== 'string' ||
    !/^[A-Za-z0-9_-]{12,80}$/.test(body.requestId) ||
    !photo(body.face) ||
    !photo(body.tongue)
  )
    return respond({ error: 'invalid_input' }, 400);
  try {
    const text = await meteredText(
      db,
      aiKey,
      {
        id: `oaw-health:${grant.project_id}:${body.requestId}`,
        projectId: grant.project_id,
        subject: grant.line_subject,
        purpose: 'runtime',
        feature: 'runtime',
        instructions: HEALTH_SCAN_PROMPT,
        input: '請依照片完成養生版三診報告。',
        images: [body.face, body.tongue],
        // Without a schema the model must stop on its own; leave room for the full report.
        maxOutputTokens: 3000,
        billing: 'quota',
      },
      fetcher,
    );
    const report: any = clean(normalize(parseJson(text)));
    const score = healthScore(report.scores);
    if (!score || !report.constitution.type) return respond({ error: 'report_invalid' }, 502);
    return respond({ report: { ...report, score } });
  } catch (e) {
    const code = e instanceof Error ? e.message : '';
    if (code === 'points_insufficient') return respond({ error: code }, 402);
    if (code === 'points_plan_required') return respond({ error: code }, 403);
    if (code === 'rate_limited') return respond({ error: code }, 429);
    if (code === 'points_request_exists') return respond({ error: code }, 409);
    return respond({ error: 'runtime_unavailable' }, 503);
  }
}
