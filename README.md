# Aprico LINE OA KIT

幫客戶建置 LINE 官方帳號（OA）與 AI 秘書的平台。前端是多頁的手機網頁，從 Aprico 官方 LINE 的圖文選單以 LIFF 開啟；後端是 Supabase Edge Functions。

> 各功能當時的設計、驗證與限制，原文保存在 [`docs/HISTORY.md`](docs/HISTORY.md)。那份是歷程紀錄，可能已過時；現況以程式碼為準。

## 頁面

| 檔案 | 用途 |
| --- | --- |
| `design.html` | 選單設計：格數、配色、印花、每格動作；可在 LINE 個人試用 |
| `build.html` | 建置中心：需求設定、連接 GitHub／LINE／Supabase、AI 產生網站、自動部署 |
| `intro.html` | 新手介紹卡片 |
| `trial.html` | 個人試用的展示頁 |
| `learning.html` | LINE AI 學習課程 |
| `games.html` | 小遊戲專區（遊戲本體在 `public/games/`） |
| `admin.html` | 主要擁有者的發送中心 |
| `index.html` | 轉到設計頁 |

## 開發

需要 Node.js 22.13 以上。

```bash
npm ci
npm run dev      # 本機開發
npm test         # 單元測試，不呼叫付費 API
npm run build    # 輸出到 dist/
npx prettier@3.3.3 --check .   # 排版檢查（設定見 .prettierrc.json）
```

推到 `main` 後，GitHub Actions（`.github/workflows/pages.yml`）會跑測試、建置並部署 GitHub Pages。

## 目錄

| 路徑 | 內容 |
| --- | --- |
| `src/` | 前端（React + Vite）。`model.ts` 設計資料模型、`journey.ts` 建置關卡、`design-catalog.ts` 選單與秘書模板 |
| `supabase/functions/` | Edge Functions。共用邏輯在 `_shared/` |
| `supabase/*.sql`、`supabase/migrations/` | 資料表與 RPC。所有表都開 RLS，只有 service_role 能存取 |
| `tests/` | Node 內建測試；`*-db.sql` 是會回滾的資料庫測試 |
| `public/` | 教學截圖、秘書圖、課程圖、小遊戲 |
| `scripts/` | 產生官方選單配圖等工具 |
| `docs/` | 設定與設計文件 |

## Edge Functions

| 名稱 | 用途 |
| --- | --- |
| `line-oa-kit-studio` | 主要 API：設計、試用、建置、部署、學習、群發、付款。自行驗證 LINE ID token |
| `line-oa-kit-github` | GitHub App 的 OAuth 與 repository 綁定 |
| `line-assistant` | Aprico 官方 LINE 的 Webhook（含對話式設計） |
| `line-oa-kit-runtime-ai` | 客戶 OA 上線後呼叫的 AI 服務 |
| `line-oa-kit-intro` | 新手介紹訊息的排程發送 |
| `line-oa-kit-trial-webhook` | 個人試用的 Webhook |
| `line-oa-kit-onboarding-probe` | 新手流程的檢查 |

Edge Functions **不會**隨 GitHub Pages 部署，需要另外部署到 Supabase。

## 安全原則

- 金鑰只放在 Supabase Edge Secrets，不進 GitHub、不進前端、不貼到聊天。
- 前端不直接讀寫資料表；身分一律由後端向 LINE 驗證 ID token 後決定。
- 付費 AI 與對外發送（群發、部署）都要使用者明確同意，失敗不自動重試。

## 文件

| 文件 | 內容 |
| --- | --- |
| [`docs/HISTORY.md`](docs/HISTORY.md) | 開發歷程（舊 README 原文） |
| [`docs/QUEST-JOURNEY.md`](docs/QUEST-JOURNEY.md) | 建置中心的關卡設計 |
| [`docs/GITHUB-APP-SETUP.md`](docs/GITHUB-APP-SETUP.md)、[`GITHUB-APP-IMPLEMENTATION.md`](docs/GITHUB-APP-IMPLEMENTATION.md) | GitHub App 設定與實作紀錄 |
| [`docs/activation.md`](docs/activation.md) | 專員密碼開通與平台 Secrets |
| [`docs/LINEPAY-SETUP.md`](docs/LINEPAY-SETUP.md) | LINE Pay 設定 |
| [`docs/ONBOARDING-CAMPAIGN.md`](docs/ONBOARDING-CAMPAIGN.md) | 新手介紹活動 |
| [`docs/REAL-TUTORIALS.md`](docs/REAL-TUTORIALS.md) | 教學截圖的來源與規則 |
| [`docs/SECRETARY-ART.md`](docs/SECRETARY-ART.md) | 秘書角色圖 |
| [`docs/SALES-POLICY-DRAFT.md`](docs/SALES-POLICY-DRAFT.md) | 銷售政策草稿 |
