import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import {validLineSignature,trialLine} from '../_shared/trial-line.ts';
import {exitTrial} from '../_shared/trial-handler.ts';
import {routeAssistantEvent} from '../_shared/assistant-trial.ts';
import {broadcastGateway} from '../_shared/broadcast-gateway.ts';
// 小A — Aprico AI 助教(LINE 群組問答機器人)— Supabase Edge Function (Deno)
//
// 流程:客戶在群組打「小A ...」→ 本 webhook → 讀知識庫+對話紀錄 → Claude → 回覆群組
//
// 觸發規則:
//   1. 「小A <問題>」— 寬鬆比對,小A / 小a / 小 A / 全形Ａ 都算,後面可接空格或逗號
//   2. 「群組id」→ 回覆目前群組的 groupId(設定 ASSIST_TARGET_GROUP_ID 時用得到)
//   其他訊息一律不回,避免洗版。
//
// ⚠️ secrets 命名:Supabase secrets 是整個專案共用的,
//    LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN 已被「翻譯機器人」那個 channel 佔用。
//    本函式一律用 ASSIST_ 前綴,沿用同名會把翻譯機器人的驗簽打壞。
//
// 需要的 secrets:
//   ASSIST_LINE_CHANNEL_SECRET        Aprico AI助教 channel 的 Channel secret(驗簽用)
//   ASSIST_LINE_CHANNEL_ACCESS_TOKEN  同 channel 的 long-lived access token(回覆用)
//   ASSIST_TARGET_GROUP_ID            (選填)只服務這個群組;留空 = 服務所有來源
//   ANTHROPIC_API_KEY                 Claude API key(專案既有,共用)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  由 Supabase 自動注入
//
// 部署:supabase functions deploy line-assistant --no-verify-jwt
//      (LINE 不會帶 Supabase JWT,少了這個旗標所有 webhook 都會被擋掉)

const LINE_CHANNEL_SECRET = Deno.env.get("ASSIST_LINE_CHANNEL_SECRET") ?? "";
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("ASSIST_LINE_CHANNEL_ACCESS_TOKEN") ?? "";
const TARGET_GROUP_ID = Deno.env.get("ASSIST_TARGET_GROUP_ID") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Sonnet 5:品質與速度的平衡點。嫌慢可改 "claude-haiku-4-5-20251001"。
const MODEL = "claude-sonnet-5";
// 「小A」開頭,大小寫與全形都收,後面允許空格/標點
const TRIGGER_RE = /^小\s*[AaＡａ][\s,，、:：!！?？]*/;
const KB_TABLE = "aistudio_kb";
const KB_KEY = "course_info";
const LOG_TABLE = "aistudio_bot_messages";
const HISTORY_LIMIT = 8;

const textEncoder = new TextEncoder();

// 資料庫讀不到時的退路。刻意不含任何金額 —— 讀不到知識庫時更不該憑印象報價。
const KB_FALLBACK = `(課程知識庫暫時讀取不到,只能提供最基本資訊)
Aprico AI Studio 有三個課程:AI 變現課(8 堂,從零到能變現)、
AI 麻瓜課(公益入門講座)、技能蒸餾術(線上數位課)。
價格、時間、報名細節請客戶加 LINE 由專員說明,或稍候由 PT 回覆。
這個狀態下絕對不要說出任何金額。`;

// ---- LINE 簽章驗證 (HMAC-SHA256, base64) ----
async function verifySignature(rawBody: string, signature: string): Promise<boolean> {
  if (!LINE_CHANNEL_SECRET || !signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(LINE_CHANNEL_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, textEncoder.encode(rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  // 長度不同直接 false,避免 timing-unsafe 比對拋錯
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

// ---- Supabase REST 共用 headers ----
function sbHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

// ---- 讀課程知識庫 ----
async function getKnowledge(): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return KB_FALLBACK;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${KB_TABLE}?key=eq.${KB_KEY}&select=content`,
      { headers: sbHeaders() },
    );
    if (!res.ok) return KB_FALLBACK;
    const rows = await res.json();
    const content = rows?.[0]?.content;
    return typeof content === "string" && content.trim() ? content : KB_FALLBACK;
  } catch (err) {
    console.error("getKnowledge error:", err);
    return KB_FALLBACK;
  }
}

type Turn = { role: "user" | "assistant"; content: string };

// ---- 讀最近幾輪對話 ----
async function getHistory(convKey: string): Promise<Turn[]> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${LOG_TABLE}` +
        `?group_id=eq.${encodeURIComponent(convKey)}` +
        `&select=role,content&order=created_at.desc&limit=${HISTORY_LIMIT}`,
      { headers: sbHeaders() },
    );
    if (!res.ok) return [];
    const rows = await res.json();
    // 查詢是新到舊,反轉回時間順序
    return Array.isArray(rows) ? rows.reverse() as Turn[] : [];
  } catch (err) {
    console.error("getHistory error:", err);
    return [];
  }
}

// ---- 寫入對話紀錄(失敗不影響回覆)----
async function saveTurns(convKey: string, turns: Turn[]): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${LOG_TABLE}`, {
      method: "POST",
      headers: sbHeaders({ "Content-Type": "application/json", Prefer: "return=minimal" }),
      body: JSON.stringify(turns.map((t) => ({ group_id: convKey, role: t.role, content: t.content }))),
    });
  } catch (err) {
    console.error("saveTurns error:", err);
  }
}

// ---- 整理成 Anthropic 能接受的 messages ----
// 群組是多人同時講話,紀錄可能出現連續兩則 user(或開頭就是 assistant),
// Anthropic 要求 user/assistant 交替且由 user 起頭,這裡先正規化。
function normalizeTurns(turns: Turn[]): Turn[] {
  const out: Turn[] = [];
  for (const t of turns) {
    if (!t?.content?.trim()) continue;
    if (out.length === 0 && t.role !== "user") continue; // 丟掉開頭的 assistant
    const last = out[out.length - 1];
    if (last && last.role === t.role) last.content += `\n${t.content}`;
    else out.push({ role: t.role, content: t.content });
  }
  return out;
}

// ---- 呼叫 Claude ----
async function askClaude(question: string, history: Turn[], knowledge: string): Promise<string> {
  const system =
    "你是「小A」,Aprico AI Studio 的 AI 助教,正在一個客戶的 LINE 群組裡回答問題。\n\n" +
    "=== 課程知識庫(以下是課程、價格、報名資訊的唯一依據)===\n" +
    knowledge +
    "\n=== 知識庫結束 ===\n\n" +
    "回答規則:\n" +
    "1. 講到課程內容、價格、時間、報名方式,只能依據上面的知識庫。" +
    "知識庫沒寫的就是不知道,絕對不可以自己推測、加碼優惠或做任何承諾。\n" +
    "2. 知識庫沒有涵蓋的具體問題(例如退費、分期、發票報帳、團報折扣、個別帳務、" +
    "客製報價、確切開課日期),回答「這題我幫你轉給 PT,稍等一下 🙌」,不要編答案。\n" +
    "3. 一般 AI 知識與概念(例如什麼是 RAG、Prompt 怎麼寫、某個 AI 工具能做什麼)" +
    "可以自由發揮,好好回答,這也是課程的價值展示。\n" +
    "4. 這是 LINE 群組:回答控制在 300 字以内,用純文字,不要用 Markdown 語法" +
    "(不要 **粗體**、# 標題、- 清單符號),需要條列就用「1. 」或換行。\n" +
    "5. 語氣親切、專業、不推銷。有人想報名時直接給報名方式,不要一直催。\n" +
    "6. AI 變現課的價格是機密:絕對不要說出任何金額,也不要說「大概」多少、" +
    "不要評論貴不貴或劃不劃算。客戶追問或說「別人跟我說多少」,一樣只導向專員。\n" +
    "7. 用繁體中文回答。";

  const messages = normalizeTurns([...history, { role: "user", content: question }]);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1024, system, messages }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Anthropic API error:", res.status, errText);
    throw new Error(`Anthropic ${res.status}`);
  }
  const data = await res.json();
  const block = (data.content ?? []).find((b: { type: string }) => b.type === "text");
  return (block?.text ?? "").trim() || "(小A 暫時想不出答案,請稍後再問一次)";
}

// ---- 回覆 LINE ----
async function replyMessage(replyToken: string, text: string): Promise<void> {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      // LINE 單則訊息上限 5000 字
      messages: [{ type: "text", text: text.slice(0, 5000) }],
    }),
  });
}

// ---- 處理單一訊息事件 ----
async function handleEvent(event: any): Promise<void> {
  if (event.type !== "message" || event.message?.type !== "text") return;

  const replyToken: string = event.replyToken;
  const groupId: string | undefined = event.source?.groupId ?? event.source?.roomId;
  const raw: string = (event.message.text ?? "").trim();

  // 群組 ID 查詢(任何來源都可用,方便設定 ASSIST_TARGET_GROUP_ID)
  if (raw === "群組id" || raw.toLowerCase() === "groupid") {
    await replyMessage(replyToken, `groupId:\n${groupId ?? "(此訊息不是來自群組)"}`);
    return;
  }

  // 只服務指定群組(ASSIST_TARGET_GROUP_ID 留空 = 不限制)
  if (TARGET_GROUP_ID && groupId !== TARGET_GROUP_ID) return;

  const m = raw.match(TRIGGER_RE);
  if (!m) return; // 沒有觸發詞就完全不回,避免洗版

  const question = raw.slice(m[0].length).trim();
  if (!question) {
    await replyMessage(
      replyToken,
      "我是小A 🙋 Aprico 的 AI 助教。\n" +
        "用法:小A 後面直接接問題,例如\n" +
        "「小A 課程有什麼内容」\n" +
        "「小A 麻瓜課什麼時候上」\n" +
        "「小A 什麼是 Prompt 工程」",
    );
    return;
  }

  // 1:1 聊天沒有 groupId,改用 userId 當對話鍵,才不會所有人共用同一段記憶
  const convKey = groupId ?? event.source?.userId ?? "unknown";

  try {
    const [knowledge, history] = await Promise.all([getKnowledge(), getHistory(convKey)]);
    const answer = await askClaude(question, history, knowledge);
    await replyMessage(replyToken, answer);
    await saveTurns(convKey, [
      { role: "user", content: question },
      { role: "assistant", content: answer },
    ]);
  } catch (err) {
    console.error("handleEvent error:", err);
    await replyMessage(replyToken, "⚠️ 小A 暫時連不上,請稍後再試,或直接詢問 PT 🙏");
  }
}

// Supabase 執行環境注入的背景工作 API
declare const EdgeRuntime: { waitUntil?: (p: Promise<unknown>) => void } | undefined;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    // 健康檢查 / 用瀏覽器直接打開時回 200,方便確認函式活著。
    // 注意:LINE Console 的 Verify 按鈕是送「帶簽章的 POST」,會走下面的驗簽,
    // 所以 ASSIST_LINE_CHANNEL_SECRET 沒設對之前,Verify 一定會失敗(401)。
    return Response.json({ok:true,trialChatReady:Boolean(Deno.env.get("LINE_OA_KIT_MESSAGING_CHANNEL_SECRET")&&Deno.env.get("LINE_OA_KIT_MESSAGING_ACCESS_TOKEN"))});
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature") ?? "";

  const assistantAuthenticated=await verifySignature(rawBody,signature);
  const trialAuthenticated=await validLineSignature(new TextEncoder().encode(rawBody),signature,Deno.env.get("LINE_OA_KIT_MESSAGING_CHANNEL_SECRET")||"");
  if (!assistantAuthenticated&&!trialAuthenticated) {
    return new Response("invalid signature", { status: 401 });
  }

  let payload: { events?: any[] };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("bad request", { status: 400 });
  }

  // Claude 要跑好幾秒,但 LINE 期望 webhook 一秒内回應(逾時會重送 → 重複回覆)。
  // 所以先把處理丟到背景、立刻回 200;replyToken 有效期約一分鐘,來得及。
  if(!Array.isArray(payload.events)||payload.events.length>100)return new Response("bad events",{status:400});
  const trialDb=trialAuthenticated?createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}):null;
  const trialToken=Deno.env.get("LINE_OA_KIT_MESSAGING_ACCESS_TOKEN")||"";
  const work = Promise.all(
    (payload.events ?? []).map(async(e) => {
      if(await broadcastGateway(e,{authenticated:trialAuthenticated,owner:Deno.env.get('LINE_OA_KIT_OWNER_LINE_USER_ID')||'',db:trialDb,reply:(token,messages)=>trialLine(trialToken)("/v2/bot/message/reply","POST",{replyToken:token,messages})}))return;
      return routeAssistantEvent(e,{trialAuthenticated,assistantAuthenticated,db:trialDb,reply:(token,messages)=>trialLine(trialToken)("/v2/bot/message/reply","POST",{replyToken:token,messages}),exit:(subject)=>exitTrial(trialDb,subject,trialToken),assistant:handleEvent});
    }).map(p=>p.catch(() => console.error("LINE event routing failed"))),
  );
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(work);
  else await work; // 本機 serve 沒有 EdgeRuntime 時的退路

  return new Response("ok", { status: 200 });
});

