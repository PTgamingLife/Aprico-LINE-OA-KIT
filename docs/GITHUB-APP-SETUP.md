# Aprico GitHub App：平台擁有者設定

這份設定只由 Aprico 平台擁有者做一次，顧客不用建立自己的 GitHub App。

## 1. 建立 GitHub App

登入要持有 App 的 GitHub 帳號，開啟 <https://github.com/settings/apps/new>。

| 欄位 | 填入內容 |
| --- | --- |
| GitHub App name | `Aprico AI Studio Builder`（全球名稱若已使用，增加品牌後綴） |
| Homepage URL | `https://ptgaminglife.github.io/Aprico-LINE-OA-KIT/` |
| Callback URL | `https://hhcubvixldieuwdeqnwc.supabase.co/functions/v1/line-oa-kit-github` |
| Expire user authorization tokens | 保持啟用；後端會拒絕沒有到期時間的 OAuth Token |
| Request user authorization during installation | 本版先不勾；使用者安裝後回建置中心按「連接我的 GitHub 帳號」 |
| Device flow | 不啟用 |
| Setup URL | 留空 |
| Webhook Active | 勾選 |
| Webhook URL | `https://hhcubvixldieuwdeqnwc.supabase.co/functions/v1/line-oa-kit-github/webhook` |
| Webhook Secret | 產生一組隨機高強度密碼；僅存 GitHub 與 Edge Secrets，不貼聊天 |
| Where can this GitHub App be installed? | Any account（讓顧客可以安裝） |

Repository permissions：

- Contents：Read and write，讓固定部署器寫入獨立分支。
- Pages：Read and write，發布新專案網站。
- Administration：Read and write，現有 Pages 建立 API 所需；這項權限較廣，介面必須告知並要求只勾專用 repo。
- Metadata：GitHub 自動加入的唯讀權限。
- 其他權限保持 No access，包括 Secrets、Workflows、Actions。**本階段還不是 Actions 部署引擎**，後續接固定工作流程才另行申請必要權限。

Installation、Installation repositories 與 GitHub App authorization 由 GitHub 自動提供，不一定出現在可勾選的事件清單。本階段不需額外勾選 Push／Workflow 等事件。本端點驗證 HMAC 後處理撤銷、停用與移除 repo，忽略其他事件。

按 Create GitHub App。進入 App 設定頁後：

1. 記下 App ID、Client ID。
2. 左側點 Credentials，在 Client secrets 區新增 Client secret（介面可能標示 Generate a new client secret／New client secret）；只複製到 Supabase。
3. 左側 Credentials → Key pairs → New key，下載 `.pem`。用記事本開啟，將全文（含 BEGIN／END）只存到 Supabase Secret；支援 GitHub 下載的 RSA PKCS#1 或 PKCS#8 PEM。
4. App slug 是公開網址 `https://github.com/apps/你的-slug` 最後一段，不是顯示名稱。

## 2. 儲存伺服器設定

到 <https://supabase.com/dashboard/project/hhcubvixldieuwdeqnwc/functions/secrets> 新增：

| Secret 名稱 | 來源 |
| --- | --- |
| `LINE_OA_KIT_GITHUB_APP_ID` | GitHub App → General → App ID |
| `LINE_OA_KIT_GITHUB_CLIENT_ID` | 同頁 Client ID（與 App ID 不同） |
| `LINE_OA_KIT_GITHUB_CLIENT_SECRET` | Credentials → Client secrets 剛產生的 Client secret |
| `LINE_OA_KIT_GITHUB_PRIVATE_KEY` | Credentials → Key pairs 下載的 `.pem` 全文，含 BEGIN／END 與換行 |
| `LINE_OA_KIT_GITHUB_APP_SLUG` | 公開 App 網址最後一段 |
| `LINE_OA_KIT_GITHUB_WEBHOOK_SECRET` | 與 GitHub Webhook Secret 完全一致 |

請不要貼出 Secret、PEM、OAuth code 或 Token。完成後只需通知「GitHub App 已設定」。

**開放順序**：先套用 `supabase/github-app.sql` 並部署後端，再完成上述六項設定；由維護者驗證通過後才把 `LINE_OA_KIT_GITHUB_ENABLED` 設為 `true`。這個開關先留空，不能在資料表／端點尚未就緒時先開放給顧客。

## 3. 顧客流程與測試

1. 用 LINE 登入 Aprico，選擇已開通的建置專案。
2. 到 GitHub 授權關卡；安裝 Aprico App，選 **Only select repositories**，只勾選自己有管理權的公開專用 repo（先建立 README）。
3. 回建置中心按「連接我的 GitHub 帳號」。在新分頁確認帳號，完成後回原分頁按「更新連線結果」。
4. 從 GitHub 實際核對的清單選擇 repo。下一關會保存網址；這一步不扣 AI 額度或部署。
5. 核對本次帳號並同意任務後，伺服器才取得只限單一 repo 的安裝 Token，完成檢查或部署後嘗試撤銷；即使清理中斷，GitHub Token 也會到期（通常一小時）。App 安裝本身會持續到使用者撤銷。
6. 正式開放前測試：不同 LINE 帳號不能讀取或選擇對方的 repo；假 callback／錯誤 state／不同瀏覽器／重複 callback 必須失敗；移除 App 或 repo 後新任務必須停止。

OAuth 流程採 PKCE S256、伺服器一次性 state、同瀏覽器 HttpOnly Cookie 與 LINE 專案所有權。顧客 Token、App 私鑰與 client secret 不回傳網頁、不寫入需求草稿、URL 或 repository。清單只保存非秘密的專案 ID、安裝 ID、GitHub 帳號與確認時間。State 與 verifier 十分鐘有效，callback 後立即清空 verifier；過期 flow 在再次連線時清除。

## 4. 後續 Actions 階段

本次先把 App 身分與現有直接 API 部署器接通，沒有把它冒充成 Actions。下一階段須固定可信 workflow、固定版本 Action、任務來源／目標核對、GitHub OIDC 或單次任務憑證、無秘密的進度回報、重送防護與撤銷測試。不得把平台 AI Key、Supabase 管理 Token、LINE Secret 放進公開 workflow、產物或 logs，也不讓 AI 任意產生並執行 workflow。正式啟用需再跑隔離測試，不操作已暫停的 Test 專案。
