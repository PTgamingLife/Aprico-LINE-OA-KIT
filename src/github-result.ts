// URL status is only a display hint; it never grants access or completes a step.
export function githubNotice(params:URLSearchParams){
 const status=params.get('github');
 if(status==='complete')return {error:false,text:'GitHub 帳號已核對，請在 GitHub 授權關卡更新連線結果並選擇專案。'};
 if(status==='start')return {error:false,text:'這是 GitHub 的自動回傳網址，不需要手動開啟。請在 GitHub 授權關卡按「連接我的 GitHub 帳號」開始。'};
 if(status!=='failed')return null;
 const reasons:Record<string,string>={platform_configuration:'平台的 GitHub App 設定尚未完成，請聯絡專員。',invalid_callback:'尚未收到完整的 GitHub 授權回傳。請從建置中心的「連接我的 GitHub 帳號」開始，不要直接開啟回傳網址。',browser_context:'授權回來時，瀏覽器沒有帶回本次驗證資料。請在同一個瀏覽器重新連接，過程中不要切換到另一個瀏覽器。',expired_or_replayed:'這次授權已過期或已使用，請在 GitHub 授權關卡重新連接。',github_code_exchange_failed:'GitHub 帳號核對未通過，請重新連接；若仍失敗，請聯絡專員檢查 App 設定。',github_account_list_failed:'GitHub 專案清單讀取失敗，請確認已安裝 Aprico App 並授權專用 repo，再重新連接。',github_callback_save_failed:'GitHub 帳號核對結果未能保存，請重新連接；若仍失敗，請聯絡專員。'};
 const reason=params.get('reason')||'';return {error:true,text:Object.hasOwn(reasons,reason)?reasons[reason]:'GitHub 尚未完成帳號核對。請在 GitHub 授權關卡重新連接；若仍失敗，請聯絡專員查看原因。'};
}
