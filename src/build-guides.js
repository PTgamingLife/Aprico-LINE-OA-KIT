// 教學彈窗的內容：每一小步一份，白話、一步一個動作。
export const GUIDES = {
  repo: {
    title: '建立放秘書程式的空間（GitHub）',
    why: 'GitHub 是放秘書程式的地方。開在你自己名下，程式就是你的，之後更新也從這裡進行。',
    steps: [
      '還沒有 GitHub 帳號？先到 github.com 按 Sign up，用 Email 免費註冊。',
      '回到這一頁，按「從 Aprico 範本建立」。',
      '在 Repository name 填一個英文名字，例如 my-secretary。',
      '下面選 Public（公開）。裡面只有程式，不會有你的對話和資料。',
      '按綠色的 Create repository，看到檔案列表就完成了，回到這一頁。',
    ],
    link: ['還沒有帳號？註冊 GitHub ↗', 'https://github.com/signup'],
  },
  app: {
    title: '安裝程序小助手',
    why: '小助手只會在你剛建立的那個空間裡，幫你把秘書裝好。建置完成後，Aprico 會自動移除它的存取權。',
    steps: [
      '按「安裝程序小助手」，會打開 GitHub。',
      '選你自己的帳號。',
      '選「Only select repositories」，在下拉選單勾剛才建立的那一個。',
      '按綠色的 Install，完成後回到這一頁。',
    ],
  },
  connect: {
    title: '連接 GitHub',
    why: '讓這一頁知道要把秘書裝到哪一個空間。',
    steps: [
      '按「連接 GitHub」，畫面會跳到 GitHub。',
      '按 Authorize（授權），會自動回到這一頁。',
      '這一步會出現你剛才勾選的空間名稱，按「使用 ○○○」就完成了。',
    ],
  },
  oa: {
    title: '建立你的 LINE 官方帳號',
    why: '官方帳號就是秘書在 LINE 裡的樣子：你加它好友，在聊天室跟它說話。免費就能建立。',
    steps: [
      '按「建立 LINE 官方帳號」，用你自己的 LINE 登入。',
      '填帳號名稱（就是秘書的名字）、Email，業種隨意選一個最接近的。',
      '送出後進到管理後台，右上角按「設定」。',
      '左邊選「Messaging API」，按「啟用 Messaging API」。',
      '第一次會請你建立「服務提供者（Provider）」，名稱填自己的名字就可以，其餘欄位可以留空，按確定。',
    ],
    link: ['建立 LINE 官方帳號 ↗', 'https://entry.line.biz/form/entry/unverified'],
  },
  msg: {
    title: '找到 Messaging API 的兩組代碼',
    why: '這兩組代碼讓秘書可以用你的官方帳號收訊息、回訊息。',
    steps: [
      '按「打開 LINE Developers」，用同一個 LINE 登入。',
      '點你剛才建立的服務提供者（Provider），再點裡面的官方帳號（標示 Messaging API）。',
      '在 Basic settings 分頁，上面的 Channel ID 是一串數字，複製貼到第一格。',
      '同一頁往下找 Channel secret，複製貼到第二格。',
    ],
    link: ['打開 LINE Developers ↗', 'https://developers.line.biz/console/'],
  },
  login: {
    title: '建立 LINE Login，讓秘書認得你',
    why: '打開秘書頁面時，靠它確認「是你本人」，別人打不開你的設定。',
    steps: [
      '在 LINE Developers 回到同一個服務提供者（Provider），一定要同一個。',
      '按「Create a new channel」，選「LINE Login」。',
      '填名稱（例如：我的秘書登入），App types 勾「Web app」，按 Create。',
      '在 Basic settings 複製 Channel ID 和 Channel secret，貼到下面兩格。',
      '最後看頁面最上方：把「Developing」按一下改成「Published」。沒改的話只有你自己能用。',
    ],
    link: ['打開 LINE Developers ↗', 'https://developers.line.biz/console/'],
  },
  supabase: {
    title: '建立你的資料庫（Supabase）',
    why: 'Supabase 是秘書的記憶：行程、紀錄都存在你自己的資料庫裡，不是存在 Aprico。免費方案就夠用。',
    steps: [
      '按「打開 Supabase」，用 GitHub 帳號登入最快（Continue with GitHub）。',
      '登入後會到「Access Tokens」頁面。找不到的話：右上角頭像 → Account preferences → Access Tokens。',
      '按「Generate new token」，名稱隨意填（例如 secretary），按產生。',
      '畫面會出現一串 sbp_ 開頭的文字，只會顯示這一次，馬上複製貼到下面那一格。',
      '不用自己建立資料庫，建置時會自動幫你開好。',
    ],
    link: ['打開 Supabase ↗', 'https://supabase.com/dashboard/account/tokens'],
  },
};

// 進入建置前的說明頁：為什麼要用這三樣東西。
export const INTRO = {
  title: '打造你的專屬秘書',
  lead: '你的秘書會記住你的行程、對話和習慣，它其實是你的 AI 分身。這麼私人的東西，應該放在你自己手上，而不是放在別人那裡。',
  parts: [
    ['💬', 'LINE 官方帳號', '秘書的臉和嘴', '你加它好友，就在 LINE 裡跟它說話。帳號開在你名下，名字、頭像都由你決定。'],
    ['🧠', 'Supabase 資料庫', '秘書的記憶', '行程和紀錄都存進你自己的資料庫，像你自己的保險箱。Aprico 不保管你的資料。'],
    ['🏠', 'GitHub', '秘書的家', '秘書的程式放在你自己的空間。有新功能時從這裡更新，哪天不想用了，東西也都還是你的。'],
  ],
  safe: [
    '三樣東西都用你自己的帳號建立，全部免費。',
    '你貼上的代碼會先在手機上加密才送出，Aprico 看不到內容，也不會保存。',
    '建置完成後，Aprico 會自動移除對你 GitHub 的存取。',
  ],
  ready: '大約 20 分鐘，建議用電腦操作比較順。每一步都有「教學」按鈕，照著做就可以。',
};
