import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateArtifact, generateSource } from '../supabase/functions/_shared/source-builder.ts';
import { meteredText } from '../supabase/functions/_shared/metered-text.ts';
import { runtimeAI, runtimeKeyDigest } from '../supabase/functions/_shared/runtime-ai.ts';
import { prefillInput, suggestBuildText } from '../supabase/functions/_shared/build-prefill.ts';
import { emptyDraft } from '../src/model.ts';
test('background data is never sent to paid AI and selected print is attached deterministically', async () => {
  let requestBody: any;
  const generated = {
    summary: 'draft',
    files: [{ path: 'index.html', content: '<h1>展示</h1>' }],
    manualSteps: [],
  };
  const result = await generateSource(
    'fixture',
    { design: { name: 'brand', pattern: 'linen', backgroundImage: 'private-image-not-for-ai' } },
    async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));
      return Response.json({
        status: 'completed',
        output: [
          { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(generated) }] },
        ],
      });
    },
  );
  assert.doesNotMatch(JSON.stringify(requestBody), /private-image-not-for-ai/);
  assert.match(
    result.artifact.files.find((f) => f.path === 'style.css')!.content,
    /Selected Aprico print/,
  );
  assert.match(result.artifact.files.find((f) => f.path === 'index.html')!.content, /style.css/);
});
test('reject traversal and workflow files before any deployment', () => {
  for (const path of ['../index.html', '.github/workflows/deploy.yml', 'supabase/functions/x.ts'])
    assert.throws(() =>
      validateArtifact({ summary: 'draft', files: [{ path, content: 'x' }], manualSteps: [] }),
    );
});
test('provider errors do not disclose key or response body', async () => {
  await assert.rejects(
    generateSource(
      'test-secret',
      { name: 'test' },
      (async () => new Response('private', { status: 401 })) as typeof fetch,
    ),
    /openai_401/,
  );
});
test('structured output is validated and returned without executing code', async () => {
  const fixture = {
    summary: 'draft',
    files: [{ path: 'index.html', content: '<!doctype html><h1>草稿</h1>' }],
    manualSteps: ['授權後部署'],
  };
  let requestBody: any;
  const result = await generateSource('test-secret', { name: 'test' }, (async (_url, options) => {
    requestBody = JSON.parse(options?.body as string);
    return Response.json({
      id: 'test',
      status: 'completed',
      model: 'test-model',
      usage: { input_tokens: 12, output_tokens: 30 },
      output: [
        { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(fixture) }] },
      ],
    });
  }) as typeof fetch);
  assert.deepEqual(result.artifact, fixture);
  assert.equal(requestBody.store, false);
  assert.equal(requestBody.max_output_tokens, 6000);
  assert.equal(requestBody.tools, undefined);
});
test('metered text refuses an exhausted or replayed reservation before contacting the provider', async () => {
  const spec = {
    id: 'fixture-unique-request',
    projectId: 'p',
    subject: 'owner',
    purpose: 'review' as const,
    instructions: 'fixture',
    input: 'test',
  };
  for (const code of ['points_insufficient', 'points_request_exists']) {
    await assert.rejects(
      meteredText({ rpc: async () => ({ data: { error: code } }) }, 'test-key', spec, async () => {
        throw Error('provider unexpectedly called');
      }),
      new RegExp(code),
    );
  }
});

test('build prefill sends goal and menu context while returning only editable service text', async () => {
  const draft = emptyDraft();
  draft.name = 'private-project';
  draft.oaName = 'private-oa';
  draft.backgroundImage = 'private-image';
  draft.goal = '讓顧客預約 https://secret.example/path';
  draft.cells[0] = { ...draft.cells[0], label: '預約服務', content: 'private-secret' };
  const input = prefillInput(draft)!;
  assert.match(input, /讓顧客預約.*預約服務/);
  assert.doesNotMatch(input, /private|secret\.example/);
  let cost = 0;
  const editable = {
    audience: '新顧客',
    purpose: '在 LINE 預約',
    scenario: '選擇服務',
    success: '收到確認',
    failure: '提示重試',
    human: '提供客服入口',
  };
  const result = await suggestBuildText(
    'fixture',
    input,
    (usd) => {
      cost = usd;
    },
    async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.store, false);
      assert.equal(body.text.format.strict, true);
      return Response.json({
        model: body.model,
        status: 'completed',
        usage: { input_tokens: 1000, output_tokens: 100 },
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({ ...editable, githubRepo: 'untrusted' }),
              },
            ],
          },
        ],
      });
    },
  );
  assert.deepEqual(result, editable);
  assert.equal(cost, 0.00056);
});

test('runtime attributes verified usage to the credential owner and strips forged project, model and price fields', async () => {
  const key = 'aprico_' + 'a'.repeat(64);
  const digest = await runtimeKeyDigest(key);
  const projectId = '00000000-0000-4000-8000-000000000092';
  const owner = 'U' + 'b'.repeat(32);
  const calls: any[] = [];
  const query = {
    select: () => query,
    eq: (col: string, value: string) => {
      assert.equal(col, 'key_digest');
      assert.equal(value, digest);
      return query;
    },
    is: (col: string, value: null) => {
      assert.equal(col, 'revoked_at');
      assert.equal(value, null);
      return query;
    },
    maybeSingle: async () => ({ data: { project_id: projectId, line_subject: owner } }),
  };
  const db = {
    from: () => query,
    rpc: async (name: string, args: any) => {
      calls.push({ name, args });
      return { data: { reserved: 3 } };
    },
  };
  const request = new Request('https://fixture/runtime', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      requestId: 'fixture-run-001',
      projectId: 'untrusted',
      subject: 'untrusted',
      model: 'untrusted',
      amount: 0,
      text: '請幫我整理行程',
    }),
  });
  const reply = await runtimeAI(request, db, 'provider-fixture', async (url, options) => {
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    const body = JSON.parse(String(options?.body));
    assert.equal(body.model, 'claude-sonnet-5-5');
    assert.deepEqual(body.thinking, { type: 'between_tools' });
    assert.deepEqual(body.messages, [{ role: 'user', content: '請幫我整理行程' }]);
    return Response.json({
      id: 'msg',
      model: body.model,
      stop_reason: 'end_turn',
      usage: { input_tokens: 400, cache_read_input_tokens: 100, output_tokens: 50 },
      content: [{ type: 'text', text: '行程摘要' }],
    });
  });
  assert.deepEqual(await reply.json(), { reply: '行程摘要' });
  assert.equal(calls[0].args.p_project, projectId);
  assert.equal(calls[0].args.p_subject, owner);
  assert.equal(calls[0].name, 'line_oa_kit_quota_reserve');
  assert.equal(calls[0].args.p_feature, 'runtime');
  assert.equal(calls[1].args.p_usage.inputTokens, 500);
  assert.equal(calls[1].args.p_usage.cachedTokens, 100);
  assert.equal(calls[1].args.p_usage.outputTokens, 50);
});
