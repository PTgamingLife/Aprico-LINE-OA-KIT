import { BUILD_MODEL } from './source-builder.ts';

export const REVIEW_MAX_USD = 0.01;
export const RUNTIME_MAX_USD = 0.01;

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
  },
  fetcher: typeof fetch = fetch,
) {
  if (!apiKey) throw Error('platform_ai_unavailable');
  if (new TextEncoder().encode(request.input).length > 12000) throw Error('ai_input_too_large');
  const quota = request.billing === 'quota';
  const maxUsd = request.purpose === 'review' ? REVIEW_MAX_USD : RUNTIME_MAX_USD;
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
  try {
    const response = await fetcher('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        model: BUILD_MODEL,
        store: false,
        max_output_tokens: Math.min(request.maxOutputTokens ?? 400, 2000),
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
  } finally {
    const usage = result?.usage;
    const verified =
      Number.isSafeInteger(usage?.input_tokens) &&
      Number.isSafeInteger(usage?.output_tokens) &&
      result.model === BUILD_MODEL;
    const settled = await db.rpc(quota ? 'line_oa_kit_quota_settle' : 'line_oa_kit_settle_ai', {
      p_request: request.id,
      p_usage: verified
        ? {
            model: result.model,
            responseId: result.id,
            inputTokens: usage.input_tokens,
            outputTokens: usage.output_tokens,
            cachedTokens: usage.input_tokens_details?.cached_tokens ?? 0,
            ...(request.feature ? { feature: request.feature } : {}),
          }
        : null,
    });
    if (settled.error) throw Error('points_settlement_failed');
  }
  if (
    result?.status !== 'completed' ||
    result.model !== BUILD_MODEL ||
    !Number.isSafeInteger(result.usage?.input_tokens) ||
    !Number.isSafeInteger(result.usage?.output_tokens)
  ) {
    throw Error('platform_ai_incomplete');
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
