import { validateArtifact } from './source-builder.ts';
import {
  publishPagesWorkflow,
  configureLiff,
  prepareMenu,
  defaultMenu,
  liffSizes,
  liffPage,
} from './deploy-integrations.ts';
import { recordPresets } from '../../../src/design-catalog.ts';
export type DeployCredentials = {
  githubToken: string;
  supabaseToken: string;
  lineToken: string;
  lineSecret: string;
  loginSecret?: string;
  githubRepositoryId?: number;
  actionsPages?: boolean;
  stateless?: boolean;
};
export function credentials(value: any): DeployCredentials {
  const out: any = {};
  for (const key of ['githubToken', 'supabaseToken', 'lineSecret']) {
    if (
      typeof value?.[key] !== 'string' ||
      !value[key].trim() ||
      value[key].length > 6000 ||
      /[\r\n]/.test(value[key])
    )
      throw Error('credentials_required');
    out[key] = value[key].trim();
  }
  for (const key of ['lineToken', 'loginSecret']) {
    const v = value?.[key] ?? '';
    if (typeof v !== 'string' || v.length > 6000 || /[\r\n]/.test(v))
      throw Error('credentials_invalid');
    out[key] = v.trim();
  }
  if (out.loginSecret && !/^[a-f0-9]{32}$/i.test(out.loginSecret))
    throw Error('line_login_secret_format');
  if (!/^[a-f0-9]{32}$/i.test(out.lineSecret)) throw Error('line_secret_format');
  return out;
}
export function deploymentTarget(projectId: string, setup: any, projectName = '') {
  if (!/^[a-f0-9-]{36}$/i.test(projectId)) throw Error('invalid_target');
  const repo = new URL(setup.githubRepo),
    supa = new URL(setup.supabaseUrl);
  if (
    repo.origin !== 'https://github.com' ||
    repo.username ||
    repo.password ||
    repo.search ||
    repo.hash ||
    !/^\/[\w.-]+\/[\w.-]+\/?$/.test(repo.pathname) ||
    !/^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/.test(supa.href)
  )
    throw Error('invalid_target');
  const [owner, name] = repo.pathname.split('/').filter(Boolean);
  if (
    name.toLowerCase().endsWith('.git') ||
    name.toLowerCase() === owner.toLowerCase() + '.github.io'
  )
    throw Error('invalid_target');
  const suffix = projectId.replaceAll('-', '').toLowerCase();
  const projectPrefix =
    projectName
      .replace(/[^a-z0-9]/gi, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 16)
      .toUpperCase() || 'APRICO';
  return {
    owner,
    repo: name,
    ref: supa.hostname.split('.')[0],
    branch: `aprico-${suffix}`,
    slug: `aprico-${suffix}`,
    prefix: `${projectPrefix}_${suffix.toUpperCase()}`,
    repoPath: `/repos/${owner}/${name}`,
  };
}
export function apiClient(c: DeployCredentials, fetcher: typeof fetch = fetch) {
  async function request(
    service: 'github' | 'supabase' | 'line',
    path: string,
    method = 'GET',
    body?: any,
    allow404 = false,
  ) {
    const base = {
      github: 'https://api.github.com',
      supabase: 'https://api.supabase.com',
      line: 'https://api.line.me',
    }[service];
    if (!path.startsWith('/') || path.includes('://')) throw Error('invalid_api_path');
    const headers: any = {
      Authorization: `Bearer ${c[service === 'github' ? 'githubToken' : service === 'supabase' ? 'supabaseToken' : 'lineToken']}`,
    };
    if (service === 'github') {
      headers.Accept = 'application/vnd.github+json';
      headers['X-GitHub-Api-Version'] = '2026-03-10';
      headers['User-Agent'] = 'Aprico-LINE-OA-KIT';
    }
    if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const r = await fetcher(base + path, {
      method,
      headers,
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      redirect: 'error',
      signal: AbortSignal.timeout(45000),
    });
    if (allow404 && r.status === 404) return null;
    if (!r.ok) throw Error(`${service}_${r.status}`);
    const data = await r.text();
    return data ? JSON.parse(data) : {};
  }
  return request;
}
export async function statelessLineToken(
  channelId: string,
  secret: string,
  fetcher: typeof fetch = fetch,
) {
  if (!/^\d{6,20}$/.test(channelId) || !secret) throw Error('line_channel_credentials_required');
  const r = await fetcher('https://api.line.me/oauth2/v3/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: channelId,
      client_secret: secret,
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw Error('line_channel_credentials_invalid');
  const data = await r.json();
  if (typeof data.access_token !== 'string' || !data.access_token)
    throw Error('line_channel_credentials_invalid');
  return data.access_token as string;
}
async function webhookFingerprint(endpoint: string) {
  if (!endpoint) return '';
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
type DeploymentCall = ReturnType<typeof apiClient>;
async function githubHead(
  call: DeploymentCall,
  repoPath: string,
  branch: string,
): Promise<string | null> {
  if (typeof branch !== 'string' || !branch) throw Error('repository_default_branch_unavailable');
  let head;
  try {
    head = await call(
      'github',
      repoPath + '/git/ref/heads/' + encodeURIComponent(branch),
      'GET',
      undefined,
      true,
    );
  } catch (e) {
    if (!(e instanceof Error) || e.message !== 'github_409') throw e;
  }
  if (typeof head?.object?.sha === 'string' && head.object.sha) return head.object.sha;
  const branches = await call('github', repoPath + '/branches?per_page=1');
  if (Array.isArray(branches) && branches.length === 0) return null;
  throw Error('repository_default_branch_unavailable');
}
async function initializeGithub(call: DeploymentCall, target: any) {
  const current = await githubHead(call, target.repoPath, target.defaultBranch);
  if (await call('github', target.repoPath + '/pages', 'GET', undefined, true))
    throw Error('existing_pages_requires_review');
  if (current) return current;
  const created = await call('github', target.repoPath + '/contents/.nojekyll', 'PUT', {
    message: 'Initialize repository for Aprico deployment',
    content: btoa('\n'),
  });
  if (!/^[a-f0-9]{40}$/.test(created?.commit?.sha || ''))
    throw Error('repository_initialization_failed');
  return created.commit.sha as string;
}
export async function preflight(
  projectId: string,
  snapshot: any,
  c: DeployCredentials,
  fetcher: typeof fetch = fetch,
  allowExisting = false,
) {
  const t = deploymentTarget(projectId, snapshot.setup, snapshot.design.name),
    call = apiClient(c, fetcher);
  const repo = await call('github', t.repoPath);
  const canPush = c.githubRepositoryId ? repo.id === c.githubRepositoryId : repo.permissions?.push;
  if (
    repo.full_name?.toLowerCase() !== `${t.owner}/${t.repo}`.toLowerCase() ||
    !canPush ||
    repo.private ||
    repo.archived
  )
    throw Error('repository_not_public_writable');
  const headSha = await githubHead(call, t.repoPath, repo.default_branch);
  if (await call('github', `${t.repoPath}/pages`, 'GET', undefined, true))
    throw Error('existing_pages_requires_review');
  if (
    headSha &&
    (await call('github', `${t.repoPath}/git/ref/heads/${t.branch}`, 'GET', undefined, true))
  )
    throw Error('existing_branch_requires_review');
  const supa = await call('supabase', `/v1/projects/${t.ref}`);
  if (supa.id !== t.ref && supa.ref !== t.ref) throw Error('supabase_project_mismatch');
  if (await call('supabase', `/v1/projects/${t.ref}/functions/${t.slug}`, 'GET', undefined, true))
    throw Error('existing_function_requires_review');
  if (!c.lineToken || c.stateless) {
    c.lineToken = await statelessLineToken(
      snapshot.setup.messagingChannelId,
      c.lineSecret,
      fetcher,
    );
    c.stateless = true;
  }
  const bot = await call('line', '/v2/bot/info');
  // Long-lived Messaging API token verification returns its issuing channel ID.
  if (!c.stateless) {
    const verified = await fetcher('https://api.line.me/v2/oauth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ access_token: c.lineToken }),
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    if (!verified.ok) throw Error('line_token_verify_failed');
    const tokenInfo = await verified.json();
    if (String(tokenInfo.client_id) !== snapshot.setup.messagingChannelId)
      throw Error('line_channel_mismatch');
  }
  const webhook =
    (await call('line', '/v2/bot/channel/webhook/endpoint', 'GET', undefined, true)) ?? {};
  if (webhook.endpoint && !allowExisting) throw Error('existing_webhook_requires_review');
  const menuId =
    allowExisting && snapshot.design.secretary?.direction !== 'records'
      ? await defaultMenu(call)
      : null;
  const loginId = liffSizes(snapshot.design).length ? snapshot.setup.loginChannelId || '' : '';
  if (allowExisting && liffSizes(snapshot.design).length) {
    if (!loginId || loginId === snapshot.setup.messagingChannelId || !c.loginSecret)
      throw Error('line_login_credentials_required');
    const loginToken = await statelessLineToken(loginId, c.loginSecret, fetcher);
    await apiClient({ ...c, lineToken: loginToken }, fetcher)(
      'line',
      '/liff/v1/apps',
      'GET',
      undefined,
      true,
    );
  }
  return {
    ...t,
    ...(allowExisting
      ? {
          previousWebhook: await webhookFingerprint(webhook.endpoint || ''),
          webhookActive: webhook.active === true,
          previousMenuId: menuId,
          loginId,
        }
      : {}),
    headSha,
    defaultBranch: repo.default_branch,
    botId: bot.userId,
    botName: bot.displayName,
    botBasicId: bot.basicId,
    supabaseName: supa.name,
    githubRepo: repo.full_name,
    appUrl: `https://${t.owner.toLowerCase()}.github.io/${t.repo}/`,
    webhookUrl: `https://${t.ref}.supabase.co/functions/v1/${t.slug}`,
  };
}
// Trusted, deterministic backend. AI-generated files never run on the server.
type FixedReply =
  | string
  | { title: string; body: string; buttons?: { label: string; uri: string }[] };
export function interactiveReply(title: string, content: string): Exclude<FixedReply, string> {
  const buttons: { label: string; uri: string }[] = [];
  const lines = content.split('\n').filter((line) => {
    const button = /^按鈕[：:]\s*([^|]{1,20})\|\s*(https:\/\/\S+)\s*$/.exec(line);
    if (!button || buttons.length >= 3) return true;
    try {
      const u = new URL(button[2]);
      if (!button[1].trim() || u.username || u.password || u.href.length > 1000) return true;
      buttons.push({ label: button[1].trim(), uri: u.href });
      return false;
    } catch {
      return true;
    }
  });
  return {
    title,
    body: lines.join('\n').trim() || '請選擇下方服務。',
    ...(buttons.length ? { buttons } : {}),
  };
}
export type RuntimeDeployment = { endpoint: string; key: string; revoke: () => Promise<void> };
type RuntimeRoute = { label: string; format: 'card' | 'text' };
export function webhookSource(
  prefix: string,
  replies: Record<string, FixedReply>,
  fallback: string,
  runtime?: { endpoint: string; routes: RuntimeRoute[] },
  useStateless = false,
) {
  return `const replies=${JSON.stringify(replies)};const fallback=${JSON.stringify(fallback)};const runtime=${JSON.stringify(runtime ?? null)};
const flex=(title,text,buttons)=>({type:'flex',altText:title.slice(0,80),contents:{type:'bubble',body:{type:'box',layout:'vertical',spacing:'md',contents:[{type:'text',text:title,wrap:true,weight:'bold'},{type:'text',text:text.slice(0,1900),wrap:true}]},...(buttons?.length?{footer:{type:'box',layout:'vertical',contents:buttons.map(({label,uri})=>({type:'button',height:'sm',action:{type:'uri',label,uri}}))}}:{})}});
async function buildReply(event){
 const text=event.message.text;
 const fixed=Object.hasOwn(replies,text)?replies[text]:null;
 if(fixed)return typeof fixed==='string'?{type:'text',text:fixed.slice(0,4900)}:flex(fixed.title,fixed.body,fixed.buttons);
 if(runtime&&event.source?.type==='user'&&text.startsWith('秘書 ')){
  const owner=Deno.env.get('${prefix}_APRICO_RUNTIME_OWNER')||'';
  if(!owner||event.source.userId!==owner)return {type:'text',text:fallback.slice(0,4900)};
  const input=text.slice(3).trim();
  const route=runtime.routes.find(route=>input.startsWith(route.label+' '));
  if(runtime.routes.length&&!route)return {type:'text',text:'請先寫功能名稱，例如：秘書 '+runtime.routes[0].label+' 你的內容'};
  const body=route?input.slice(route.label.length+1).trim():input;
  const key=Deno.env.get('${prefix}_APRICO_RUNTIME_KEY')||'';
  if(key&&body&&body.length<=1500&&typeof event.webhookEventId==='string'){
   try{
    const result=await fetch(runtime.endpoint,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({requestId:event.webhookEventId,text:body,...(route?{task:route.label}:{})}),redirect:'error',signal:AbortSignal.timeout(25000)});
    if(result.status===402)return {type:'text',text:'秘書目前點數不足，請聯絡管理員。'};
    if(result.status===409)return null;
    const data=result.ok?await result.json():null;
    if(typeof data?.reply==='string'&&data.reply)return route?.format==='card'?flex(route.label,data.reply):{type:'text',text:data.reply.slice(0,4900)};
   }catch{}
  }
  return {type:'text',text:'秘書暫時無法處理，請稍後再試。'};
 }
 return {type:'text',text:fallback.slice(0,4900)};
}
let cachedLineToken=null, pendingLineToken;
async function getLineToken(secret){
 if(!${useStateless})return Deno.env.get('${prefix}_LINE_TOKEN')||'';
 if(cachedLineToken?.until>Date.now())return cachedLineToken.value;
 if(!pendingLineToken)pendingLineToken=(async()=>{
  const id=Deno.env.get('${prefix}_LINE_CHANNEL_ID');
  if(!id)throw Error('channel_not_configured');
  const response=await fetch('https://api.line.me/oauth2/v3/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:id,client_secret:secret}),redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw Error('line_token_unavailable');
  const result=await response.json();
  if(typeof result.access_token!=='string'||!result.access_token)throw Error('line_token_unavailable');
  cachedLineToken={value:result.access_token,until:Date.now()+840000};
  return cachedLineToken.value;
 })().finally(()=>{pendingLineToken=undefined;});
 return pendingLineToken;
}
Deno.serve(async req=>{if(req.method!=='POST')return new Response('Method not allowed',{status:405});
if(Number(req.headers.get('content-length')||0)>100000)return new Response('',{status:413});
const reader=req.body?.getReader();if(!reader)return new Response('',{status:400});let size=0;const parts=[];while(true){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>100000){await reader.cancel();return new Response('',{status:413});}parts.push(p.value);}const raw=new Uint8Array(size);let offset=0;for(const p of parts){raw.set(p,offset);offset+=p.length;}
const secret=Deno.env.get('${prefix}_LINE_SECRET')||'';if(!secret)return new Response('',{status:503});
let valid=false;try{const signature=Uint8Array.from(atob(req.headers.get('x-line-signature')||''),c=>c.charCodeAt(0));const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);valid=await crypto.subtle.verify('HMAC',key,signature,raw);}catch{}if(!valid)return new Response('',{status:401});
let data;try{data=JSON.parse(new TextDecoder().decode(raw));}catch{return new Response('',{status:400});}if(!Array.isArray(data.events)||data.events.length>20)return new Response('',{status:400});
async function processEvents(){for(const event of data.events){if(event.deliveryContext?.isRedelivery||event.type!=='message'||event.message?.type!=='text'||typeof event.message.text!=='string'||!event.replyToken)continue;const message=await buildReply(event);if(!message)continue;try{const token=await getLineToken(secret);if(!token)return new Response('',{status:503});const r=await fetch('https://api.line.me/v2/bot/message/reply',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({replyToken:event.replyToken,messages:[message]}),signal:AbortSignal.timeout(8000)});if(!r.ok)return new Response('',{status:502});}catch{return new Response('',{status:502});}}
return new Response('OK');}
if(runtime&&typeof EdgeRuntime!=='undefined'){EdgeRuntime.waitUntil(processEvents());return new Response('OK');}
return processEvents();});`;
}
export async function executeDeployment(
  plan: any,
  snapshot: any,
  artifact: unknown,
  c: DeployCredentials,
  report: (stage: string, extra?: any) => Promise<void>,
  fetcher: typeof fetch = fetch,
  runtime?: RuntimeDeployment,
  menuImage?: string,
) {
  const a = validateArtifact(artifact),
    call = apiClient(c, fetcher),
    t = plan;
  const modern = typeof t.previousWebhook === 'string';
  await report('github_files');
  const headSha = t.headSha === null ? await initializeGithub(call, t) : t.headSha;
  const files = a.files.filter((f) => !['.nojekyll', 'README.md'].includes(f.path));
  files.push({ path: '.nojekyll', content: '' });
  let liff: Awaited<ReturnType<typeof configureLiff>> = {};
  if (modern && liffSizes(snapshot.design).length) {
    await report('line_apps');
    liff = await configureLiff(snapshot.design, t, async () =>
      apiClient(
        { ...c, lineToken: await statelessLineToken(t.loginId, c.loginSecret || '', fetcher) },
        fetcher,
      ),
    );
    const html = a.files.find((f) => f.path === 'index.html')!.content;
    for (const [size, id] of Object.entries(liff))
      files.push({ path: 'liff-' + size + '.html', content: liffPage(html, id) });
  }
  if (c.actionsPages) {
    files.push(
      { path: '.github/workflows/aprico-pages.yml', content: publishPagesWorkflow(t.branch) },
      { path: 'aprico-release.json', content: JSON.stringify({ release: t.branch }) },
    );
    await call('github', `${t.repoPath}/pages`, 'POST', { build_type: 'workflow' });
  }
  const tree = await call('github', `${t.repoPath}/git/trees`, 'POST', {
    tree: files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.content })),
  });
  const commit = await call('github', `${t.repoPath}/git/commits`, 'POST', {
    message: 'Aprico: publish reviewed website draft',
    tree: tree.sha,
    parents: [headSha],
  });
  await call('github', `${t.repoPath}/git/refs`, 'POST', {
    ref: `refs/heads/${t.branch}`,
    sha: c.actionsPages ? headSha : commit.sha,
  });
  if (c.actionsPages)
    await call('github', `${t.repoPath}/git/refs/heads/${t.branch}`, 'PATCH', {
      sha: commit.sha,
      force: false,
    });
  await report('github_pages', { commit_sha: commit.sha });
  if (!c.actionsPages)
    await call('github', `${t.repoPath}/pages`, 'POST', {
      build_type: 'legacy',
      source: { branch: t.branch, path: '/' },
    });
  await report('supabase_secrets');
  await call('supabase', `/v1/projects/${t.ref}/secrets`, 'POST', [
    { name: `${t.prefix}_LINE_SECRET`, value: c.lineSecret },
    c.stateless
      ? { name: `${t.prefix}_LINE_CHANNEL_ID`, value: snapshot.setup.messagingChannelId }
      : { name: `${t.prefix}_LINE_TOKEN`, value: c.lineToken },
    ...(runtime
      ? [
          { name: `${t.prefix}_APRICO_RUNTIME_KEY`, value: runtime.key },
          { name: `${t.prefix}_APRICO_RUNTIME_OWNER`, value: snapshot.setup.runtimeOwnerId },
        ]
      : []),
  ]);
  await report('supabase_function');
  const replies = Object.fromEntries(
    snapshot.design.cells
      .slice(0, snapshot.design.grid)
      .filter((cell: any) => cell.action === 'message' && cell.label && cell.content)
      .map((cell: any) => [
        cell.label,
        cell.preset === 'interactive'
          ? interactiveReply(cell.label, cell.content)
          : cell.responseFormat === 'card'
            ? { title: cell.label, body: cell.content }
            : cell.content,
      ]),
  );
  const routes: RuntimeRoute[] = (snapshot.design.secretary?.routes ?? []).map((r: any) => ({
    label: recordPresets.find((p) => p.id === r.id)!.label,
    format: r.format,
  }));
  const form = new FormData();
  form.append(
    'metadata',
    JSON.stringify({ name: t.slug, entrypoint_path: 'index.ts', verify_jwt: false }),
  );
  form.append(
    'file',
    new Blob(
      [
        webhookSource(
          t.prefix,
          replies,
          snapshot.setup.failure || '請聯絡服務人員。',
          runtime ? { endpoint: runtime.endpoint, routes } : undefined,
          c.stateless,
        ),
      ],
      { type: 'application/typescript' },
    ),
    'index.ts',
  );
  await call('supabase', `/v1/projects/${t.ref}/functions/deploy?slug=${t.slug}`, 'POST', form);
  await report('webhook_test');
  // LINE test sends an authentic signature, detecting a Channel Secret from the wrong OA.
  const tested = await call('line', '/v2/bot/channel/webhook/test', 'POST', {
    endpoint: t.webhookUrl,
  });
  if (tested.success !== true) throw Error('webhook_signature_or_readiness_failed');
  await report('webhook_connect');
  // Recheck before replacing an endpoint; never overwrite a service that appeared meanwhile.
  const current =
    (await call('line', '/v2/bot/channel/webhook/endpoint', 'GET', undefined, true)) ?? {};
  if ((await webhookFingerprint(current.endpoint || '')) !== (t.previousWebhook || ''))
    throw Error('existing_webhook_requires_review');
  let menuId: string | null = null;
  if (modern && snapshot.design.secretary?.direction !== 'records') {
    await report('line_menu');
    menuId = await prepareMenu(snapshot.design, t, liff, menuImage, call, c.lineToken, fetcher);
  }
  const latest = modern
    ? ((await call('line', '/v2/bot/channel/webhook/endpoint', 'GET', undefined, true)) ?? {})
    : current;
  if ((await webhookFingerprint(latest.endpoint || '')) !== (t.previousWebhook || ''))
    throw Error('existing_webhook_requires_review');
  if (latest.endpoint !== t.webhookUrl)
    await call('line', '/v2/bot/channel/webhook/endpoint', 'PUT', { endpoint: t.webhookUrl });
  const actual = modern ? await call('line', '/v2/bot/channel/webhook/endpoint') : null;
  if (modern && actual.endpoint !== t.webhookUrl) throw Error('webhook_url_unconfirmed');
  if (menuId) {
    if ((await defaultMenu(call)) !== t.previousMenuId)
      throw Error('existing_menu_requires_review');
    await call('line', '/v2/bot/user/all/richmenu/' + menuId, 'POST');
    if ((await defaultMenu(call)) !== menuId) throw Error('line_menu_unconfirmed');
  }
  await report('awaiting_acceptance', {
    app_url: t.appUrl,
    webhook_url: t.webhookUrl,
    commit_sha: commit.sha,
    system_checks: {
      webhookSignature: true,
      sourceCommitted: true,
      pagesRequested: true,
      ...(modern ? { webhookActive: actual.active === true, menuId, liff } : {}),
      ...(c.actionsPages ? { pagesMode: 'actions' } : {}),
    },
  });
}
