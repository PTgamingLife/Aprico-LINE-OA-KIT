import { BUILD_MODEL } from './source-builder.ts';

export const REVIEW_MAX_USD = 0.01;
export const RUNTIME_MAX_USD = 0.01;
// Subscription-quota calls (OAW apps) run on Claude; legacy points calls stay on OpenAI.
export const QUOTA_MODEL = 'claude-sonnet-5-5';
const QUOTA_USD_PER_TOKEN = { input: 2e-6, output: 10e-6 };

/** Worst-case cost to hold: every input byte as a token, plus the full output cap. */
export function quotaHoldUsd(bytes: number, maxOutputTokens: number) {
  const usd = bytes * QUOTA_USD_PER_TOKEN.input + maxOutputTokens * QUOTA_USD_PER_TOKEN.output;
  return Math.min(0.1, Math.ceil((usd + 0.001) * 1000) / 1000);
}

async function claudeText(
  apiKey: string,
  request: {
    instructions: string;
    input: string;
    schema?: Record<string, unknown>;
    images?: { type: string; data: string }[];
  },
  maxTokens: number,
  fetcher: typeof fetch,
) {
  const response = await fetcher('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2026-10-21',
      'Content-Type': 'application/json',
    },
    redirect: 'error',
    // Photo reports write ~2000 tokens; text calls stay short.
    signal: AbortSignal.timeout(request.images?.length ? 90000 : 30000),
    body: JSON.stringify({
      model: QUOTA_MODEL,
      max_tokens: maxTokens,
      // Short replies and extraction: no thinking, low effort keeps cost per message down.
      thinking: { type: 'between_tools' },
      output_config: {
        effort: 'low',
        ...(request.schema ? { format: { type: 'json_schema', schema: request.schema } } : {}),
      },
      system: request.instructions,
      messages: [
        {
          role: 'user',
          content: request.images?.length
            ? [
                ...request.images.map((img) => ({
                  type: 'image',
                  source: { type: 'base64', media_type: img.type, data: img.data },
                })),
                { type: 'text', text: request.input },
              ]
            : request.input,
        },
      ],
    }),
  });
  if (!response.ok) {
    // The API refused the request, so nothing was billed: log why (no content) and release the hold.
    const err = await response.json().catch(() => null);
    console.warn(
      'claude request refused',
      response.status,
      err?.error?.type ?? '',
      String(err?.error?.message ?? '').slice(0, 300),
    );
    return { refused: true };
  }
  const r = await response.json();
  return {
    model: r.model,
    id: r.id,
    completed: r.stop_reason === 'end_turn',
    usage: {
      // Anthropic reports cached input separately; the settle RPC expects the total.
      input_tokens:
        (r.usage?.input_tokens ?? NaN) +
        (r.usage?.cache_read_input_tokens ?? 0) +
        (r.usage?.cache_creation_input_tokens ?? 0),
      output_tokens: r.usage?.output_tokens,
      cached: r.usage?.cache_read_input_tokens ?? 0,
    },
    text: (r.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')
      .trim(),
  };
}

export async function meteredText(
  db: any,
  apiKey: string,
  request: {
    id: string;
    projectId: string;
    subject: string;
    purpose: 'review' | 'runtime';
    instructions: string;
    input: string;
    schema?: Record<string, unknown>;
    schemaName?: string;
    maxOutputTokens?: number;
    feature?: string;
    // 'quota' = monthly subscription quota (OAW apps); default = legacy points wallet.
    billing?: 'points' | 'quota';
    // Quota (Claude) calls only: base64 JPEG/PNG images sent before the text.
    images?: { type: string; data: string }[];
  },
  fetcher: typeof fetch = fetch,
) {
  if (!apiKey) throw Error('platform_ai_unavailable');
  if (new TextEncoder().encode(request.input).length > 12000) throw Error('ai_input_too_large');
  const quota = request.billing === 'quota';
  const maxTokens = Math.min(request.maxOutputTokens ?? 400, 3000);
  const maxUsd = quota
    ? quotaHoldUsd(
        new TextEncoder().encode(
          request.instructions + request.input + JSON.stringify(request.schema ?? {}),
        ).length +
          // A phone photo is resized by the API to at most ~1600 tokens.
          (request.images?.length ?? 0) * 1600,
        maxTokens,
      )
    : request.purpose === 'review'
      ? REVIEW_MAX_USD
      : RUNTIME_MAX_USD;
  const { data: held, error } = quota
    ? await db.rpc('line_oa_kit_quota_reserve', {
        p_request: request.id,
        p_project: request.projectId,
        p_subject: request.subject,
        // Quota usage rows only know these features; task labels count as runtime.
        p_feature: ['design', 'digest'].includes(request.feature ?? '')
          ? request.feature
          : 'runtime',
        p_max_usd: maxUsd,
      })
    : await db.rpc('line_oa_kit_reserve_ai', {
        p_request: request.id,
        p_project: request.projectId,
        p_subject: request.subject,
        p_purpose: request.purpose,
        p_max_usd: maxUsd,
      });
  if (error || !held) throw Error('points_reservation_failed');
  if (held.error) throw Error(held.error);
  let result: any;
  const model = quota ? QUOTA_MODEL : BUILD_MODEL;
  try {
    if (quota) result = await claudeText(apiKey, request, maxTokens, fetcher);
    else {
      const response = await fetcher('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          model: BUILD_MODEL,
          store: false,
          max_output_tokens: maxTokens,
          instructions: request.instructions,
          input: request.input,
          ...(request.schema
            ? {
                text: {
                  format: {
                    type: 'json_schema',
                    name: request.schemaName ?? 'review_edit',
                    strict: true,
                    schema: request.schema,
                  },
                },
              }
            : {}),
        }),
      });
      if (response.ok) result = await response.json();
    }
  } finally {
    const usage = result?.usage;
    const verified =
      Number.isSafeInteger(usage?.input_tokens) &&
      Number.isSafeInteger(usage?.output_tokens) &&
      result.model === model;
    const settled = await db.rpc(quota ? 'line_oa_kit_quota_settle' : 'line_oa_kit_settle_ai', {
      p_request: request.id,
      p_usage: verified
        ? {
            model: result.model,
            responseId: result.id,
            inputTokens: usage.input_tokens,
            outputTokens: usage.output_tokens,
            cachedTokens: quota ? usage.cached : (usage.input_tokens_details?.cached_tokens ?? 0),
            ...(request.feature ? { feature: request.feature } : {}),
          }
        : quota && result?.refused
          ? { model: QUOTA_MODEL, inputTokens: 0, outputTokens: 0, cachedTokens: 0 }
          : null,
    });
    if (settled.error) throw Error('points_settlement_failed');
  }
  if (
    !(quota ? result?.completed : result?.status === 'completed') ||
    result.model !== model ||
    !Number.isSafeInteger(result.usage?.input_tokens) ||
    !Number.isSafeInteger(result.usage?.output_tokens)
  ) {
    throw Error('platform_ai_incomplete');
  }
  if (quota) {
    if (!result.text) throw Error('platform_ai_empty');
    return result.text as string;
  }
  const output = result.output
    ?.flatMap((item: any) =>
      item.type === 'message' && Array.isArray(item.content) ? item.content : [],
    )
    .filter((item: any) => item.type === 'output_text')
    .map((item: any) => item.text)
    .join('')
    .trim();
  if (!output) throw Error('platform_ai_empty');
  return output as string;
}
