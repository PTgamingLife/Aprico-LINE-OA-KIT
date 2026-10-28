# Aprico LINE OA KIT

兩個獨立手機頁面，從 LINE 圖文選單直接開啟。

- `design.html`：手機示意結合設計。選 4／6／8 格、八種配色，點選格子以彈窗設定。可切換體驗模式。
- `build.html`：會員專案、專員密碼開通、四步建置設定、AI 網站草稿、六步圖解與一次性授權自動部署。LINE Pay 尚未開放。
- `index.html`：直接轉到設計頁，沒有額外主頁。

## 開發

設計頁配色下方支援八款印花：亞麻織紋、細緻圓點、斜線光影、法式方格、復古拱門、植物剪影、細碎磨石、柔和波紋；另有純色與自訂圖片。選擇會保存到本人設計，舊版設計預設純色。網頁選單與 LINE 個人試用共用同一組印花。

自訂圖片支援 JPG／PNG／WebP（原圖 12 MB），瀏覽器先重新編碼成最長邊 960px、180000 字元內的 JPEG，移除原圖中繼資料，保存在既有受保護的設計 JSON；不新增公開 Storage bucket。LINE 試用則輸出 1200×810 PNG／JPEG，伺服器檢查格式、尺寸及 900KB 上限，依實際 MIME 上傳。圖片置中裁切、配色半透明疊加並加文字底色。

建置時不把背景圖片資料送到 AI；只傳送有無圖片的標示，最後由平台把選定的圖片或印花附到靜態 CSS。正式部署會隨公開網站發布該背景，仍須使用者在既有部署確認步驟同意；請使用有權使用且可公開的圖片。HEIC／SVG 不接受。此次功能不需要新 Secret 或 schema 變更。

Node.js 22.13+，執行 `npm ci`、`npm run dev`。`npm test` 執行不扣費的測試。`npm run build` 輸出到 dist。推送 main 後由 GitHub Actions 測試並部署 Pages artifact，不使用 gh-pages 分支。

## 資料與授權

登入使用 LIFF Full `2012197506-Vmb4O5iT`。會員資料由 Supabase 的 `line-oa-kit-studio` API 驗證 LINE ID token 後保存；前端只傳送一般需求，不接收管理金鑰。後端另行部署，不屬於 GitHub Pages。

專案開通權益在伺服器驗證。一般專案內容由會員主動保存；離開編輯頁前會提示或先保存。真實手機登入、密碼開通至生成的端對端流程仍須實測。

原有 Sites 網站保留，既有 Google 帳號專案不自動遷移。

## 平台管理者設定

只在 heart-cards 的 Supabase Edge Secrets 設定以下值，不要提交到 GitHub、表單或聊天：

- `LINE_OA_KIT_BUILD_PASSWORD`：目前共用的專員開通密碼。每個專案輸入成功後在資料庫保存開通權益；輪替密碼不會撤銷已開通專案。每個 LINE 使用者最多嘗試五次／15 分鐘。這不是付款驗證，正式收款仍需訂單與回呼機制。
- `LINE_OA_KIT_CONTACT_URL`：可覆寫專員公開 LINE 連結（line.me、www.line.me 或 lin.ee 的 HTTPS 網址）；未設定時使用管理者指定的公開連結 https://line.me/ti/p/ZC-w2BuPoi ，此網址不是金鑰。
- `LINE_OA_KIT_BUILD_OPENAI_API_KEY`：平台網站草稿產生用 OpenAI 金鑰，不是客戶 OA 的營運 AI 金鑰。

依序部署 `supabase/build-access.sql`、`supabase/build-jobs.sql`、`supabase/deployments.sql`（遠端已套用，不要重複執行），再部署 `line-oa-kit-studio` 與其相對依賴。函式自行驗證 LINE ID token，故 gateway verify_jwt=false。所有設計、權益、工作、預算、部署表均 RLS deny-all 瀏覽器角色；只由服務端驗證本人後存取，不能加寬鬆 policy 解決權限問題。

## 目前 AI 建置範圍與限制

1. 已開通的本人專案，在保存設定並通過檢查後，勾選同意即可產生靜態網站草稿；同一設計／設定版本只產生一次。
2. 工作與結果保存在 Supabase，可離開頁面後回來查詢。背景工作使用 `EdgeRuntime.waitUntil`，仍受平台執行時間限制；超過五分鐘的工作標示中斷，不自動重新發出付費請求。
3. 使用固定模型 gpt-4.1-mini-2025-04-14、輸出上限 6000 tokens、需求上限 24000 字元、store=false。生成僅允許 index.html、app.js、style.css、README.md、.nojekyll；不執行任何生成程式或部署腳本。
4. 目前是試行保護：平台累計預算 US$0.10，每工作先保留 US$0.05；成功按 token 計算，失敗保守計入完整保留額。中斷工作保留額不自動釋放，須管理者核對上游用量。這不是售價、不是客戶點數，也不會定期自動重置。上調前需先核准費用並核對定價。
5. GitHub／Supabase 網址不代表授權完成。網站草稿完成後，使用下方一次性 Token 部署教學。OAuth 一鍵連接、營運 AI、自訂資料庫、健康檢測後端及 LIFF／圖文選單自動配置尚未實作，不可宣稱所有功能已上線。

## 一次性授權自動部署（第一版）

### 新手帳號與網址教學

建置設定第 3 步改為六張小教學：GitHub 註冊、建立 Repository、從網址列複製 Repository URL、Supabase 註冊、建立專案、從 Connect 取得 Project URL。每張包含可對照欄位／按鈕的手機介面位置圖（明示不是實際截圖）、紅框箭頭、三項短指示、官方入口與來源。Repository 建立頁另有 GitHub 官方截圖。不是只列出流程名稱。

`githubRepo` 與 `supabaseUrl` 輸入框放在各自的「網址教學」頁。捷徑切換不清空上層建置設定，兩個網址格式正確後才可按「保存網址並繼續」。此按鈕使用原本的本人專案保存與版本機制，不建立新的資料副本。誤貼帳號首頁、GitHub Pages、.git、Supabase 後台／連線字串／Key 時會有明確提示。已有帳號可跳過註冊／建立步驟，不強迫重建。

核對日期 2026-10-27；官方流程：[GitHub 註冊](https://docs.github.com/en/account-and-profile/how-tos/account-management/creating-an-account-on-github)、[建立 Repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/quickstart-for-repositories)、[Supabase 註冊](https://supabase.com/dashboard/sign-up)、[建立 Supabase 專案](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)、[Connect 取得 URL](https://supabase.com/docs/guides/getting-started/api-keys)。帳號驗證、條款、付款／升級仍由使用者自行決定與操作，教學不收取其帳號密碼或資料庫密碼。

26 項測試通過；本機手機 390px 已驗證六頁、官方圖片載入、錯誤網址提示、切換保留兩個網址與保存回呼。本次沒有更動 Supabase schema／Edge 金鑰，也沒有呼叫付費 AI。

手機版六頁教學：GitHub → Supabase → LINE Secret／Token → 只讀核對 → 同意公開部署 → 網址與實機驗收。每頁都有本站繪製的手機示意圖、紅框箭頭；LINE／Supabase 步驟另提供官方範例截圖與來源，清楚標示不是手機實機截圖。最後一頁亦有圖片。外部圖片失效時保留本地 SVG 與文字，不假造平台截圖。

必要授權：

- GitHub：自己的公開專用 repository，建立時勾選 README，尚無 Pages。Fine-grained Token 只選此 repository，Contents／Pages／Administration 為 Read and write，期限最短可用。不要傳到聊天。
- Supabase：自己的專案，限專案短效 Access Token，Project Settings Read、Edge Functions Read-write、Edge Function Secrets Read-write。不是 anon／service_role。不要使用跨所有專案的 Legacy Token。
- LINE：同 Messaging API Channel 的長效 Access Token、32 位 Channel Secret，Channel ID 已在建置設定填妥。不能使用平台 Aprico 的金鑰替客戶部署。

只讀檢查會取得 repo 權限、Pages／分支狀態、Supabase 專案與函式、LINE OA 身分與 Token 所屬 Channel。使用者確認 OA／專案／公開發布後，會再讀取檢查一次，再建立本人部署工作。四項憑證只存在請求與背景工作記憶體，不存平台資料表、網址或 GitHub，送出部署後清空欄位；LINE Secret／Token 會寫入使用者指定的 Supabase Edge Secrets，名稱前綴取專案英文／數字與平台專案 UUID，避免衝突。

自動化範圍：

1. 將已檢查的 AI 靜態網站寫入 `aprico-<project UUID>` 獨立分支，不更改預設分支，不建立或執行任意 Actions 工作流程。
2. 申請 branch-based GitHub Pages；申請成功不代表已建置成功，須等待並實際開啟網址。
3. 將 LINE 憑證放入使用者自己的 Edge Secrets，部署固定、經測試的簽章驗證後端（不是 AI 生成的伺服器程式）。不執行自訂 SQL，也不建立資料庫功能。
4. LINE 簽章與連線測試成功後才設定 Webhook URL；Use webhook 開關、圖文選單與 LIFF 仍依教學人工完成。訊息型格子的「格子名稱」作為觸發文字，「內容」作為固定回覆；未命中使用失敗處理文字。
5. 分開保存系統檢查與使用者回報，狀態停在待驗收，不冒稱已上線。

安全限制：遇到已有 Pages、同名分支／函式、既有 Webhook 就停止，不強制覆蓋。不支援更新已上線網站或舊服務遷移；目前只有首次新專案自動部署。失敗或中斷保留階段與錯誤代碼，可能已產生部分外部資源；不自動刪除、不重試、不自動撤銷客戶 Token，請核對紀錄再由專員處理。背景工作受 Edge 時限影響，超過五分鐘標記中斷，需核查實際外部狀態。

驗證：22 項本機測試（含 HMAC 真實簽章檢查、模擬 GitHub／Supabase／LINE API），SQL 回滾測試（本人、同工作去重、版本衝突）與手機 390px 六頁操作已檢查。尚未使用真實客戶 Token 完成整套外部部署；第一次真實建置仍需操作者在自己帳號實測。這一輪未呼叫付費 AI。

官方參考：[Supabase 背景工作](https://supabase.com/docs/guides/functions/background-tasks)、[OpenAI 結構化輸出](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)、[模型定價](https://developers.openai.com/api/docs/models/gpt-4.1-mini)。
# 個人 LINE 試用（2026-10-28）

設計頁的「保存並在 LINE 試用」先保存會員專案，再產生 1200×810 莫蘭迪選單 PNG，使用 Messaging API 綁定到伺服器驗證過的本人 LINE ID。4／6／8 格均可；只改此人在 Aprico 聊天室的個人選單，不改全體預設選單、不改客戶正式 OA。

每格以 Full LIFF 開啟本人專用展示：固定訊息聊天氣泡、外部 HTTPS 連結確認、App 表單送出示意、刮刮樂揭曉展示、健康檢測流程展示。半頁是 Full LIFF 裡的樣式示意，不冒稱已設定 Tall／Compact。AI／健康分析／真實發獎／任意自訂後端不在免費試用範圍。聊天室上方名稱仍為 Aprico。

底部「返回建置中心」會解除本人個人選單，恢復原本預設選單。頁面也提供結束試用按鈕。每人新設計最多每分鐘更新一次、平台試行每小時最多建立 30 份；相同設計重用既有選單。新選單成功後只清理資料庫記錄且名稱完全吻合的舊試用選單。

平台 Webhook 沿用使用者確認的 `line-assistant`，不切換 endpoint。原小A群組助教的訊息處理保留；只有經平台簽章驗證、啟用試用的一對一使用者走個人回覆，並阻止進入付費 AI。訊息格以 postback 直接回覆，App 格維持 LIFF 展示。輸入「結束試用」可恢復原選單。非試用訊息仍須通過原助教簽章才交給原流程。

追加執行 `supabase/trial-chat.sql` 後，選單快取區分 URI 與 chat-v1 模式，避免重用舊展示頁選單。已啟用 URI 試用的使用者，須再次按「保存並在 LINE 試用」升級。只有固定的 line-assistant endpoint、已開啟 webhook 且部署健康檢查就緒時，才建立聊天室 postback；否則保留 URI 展示。沒有廣播、push 或本次新增的付費 AI 呼叫。

資料表與 RPC 見 `supabase/trials.sql`，RLS／權限限制為 service_role only；前端不得提供 owner ID。試用設定由已驗證 LINE ID token 限本人讀取，沒有公開設計查詢入口。新增模型、簽章、既有 Webhook 保護、HTTPS 及回覆版本等測試；本機假帳號測試不代表真實 LINE 手機實測完成。

