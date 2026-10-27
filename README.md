# Aprico LINE OA KIT

兩個獨立手機頁面，從 LINE 圖文選單直接開啟。

- `design.html`：手機示意結合設計。選 4／6／8 格、八種配色，點選格子以彈窗設定。可切換體驗模式。
- `build.html`：會員專案、專員密碼開通、四步建置設定、AI 網站草稿與建置紀錄。正式自動部署與 LINE Pay 尚未開放。
- `index.html`：直接轉到設計頁，沒有額外主頁。

## 開發

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

依序部署 `supabase/build-access.sql`、`supabase/build-jobs.sql`（遠端已套用，不要重複執行），再部署 `line-oa-kit-studio` 與其相對依賴。函式自行驗證 LINE ID token，故 gateway verify_jwt=false。所有設計、權益、工作、預算表均 RLS deny-all 瀏覽器角色；只由服務端驗證本人後存取，不能加寬鬆 policy 解決權限問題。

## 目前 AI 建置範圍與限制

1. 已開通的本人專案，在保存設定並通過檢查後，勾選同意即可產生靜態網站草稿；同一設計／設定版本只產生一次。
2. 工作與結果保存在 Supabase，可離開頁面後回來查詢。背景工作使用 `EdgeRuntime.waitUntil`，仍受平台執行時間限制；超過五分鐘的工作標示中斷，不自動重新發出付費請求。
3. 使用固定模型 gpt-4.1-mini-2025-04-14、輸出上限 6000 tokens、需求上限 24000 字元、store=false。生成僅允許 index.html、app.js、style.css、README.md、.nojekyll；不執行任何生成程式或部署腳本。
4. 目前是試行保護：平台累計預算 US$0.10，每工作先保留 US$0.05；成功按 token 計算，失敗保守計入完整保留額。中斷工作保留額不自動釋放，須管理者核對上游用量。這不是售價、不是客戶點數，也不會定期自動重置。上調前需先核准費用並核對定價。
5. GitHub／Supabase 網址不代表授權完成。客戶端 OAuth 授權、自動部署、資料庫／Webhook／LIFF 串接與上線驗收尚未實作，不可宣稱草稿已上線。

官方參考：[Supabase 背景工作](https://supabase.com/docs/guides/functions/background-tasks)、[OpenAI 結構化輸出](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)、[模型定價](https://developers.openai.com/api/docs/models/gpt-4.1-mini)。
