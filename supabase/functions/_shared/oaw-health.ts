// /health-scan for the OAW 「個人健康 AI 秘書」 template: face + tongue photos in,
// a wellness report (養生版) out. Billed to the elder's own subscription quota.
// Photos are passed straight to the model and never stored here.
import { meteredText } from './metered-text.ts';
import { oawGrant } from './oaw-api.ts';
import { HEALTH_SCAN_PROMPT } from './oaw-health-prompt.ts';

const MAX_IMAGE_B64 = 1_400_000; // ~1 MB per photo after base64
const respond = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

const str = { type: 'string' };
const obj = (props: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(props),
  properties: props,
});
const list = (item: unknown) => ({ type: 'array', items: item });
const features = obj({ detected: list(str), normal: { type: 'boolean' } });
const finding = obj({ item: str, observation: str, meaning: str });

export const HEALTH_SCHEMA = obj({
  scores: obj({
    faceZone: list({ type: 'integer' }),
    tongue: list({ type: 'integer' }),
    eye: list({ type: 'integer' }),
  }),
  tongueFeatures: features,
  faceFeatures: features,
  eyeFeatures: features,
  faceZones: list(obj({ zone: str, organ: str, status: str })),
  tongueAnalysis: list(finding),
  eyeAnalysis: list(finding),
  constitution: obj({ type: str, description: str, crossVerify: str }),
  focus: list(obj({ issue: str, advice: str })),
  nutrients: list(obj({ name: str, reason: str, foods: str })),
  dietAdvice: obj({
    eat: list(obj({ food: str, reason: str })),
    avoid: obj({ food: str, reason: str }),
  }),
  acupoints: list(obj({ name: str, location: str, effect: str })),
  lifestyle: list(str),
  nourish: obj({ organ: str, theory: str, foods: list(str) }),
});

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
        schema: HEALTH_SCHEMA,
        maxOutputTokens: 2000,
        billing: 'quota',
      },
      fetcher,
    );
    const report: any = clean(JSON.parse(text));
    const score = healthScore(report.scores);
    if (!score) return respond({ error: 'report_invalid' }, 502);
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
