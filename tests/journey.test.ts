import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  questSteps,
  journeySteps,
  journeyLevels,
  safeJourneyState,
  questProof,
  sameTarget,
  entered,
} from '../src/journey.ts';
import { emptyDraft } from '../src/model.ts';
import { emptySetup } from '../src/build-model.ts';
import {
  detailDefinitions,
  detailKey,
  pageDetails,
  detailProgress,
  safeDetailAcks,
} from '../src/journey-details.ts';
import {
  equipment,
  equipmentForStep,
  equipmentProgress,
  safeSecretaryProfile,
  safeSecretaryNotes,
  sensitiveNote,
} from '../src/equipment-model.ts';
import { tutorialScene } from '../src/tutorial-scenes.ts';
import { tutorialMedia, tutorialFrame, shotCamera } from '../src/tutorial-media.ts';
// Prettier may reflow code; compare source text with layout whitespace removed.
const code = (s: string) => s.replace(/\s*([^\w$\s])\s*/g, '$1').replace(/\s+/g, ' ');

function detailContext() {
  return {
    setup: emptySetup(),
    savedSetup: emptySetup(),
    secrets: { githubToken: '', supabaseToken: '', lineSecret: '', lineToken: '' },
    acks: {},
    details: {},
    githubMode: 'app',
    github: null,
    githubApp: false,
    grid: 4,
    consent: false,
    deployment: null,
  };
}
test('one system square, distinct human actions, optional LIFF only when needed', () => {
  assert.equal(questSteps.filter((q) => q.kind === 'automatic').length, 1);
  assert.equal(new Set(questSteps.map((q) => q.id)).size, questSteps.length);
  const d = emptyDraft();
  d.cells.forEach((c) => (c.action = 'message'));
  assert.ok(!journeySteps(d).some((q) => q.id === 'liff'));
  d.cells[0].action = 'half';
  assert.ok(journeySteps(d).some((q) => q.id === 'liff'));
  for (const q of questSteps) assert.ok('topic' in q || 'guide' in q);
});
test('five levels put LINE switch and optional Login fields in one visit', () => {
  const draft = emptyDraft();
  assert.equal(journeyLevels.length, 5);
  assert.ok(!journeySteps(draft).some((q) => q.id === 'lineToken' || q.id === 'loginPublish'));
  assert.ok(journeyLevels[2].ids.includes('webhook'));
  draft.cells[0].action = 'half';
  assert.ok(journeySteps(draft).some((q) => q.id === 'loginPublish'));
  assert.ok(journeyLevels[2].ids.includes('loginPublish'));
  const q = questSteps.find((q) => q.id === 'webhook')!;
  const context = { ...detailContext(), details: { 'webhook.switch': true } };
  assert.equal(pageDetails(q, context)[0].done, true);
  assert.equal(
    questProof(
      questSteps.find((q) => q.id === 'automatic'),
      { deployment: { status: 'awaiting_acceptance', system_checks: { pagesMode: 'actions' } } },
    ).done,
    false,
  );
});
test('resume whitelist never stores credentials or browser privilege claims', () => {
  const stored = safeJourneyState({
    step: 'automatic',
    secrets: { githubToken: 'private' },
    plan: {},
    acks: { 'github-signup': true, website: true, automatic: true, lineSecret: true },
  });
  assert.deepEqual(stored, { step: 'automatic', acks: { 'github-signup': true } });
  assert.doesNotMatch(JSON.stringify(stored), /private|lineSecret|plan/);
  assert.equal(safeJourneyState({ step: 'attacker' }).step, 'audience');
});
test('entered URLs and token presence do not masquerade as verified authorization', () => {
  const c = {
    setup: { ...emptySetup(), githubRepo: 'https://github.com/customer/demo' },
    secrets: { githubToken: 'fixture' },
    acks: {},
    plan: null,
    deployment: null,
  };
  assert.equal(
    questProof(
      questSteps.find((q) => q.id === 'review'),
      c,
    ).done,
    false,
  );
  assert.match(
    questProof(
      questSteps.find((q) => q.id === 'githubToken'),
      c,
    ).label,
    /待系統核對/,
  );
  assert.equal(
    entered(
      questSteps.find((q) => q.id === 'lineSecret'),
      {},
      { lineSecret: 'wrong' },
    ),
    false,
  );
});
test('draft or deployment request alone does not complete automatic or acceptance square', () => {
  const auto = questSteps.find((q) => q.id === 'automatic'),
    website = questSteps.find((q) => q.id === 'website');
  for (const status of ['queued', 'running', 'failed', 'interrupted'])
    assert.equal(questProof(auto, { deployment: { status } }).done, false);
  const c = { deployment: { status: 'awaiting_acceptance', user_checks: { website: true } } };
  assert.equal(questProof(auto, c).done, true);
  assert.equal(questProof(website, c).done, true);
  assert.match(questProof(website, c).label, /本人實測/);
});
test('automatic handoff refuses changed provider targets', () => {
  const p = { botId: 'one', githubRepo: 'owner/repo', ref: 'project' };
  assert.ok(sameTarget(p, { ...p }));
  for (const key of Object.keys(p)) assert.ok(!sameTarget(p, { ...p, [key]: 'changed' }));
  assert.ok(!sameTarget(p, null));
});
test('unsaved edits cannot advance persisted field progress', () => {
  const q = questSteps.find((q) => q.id === 'audience');
  const c = { setup: { audience: 'new' }, savedSetup: { audience: 'old' }, secrets: {} };
  assert.equal(questProof(q, c).done, false);
  c.savedSetup.audience = 'new';
  assert.equal(questProof(q, c).done, true);
});
test('paid generation is only explicit; resume stores no intents and system internals are collapsed', () => {
  const raw = readFileSync(new URL('../src/BuildJourney.jsx', import.meta.url), 'utf8');
  const ui = code(raw);
  assert.match(ui, /if\(!consent\|\|!ready\|\|!plan\|\|busy\)return/);
  assert.match(ui, /safeJourneyState\(\{step:q.id,acks\}\)/);
  assert.match(ui, /attempted.current.has/);
  assert.match(ui, /if\(!sameTarget/);
  assert.match(ui, /需要協助時才展開的紀錄/);
  // Statement-level check on the raw source: a setItem call may span several lines.
  assert.doesNotMatch(raw, /localStorage\.setItem\([^;]*secrets/);
});
test('existing draft can resume deployment without a new paid generation request', () => {
  const ui = code(readFileSync(new URL('../src/BuildJourney.jsx', import.meta.url), 'utf8'));
  assert.match(
    ui,
    /job\?\.status==='draft_ready'\?\{jobId:job.id\}:await api\(\{action:'generate_source'/,
  );
  assert.match(ui, /insufficient&&job\?\.status!=='draft_ready'/);
  assert.match(ui, /credits.remaining<credits.estimateMax/);
  assert.match(ui, /沿用已保存的同版本草稿/);
});
test('every page has distinct granular actions and AI stays one combined unit', () => {
  for (const mode of ['app', 'token'])
    for (const q of questSteps) {
      const ds = detailDefinitions(q, mode, 8);
      assert.ok(ds.length > 0, q.id);
      assert.equal(new Set(ds.map((d) => d.id)).size, ds.length);
      for (const d of ds) {
        assert.ok(d.title);
        assert.ok(d.text);
      }
    }
  assert.equal(detailDefinitions(questSteps.find((q) => q.id === 'automatic')).length, 1);
  const create = detailDefinitions(questSteps.find((q) => q.id === 'github-create'));
  assert.ok(!create.some((d) => d.id === 'readme'));
  assert.ok(create.some((d) => d.id === 'public'));
  assert.ok(create.some((d) => d.kind === 'link' && d.url === 'https://github.com/new'));
});
test('every completed point advances one equal unit, page navigation does not change the denominator', () => {
  const c = detailContext(),
    steps = journeySteps(emptyDraft()),
    q = questSteps.find((q) => q.id === 'webhook')!;
  const start = detailProgress(steps, c);
  let previous = start.percent;
  const details: any = {};
  for (const d of detailDefinitions(q)) {
    details[detailKey(q, d)] = true;
    const p = detailProgress(steps, { ...c, details });
    assert.equal(p.total, start.total);
    assert.ok(p.percent > previous);
    previous = p.percent;
  }
  assert.ok(detailProgress(steps, { ...c, details }).pages.find((p) => p.id === q.id)?.complete);
});
test('typing and saving are separate completion points and unsaved values are labeled', () => {
  const q = questSteps.find((q) => q.id === 'audience')!,
    c = detailContext();
  c.setup.audience = '新顧客';
  let units = pageDetails(q, c);
  assert.equal(units[0].done, true);
  assert.match(units[0].label, /尚未保存/);
  assert.equal(units[1].done, false);
  c.savedSetup.audience = c.setup.audience;
  units = pageDetails(q, c);
  assert.equal(units.filter((d) => d.done).length, 2);
});
test('link clicks and local booleans cannot complete server OAuth, binding or consent', () => {
  const c = detailContext(),
    q = questSteps.find((q) => q.id === 'githubToken')!;
  c.details = safeDetailAcks({
    'githubToken.install': true,
    'githubToken.limited': true,
    'githubToken.account': true,
    'githubToken.repository': true,
    'review.consent': true,
    'automatic.system': true,
    'lineSecret.input': true,
  });
  assert.deepEqual(c.details, { 'githubToken.install': true, 'githubToken.limited': true });
  const units = pageDetails(q, c);
  assert.equal(units[0].done, true);
  assert.equal(units[1].done, true);
  assert.equal(units[2].done, false);
  assert.equal(units[3].done, false);
  const review = pageDetails(
    questSteps.find((q) => q.id === 'review'),
    c,
  );
  assert.ok(review.every((d) => !d.done));
});
test('self-test detail confirmations belong to their deployment and never carry to another deployment', () => {
  const q = questSteps.find((q) => q.id === 'menu')!,
    old = '00000000-0000-0000-0000-000000000001',
    next = '00000000-0000-0000-0000-000000000002',
    c: any = {
      ...detailContext(),
      deployment: { id: old, status: 'awaiting_acceptance', user_checks: {} },
    };
  c.details = safeDetailAcks({
    ['menu.cell-0#' + old]: true,
    'menu.cell-1': true,
    'menu.cell-7#invalid': true,
  });
  assert.equal(pageDetails(q, c).find((d) => d.id === 'cell-0')?.done, true);
  assert.equal(pageDetails(q, c).find((d) => d.id === 'cell-1')?.done, false);
  c.deployment.id = next;
  assert.equal(pageDetails(q, c).find((d) => d.id === 'cell-0')?.done, false);
});
test('100 percent requires automatic completion and persisted user acceptance; running cannot round to 100', () => {
  const c: any = detailContext(),
    draft = emptyDraft();
  draft.cells.forEach((cell) => (cell.action = 'message'));
  const steps = journeySteps(draft);
  Object.assign(c.setup, {
    audience: '顧客',
    purpose: '服務',
    scenario: '點選服務',
    success: '完成操作',
    failure: '重試',
    human: '聯絡客服',
    githubRepo: 'https://github.com/owner/demo',
    supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co',
    messagingChannelId: '1234567890',
  });
  c.savedSetup = { ...c.setup };
  c.githubApp = true;
  c.deployment = {
    id: '00000000-0000-0000-0000-000000000001',
    status: 'awaiting_acceptance',
    user_checks: { website: true, lineMessage: true, menu: true, liff: true },
  };
  for (const q of steps)
    for (const d of detailDefinitions(q, 'app', 4))
      if (['link', 'confirm'].includes(d.kind)) c.details[detailKey(q, d, c.deployment.id)] = true;
  let p = detailProgress(steps, c);
  assert.equal(p.percent, 100);
  assert.equal(p.done, p.total);
  c.deployment.status = 'running';
  p = detailProgress(steps, c);
  assert.ok(p.percent < 100);
  assert.ok(!p.pages.find((p) => p.id === 'automatic')?.complete);
});
test('local checklist resume stores only recognized nonsecret acknowledgement keys', () => {
  const clean = safeDetailAcks({
    'github-create.created': true,
    'github-create.public': true,
    token: 'secret',
    'audience.input': 'private text',
    'supabaseToken.input': true,
    plan: true,
  });
  assert.deepEqual(clean, { 'github-create.created': true, 'github-create.public': true });
  assert.deepEqual(safeDetailAcks(JSON.parse(JSON.stringify(clean))), clean);
  assert.ok(!JSON.stringify(clean).includes('secret'));
});

test('equipment covers each human/system step once and keeps Supabase as storage ring', () => {
  const assigned = equipment.flatMap((e) => [...e.pages]);
  assert.equal(new Set(assigned).size, assigned.length);
  for (const q of questSteps) {
    assert.equal(assigned.filter((id) => id === q.id).length, 1);
    assert.ok(equipmentForStep(q.id));
  }
  assert.equal(equipment.find((e) => e.id === 'ring')?.name, '儲物戒');
  assert.equal(equipmentForStep('automatic'), 'badge');
  const draft = emptyDraft(),
    groups = equipmentProgress([{ id: 'supabase-signup', done: 2, total: 4 }], draft, false);
  assert.equal(groups.find((g) => g.id === 'ring')?.complete, false);
  assert.equal(groups.find((g) => g.id === 'uniform')?.complete, false);
  draft.cells.forEach((c) => {
    c.label = '服務';
    c.content = '內容';
  });
  const saved = equipmentProgress([], draft, true);
  assert.equal(saved.find((g) => g.id === 'uniform')?.complete, true);
  assert.equal(saved.find((g) => g.id === 'voice')?.complete, true);
});
test('appearance is isolated presentation state and notes reject recognizable credentials', () => {
  assert.deepEqual(safeSecretaryProfile({ appearance: 'male', role: 'admin', token: 'secret' }), {
    appearance: 'male',
  });
  assert.equal(safeSecretaryProfile(null).appearance, 'female');
  for (const secret of [
    'sk-proj-abcdefghijklmnopqrst',
    'github_pat_abcdefghijklmnop',
    'sb_secret_abcdefghijklmnop',
    '-----BEGIN RSA PRIVATE KEY-----',
    'Bearer test-token',
    'a'.repeat(32),
  ])
    assert.equal(sensitiveNote(secret), true, secret.slice(0, 10));
  assert.deepEqual(
    safeSecretaryNotes([
      { text: '想增加活動入口', date: '2026-11-04', token: 'private' },
      { text: 'sk-proj-abcdefghijklmnopqrst' },
      { text: 'a'.repeat(1201) },
    ]),
    [{ text: '想增加活動入口', date: '2026-11-04' }],
  );
});
test('every subtask has a bounded mobile tutorial scene with safe illustrative values', () => {
  for (const q of questSteps)
    for (const d of detailDefinitions(q, 'app', 8)) {
      const scene = tutorialScene({ ...d, key: detailKey(q, d) });
      assert.ok(scene.rows.length >= 3 && scene.rows.length <= 5);
      assert.ok(scene.focus >= 0 && scene.focus < scene.rows.length);
      assert.ok(scene.platform);
    }
  assert.equal(
    tutorialScene({ key: 'github-create.readme', title: 'README', text: '確認' }).focus,
    3,
  );
  assert.equal(
    tutorialScene({ key: 'lineSecret.input', title: 'Secret', text: '安全填寫' }).platform,
    'LINE Developers',
  );
  assert.match(
    tutorialScene({ key: 'lineToken.input', title: 'Token', text: '沿用' }).rows.join(' '),
    /已有 Token.*沿用/,
  );
});

test('real screenshot tutorials use existing local assets, attributable sources and bounded annotations', () => {
  for (const q of questSteps)
    for (const d of detailDefinitions(q, 'app', 8)) {
      const media = tutorialMedia({ ...d, key: detailKey(q, d) });
      if (!media) continue;
      assert.ok(media.source.startsWith('https://'));
      assert.ok(media.credit);
      for (const frame of media.frames || [media]) {
        assert.ok(
          readFileSync(new URL('../public/tutorials/real/' + frame.file, import.meta.url))
            .byteLength > 1000,
        );
        const [x, y, w, h] = frame.box;
        assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 100 && y + h <= 100);
        const [cx, cy, cw, ch] = shotCamera(375, 844, frame.box, true).split(' ').map(Number);
        assert.ok(
          cx >= 0 && cy >= 0 && cw > 0 && ch > 0 && cx + cw <= 375.001 && cy + ch <= 844.001,
        );
      }
    }
  assert.equal(tutorialMedia({ key: 'supabaseToken.input' })?.label, 'Supabase 桌面版實際截圖');
  assert.equal(tutorialMedia({ key: 'githubToken.input' }), null);
  assert.deepEqual(
    tutorialMedia({ key: 'lineToken.input' })?.frames?.map((f) => f.file),
    [
      'line-channel-tabs.png',
      'line-long-lived-token-label.png',
      'line-long-lived-token-controls.png',
    ],
  );
  assert.equal(tutorialMedia({ key: 'unknown.input' }), null);
  assert.equal(shotCamera(375, 844, [0, 0, 100, 100], false), '0 0 375 844');
  assert.equal(
    tutorialMedia({ key: 'webhook.switch#00000000-0000-0000-0000-000000000001' })?.file,
    'line-webhook.png',
  );
  assert.equal(
    tutorialMedia({ key: 'github-signup.account' })?.frames?.[1].file,
    'github-signup-form.png',
  );
});

test('Supabase token walkthrough uses distinct actual frames without claiming to show generated credentials', () => {
  const media = tutorialMedia({ key: 'supabaseToken.open' })!;
  assert.equal(media.frames?.length, 3);
  assert.equal(tutorialFrame(media, 0)?.file, 'supabase-token-entry.png');
  assert.equal(tutorialFrame(media, 1)?.file, 'supabase-token-scope.png');
  assert.equal(tutorialFrame(media, 2)?.file, 'supabase-token-permissions.png');
  assert.equal(tutorialFrame(media, -10), tutorialFrame(media, 0));
  assert.equal(tutorialFrame(media, 90), tutorialFrame(media, 2));
  assert.equal(tutorialFrame(media, NaN), tutorialFrame(media, 0));
  assert.equal(tutorialFrame(null, 1), null);
  const scope = tutorialMedia({ key: 'supabaseToken.scope' })!;
  assert.match(tutorialFrame(scope, 0)?.instruction || '', /Project Settings.*Read/);
  assert.match(tutorialFrame(scope, 1)?.instruction || '', /Edge Functions.*Read-write/);
  assert.match(tutorialFrame(scope, 2)?.instruction || '', /Edge Function Secrets.*Read-write/);
  assert.deepEqual(
    tutorialMedia({ key: 'liff.open' })?.frames?.map((f) => f.file),
    ['line-liff-list.webp', 'line-liff-form.png', 'line-liff-form.png'],
  );
  const input = tutorialMedia({ key: 'supabaseToken.input' })!;
  assert.equal(tutorialFrame(input, 1)?.file, 'supabase-token-review-official.png');
  assert.equal(tutorialFrame(input, 2)?.file, 'supabase-token-capabilities-official.png');
  assert.match(tutorialFrame(input, 2)?.instruction || '', /Database 保持 None/);
  const single = tutorialMedia({ key: 'github-create.readme' })!;
  assert.equal(tutorialFrame(single, 2), single);
  for (const [file, width, height] of [
    ['supabase-token-entry.png', 900, 425],
    ['supabase-token-scope.png', 978, 854],
    ['supabase-token-permissions.png', 978, 854],
  ] as const) {
    const image = readFileSync(new URL('../public/tutorials/real/' + file, import.meta.url));
    assert.equal(image.subarray(1, 4).toString(), 'PNG');
    assert.equal(image.readUInt32BE(16), width, 'Do not publish the original full screenshot');
    assert.equal(image.readUInt32BE(20), height, 'Only the approved crop may be published');
  }
});

test('project location screenshots remain distinct from Token permissions and do not add manual secret work', () => {
  const url = tutorialMedia({ key: 'supabaseUrl.connect' })!;
  assert.deepEqual(
    url.frames?.map((f) => f.file),
    ['supabase-project-settings-nav.png', 'supabase-general-nav.png', 'supabase-project-id.png'],
  );
  assert.match(tutorialFrame(url, 2)?.instruction || '', /https:.*\.supabase\.co/);
  assert.match(tutorialFrame(url, 2)?.instruction || '', /不要照抄/);
  const setup = tutorialMedia({ key: 'supabaseUrl.input' })!;
  assert.match(tutorialFrame(setup, 2)?.instruction || '', /不代表部署授權/);
  const automatic = tutorialMedia({ key: 'automatic.system' })!;
  assert.deepEqual(
    automatic.frames?.map((f) => f.file),
    [
      'supabase-functions-nav.png',
      'supabase-functions-secrets-nav.png',
      'supabase-secrets-empty-form.png',
    ],
  );
  assert.match(tutorialFrame(automatic, 2)?.instruction || '', /一般流程由系統配置/);
  assert.match(tutorialFrame(automatic, 2)?.instruction || '', /只有部署結果提示/);
  assert.match(tutorialFrame(automatic, 2)?.instruction || '', /不要把 Supabase Access Token/);
  assert.equal(questSteps.filter((q) => q.kind === 'automatic').length, 1);
  assert.equal(detailDefinitions(questSteps.find((q) => q.id === 'automatic')).length, 1);
  const token = tutorialMedia({ key: 'supabaseToken.scope' })!;
  assert.deepEqual(
    token.frames?.map((f) => f.file),
    [
      'supabase-scope-project-settings.png',
      'supabase-scope-edge-functions.png',
      'supabase-scope-edge-secrets.png',
    ],
  );
  const dimensions = [
    ['supabase-project-settings-nav.png', 245, 700],
    ['supabase-general-nav.png', 320, 200],
    ['supabase-project-id.png', 860, 90],
    ['supabase-functions-nav.png', 245, 700],
    ['supabase-projects-toolbar.png', 1050, 150],
    ['supabase-project-example-card.png', 330, 220],
    ['supabase-functions-secrets-nav.png', 320, 200],
    ['supabase-secrets-empty-form.png', 1440, 480],
  ] as const;
  for (const [file, width, height] of dimensions) {
    const image = readFileSync(new URL('../public/tutorials/real/' + file, import.meta.url));
    assert.equal(image.readUInt32BE(16), width);
    assert.equal(image.readUInt32BE(20), height);
  }
});
