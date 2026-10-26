# Aprico LINE OA KIT

兩個獨立手機頁面，從 LINE 圖文選單直接開啟。

- `design.html`：手機示意結合設計。選 4／6／8 格、八種配色，點選格子以彈窗設定。可切換體驗模式。
- `build.html`：會員專案與建置中心。自動建置、教學與收費功能尚未開放。
- `index.html`：直接轉到設計頁，沒有額外主頁。

## 開發

Node.js 22.13+，執行 `npm ci`、`npm run dev`。`npm run build` 輸出到 dist。GitHub Pages 發布 gh-pages 分支。

## 資料與授權

登入使用 LIFF Full `2012197506-Vmb4O5iT`。會員資料由 Supabase 的 `line-oa-kit-studio` API 驗證 LINE ID token 後保存；前端只傳送一般需求，不接收管理金鑰。後端另行部署，不屬於 GitHub Pages。

目前分頁隔離只是入口區分，收費功能上線時仍須在伺服器驗證權益。一般專案內容由會員主動保存；離開編輯頁前會提示或先保存。對不同會員的隔離與真實手機登入仍須實測。

原有 Sites 網站保留，既有 Google 帳號專案不自動遷移。
