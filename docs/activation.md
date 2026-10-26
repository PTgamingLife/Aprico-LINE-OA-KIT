# 專員密碼開通

在 heart-cards → Edge Functions → Secrets 設定：

| 名稱 | 要填的內容 |
| --- | --- |
| `LINE_OA_KIT_BUILD_PASSWORD` | 你自行設定並提供給客戶的開通密碼；建議至少 12 碼 |
| `LINE_OA_KIT_CONTACT_URL` | 可公開的專員 LINE 連結，例如 https://line.me/ti/p/... |
| `LINE_OA_KIT_BUILD_OPENAI_API_KEY` | 專用的平台建置 OpenAI 金鑰；不可填顧客正式營運用的 Key |

請勿將這些秘密數值放進 GitHub 或聊天。只有 CONTACT_URL 可公開。

密碼驗證由 Edge API 完成，結果綁定 LINE 會員及專案。密碼不保存到前端儲存空間或資料庫；每個會員 15 分鐘最多嘗試 5 次。

修改平台密碼不會撤銷之前開通的專案。這是人工專員開通機制，尚不代表系統已收到付款。未來 LINE Pay 要由已驗證的付款通知寫入同一個專案權益表，不可由瀏覽器自行宣告已付款。

本版開通後可使用四步需求／平台資訊設定、雲端保存及需求檢查。自動產生與部署仍需平台 AI 服務、使用者 GitHub／Supabase 授權與用量上限；不得把需求檢查通過標示成已部署。
