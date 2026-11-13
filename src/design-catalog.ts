type MenuPreset = { id: string; label: string; detail: string; formats: readonly ResponseFormat[] };
export const responseFormats = { card: '卡片', web: '網頁', text: '文字' } as const;
export type ResponseFormat = keyof typeof responseFormats;

export const menuPresets: MenuPreset[] = [
  {
    id: 'calendar',
    label: '行事曆',
    detail: '整理日期、時間與行程，先讓使用者確認，再存入行事曆。',
    formats: ['card', 'web', 'text'],
  },
  {
    id: 'expenses',
    label: '收支記帳',
    detail: '記錄金額與分類，並查詢收支明細。',
    formats: ['card', 'web', 'text'],
  },
  {
    id: 'digest',
    label: '每日摘要',
    detail: '彙整當日行程、待辦或指定紀錄。',
    formats: ['card', 'web', 'text'],
  },
  {
    id: 'games',
    label: '小遊戲',
    detail: '共用一個小遊戲入口，可放踩地雷、樓梯小遊戲、貓咪躲紙箱與刮刮樂。',
    formats: ['web'],
  },
  {
    id: 'bazi',
    label: '八字',
    detail: '填入出生資料後查看八字與個人特質分析。',
    formats: ['card', 'web', 'text'],
  },
  {
    id: 'divination',
    label: '卜卦',
    detail: '輸入想問的事情，取得卦象及解讀。',
    formats: ['card', 'web', 'text'],
  },
  {
    id: 'interactive',
    label: '互動卡片',
    detail: '設定卡片的標題、內容與按鈕，可用於聯絡、介紹或引導。',
    formats: ['card'],
  },
  {
    id: 'ai-news',
    label: 'AI 圖文日報',
    detail: '設定主題與發送時間，定時產生並發布圖文。',
    formats: ['card', 'web', 'text'],
  },
  {
    id: 'tasks',
    label: '待辦清單',
    detail: '新增待辦、指定負責人、勾選完成。',
    formats: ['card', 'web', 'text'],
  },
  {
    id: 'goals',
    label: '目標追蹤',
    detail: '設定目標、截止日與回顧提醒。',
    formats: ['card', 'web', 'text'],
  },
  {
    id: 'life',
    label: '生活紀錄',
    detail: '整理日常備忘，私密項目只在私聊回覆。',
    formats: ['card', 'web', 'text'],
  },
  {
    id: 'image-record',
    label: '圖片轉紀錄',
    detail: '從指定圖片擷取行程、收支或備忘，讓使用者確認擷取結果。',
    formats: ['card', 'web', 'text'],
  },
  {
    id: 'health',
    label: '健康檢測',
    detail: '開啟拍照分析流程，呈現健康觀察與相關說明。',
    formats: ['web'],
  },
];

export const recordPresets = [
  { id: 'calendar', label: '行程', detail: '整理日期與時間，確認後才存成行程。' },
  { id: 'expenses', label: '收支', detail: '擷取金額、項目與類別，確認後再記帳。' },
  { id: 'tasks', label: '待辦與目標', detail: '擷取工作、負責人或期限，確認後建立待辦。' },
  { id: 'life', label: '生活紀錄', detail: '整理私聊的備忘與日常資料，回到自己的私聊。' },
  { id: 'image-record', label: '圖片辨識', detail: '處理使用者指定的圖片，確認後保存擷取結果。' },
  { id: 'digest', label: '每日摘要', detail: '彙整已確認的紀錄，依指定位置提供摘要。' },
] as const;
export type RecordPreset = (typeof recordPresets)[number]['id'];
export const recipients = {
  chat: '原聊天室',
  private: '本人／管理員私訊',
  dashboard: '私人管理頁',
} as const;
export const destinations = {
  database: '專案資料庫',
  calendar: '專案資料庫＋授權後同步 Google 日曆',
  none: '即時回覆',
} as const;
export type RecordRoute = {
  id: RecordPreset;
  notes: string;
  format: ResponseFormat;
  recipient: keyof typeof recipients;
  destination: keyof typeof destinations;
};
