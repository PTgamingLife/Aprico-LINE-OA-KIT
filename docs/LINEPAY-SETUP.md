# LINE Pay 建置開通（Online API v4）

原價 NT$6,660，優惠期間 NT$3,860、TWD、單一專案教學／建置工具開通；尚未指定優惠截止日期，不使用倒數。不含模組、加購額度或第三方費用。保留專員密碼。不得用付款成功宣稱網站已部署。既有訂單保留成立時金額（包含舊價 NT$1,890），不事後改價；新訂單使用 3860。

## 商店端必要設定

在 heart-cards Edge Secrets 設定以下名稱，值不得放進 GitHub、前端、聊天或截圖：

- `LINE_OA_KIT_LINEPAY_CHANNEL_ID`：LINE Pay 線上付款商店的 Channel ID。
- `LINE_OA_KIT_LINEPAY_CHANNEL_SECRET`：同商店的 Channel Secret，**不是 LINE Login／Messaging Secret**。
- `LINE_OA_KIT_LINEPAY_MODE`：先設 `sandbox`。
- `LINE_OA_KIT_LINEPAY_LIVE_ENABLED`：測試階段不要設為 `true`。

已有正式商店憑證可依官方說明用於 Sandbox；須確認商店已獲准線上付款。若商店要求允許來源 IP，應先確認 Supabase Edge 對外 IP 條件，不能假設固定 IP。

## 回傳頁

固定 `https://ptgaminglife.github.io/Aprico-LINE-OA-KIT/build.html`，由伺服器附上 project、pay=return/cancel。使用者需以同一 LINE 帳號登入。query 的 transactionId、orderId 與成功文字完全不作為開通依據；用資料庫交易編號向 LINE Pay 查核。

## 流程

1. 登入、保存專案，閱讀購買範圍並勾選確認。
2. 建立訂單 → 開啟 LINE Pay → 完成付款授權。
3. 返回建置中心，明確按「已完成授權，確認本次付款」，伺服器才可能呼叫確認／請款 API。
4. 查詢交易明細：核對 orderId、完整 transactionId、TWD、付款合計等於資料庫訂單金額、PAYMENT 類型及無退款。不得以目前售價覆蓋歷史訂單。
5. 正式交易才在同一 DB 交易內保存 paid 並開通專案。Sandbox 僅 test_paid，**不開通正式權限**。

## 異常／安全

- 狀態查詢與核對結果只使用 GET，不再扣款。付款確認以 CAS 防止多分頁重複呼叫；不自動重試請款。
- 訂單請求／確認結果不明時，保留鎖定訂單，不能以按重新整理產生另一張帳單。
- 有交易編號可按「核對付款結果」修復成功付款但尚未開通的情況；未取得編號的異常需專員按 orderId 到商店中心核對，禁止直接刪除紀錄或再次收款。
- 未完成授權、取消或逾時，不開通。只有 LINE Pay 明確回應取消／逾時，才允許另開訂單。
- 訂單保留稽核紀錄且不可由客戶直接讀寫。跨帳號只能看自己的訂單／專案。
- 本版無自動退款、稅務發票、拒付處理或對帳排程；正式銷售前須確立服務條款、隱私、退款／客服政策、商店審核、發票與對帳作業。退款後的權限回收目前需專員處理。
- NT$3,860 包含單一專案 5 次成功產生草稿；處理中暫占，失敗不扣，相同版本重讀不扣。伺服器鎖定檢查，第六次新版本會被拒絕。全平台 AI 建置預算經營運者確認為 US$100 累計上限（2026-10-30 已設定）；不定期自動重設、不自動加值，保留既有 spent/reserved。這是本工具的估算成本與預留控管，不是 OpenAI 帳戶所有用途的全域扣款上限。正式賣出前仍需驗證完整建置／部署。
- 對外名稱 Aprico AI Studio；客服 apricoaistudio@gmail.com。完整服務／隱私／退款說明見 `docs/SALES-POLICY-DRAFT.md`，仍為待確認草稿，不作為已核准契約。

## 上線驗收清單（不得略過）

- Sandbox 完整付款、取消、刷新、多分頁、金額不符、不同帳號、付款後資料庫異常恢復。
- 手機 LINE 內返回建置中心，同一專案可以找到原訂單，測試交易未授權正式開通。
- 確認正式商店許可與政策／稅務／退款／額度內容後，經擁有者確認才將 MODE 改 `production` 且 LIVE_ENABLED=`true`。
- 正式啟用前安排小額測試需另行授權；目前新訂單售價固定 3860，不得未確認就做真實交易。

官方參考：[憑證與簽章](https://developers-pay.line.me/online/prerequisites)、[API v4](https://developers-pay.line.me/online-api-v4)、[付款確認](https://developers-pay.line.me/online-api-v4/confirm-payment)。
