export type Skill = {
  n: string;
  d: string;
  c: string[];
  r: string;
  s: number;
  u: string;
  o?: boolean;
};

export const skillCategories: Record<string, string> = {
  dev: "開發",
  test: "測試",
  design: "設計",
  content: "內容",
  auto: "自動化",
  mcp: "MCP",
  data: "資料",
  doc: "文件",
  sec: "資安",
  col: "合集",
};

export const skills: Skill[] = [
  {n:"Stop Slop",d:"把 AI 味濃厚的文字修成人話：移除空洞開場、制式對比、被動語態、破折號與冗餘填充句，並用 50 分量表檢查自然度。",c:["content"],r:"hardikpandya/stop-slop",s:13800,u:"https://github.com/hardikpandya/stop-slop"},
  {n:"Claude-Mem",d:"替 Claude Code 建立跨 Session 的持久記憶：自動擷取工具使用與專案脈絡、壓縮成可搜尋摘要，再於後續工作注入相關內容。會保存工作觀察，敏感資訊請使用隱私設定排除。",c:["auto","data"],r:"thedotmack/claude-mem",s:65800,u:"https://github.com/thedotmack/claude-mem"},
  {n:"UI/UX Pro Max",d:"可搜尋的 UI/UX 設計資料庫，涵蓋 50+ 種風格、配色與字體組合、99 條 UX 原則及多種前端技術棧，適合設計、實作與介面品質檢查。",c:["design","dev"],r:"nextlevelbuilder/ui-ux-pro-max-skill",s:105200,u:"https://github.com/nextlevelbuilder/ui-ux-pro-max-skill"},
  {n:"Task Observer",d:"在多步驟工作中記錄你的修正、偏好與有效流程，提出新增或改善其他 Skills 的建議。它會持續寫入觀察紀錄，建議定期人工審核，不要讓它自行無限制改動工作流。",c:["auto","col"],r:"rebelytics/one-skill-to-rule-them-all",s:1100,u:"https://github.com/rebelytics/one-skill-to-rule-them-all"},
  {n:"Find Skills",d:"告訴 Claude 你想完成什麼，它會透過 Skills CLI 搜尋開放技能生態、比較來源與安裝量，再提供合適的 Skill 與安裝方式。安裝前仍應檢查原始碼及權限。",c:["col","auto"],r:"vercel-labs/skills",s:26000,u:"https://github.com/vercel-labs/skills/tree/main/skills/find-skills"},
  {n:"anthropics/skills（官方）",d:"Anthropic 官方 Skills 大本營：文件處理、Artifacts、MCP builder、Skill 規格與模板，學寫 Skill 從這裡開始。",c:["col","dev"],r:"anthropics/skills",s:162638,u:"https://github.com/anthropics/skills",o:true},
  {n:"Superpowers",d:"熱門 Claude Code 實戰技能庫：TDD、除錯、腦力激盪、Git worktree 等 20+ 個經過實戰驗證的工作流 Skill。",c:["col","dev"],r:"obra/superpowers",s:257447,u:"https://github.com/obra/superpowers"},
  {n:"Awesome Claude Skills（Composio）",d:"大型社群精選清單，依分類整理數百個 Skill，含大量可直接使用的原創 Skill。",c:["col"],r:"ComposioHQ/awesome-claude-skills",s:68086,u:"https://github.com/ComposioHQ/awesome-claude-skills"},
  {n:"Awesome Claude Code",d:"Claude Code 資源大全：Skills、Agents、Status line、插件與開發工具一次收齊。",c:["col"],r:"hesreallyhim/awesome-claude-code",s:50398,u:"https://github.com/hesreallyhim/awesome-claude-code"},
  {n:"Claude Skills 大補帖",d:"Skills、Agents、Commands 打包的大型合集，適合想一次裝好一整套的人。",c:["col"],r:"alirezarezvani/claude-skills",s:22799,u:"https://github.com/alirezarezvani/claude-skills"},
  {n:"Awesome Claude Skills（travisvn）",d:"聚焦 Claude Code 的精選清單，附新手入門指引與安全注意事項。",c:["col"],r:"travisvn/awesome-claude-skills",s:14201,u:"https://github.com/travisvn/awesome-claude-skills"},
  {n:"Awesome Claude Skills（BehiSecc）",d:"另一份維護中的精選清單，收錄角度偏工程與資安。",c:["col","sec"],r:"BehiSecc/awesome-claude-skills",s:9803,u:"https://github.com/BehiSecc/awesome-claude-skills"},
  {n:"Claude Skills Collection",d:"整理官方與社群公開 Skill 的合集，分類清楚，適合瀏覽挖寶。",c:["col"],r:"abubakarsiddik31/claude-skills-collection",s:859,u:"https://github.com/abubakarsiddik31/claude-skills-collection"},
  {n:"docx",d:"官方 Word 文件 Skill：建立、編輯、分析 .docx，支援追蹤修訂、註解與格式。",c:["doc"],r:"anthropics/skills",s:162638,u:"https://github.com/anthropics/skills/tree/main/skills/docx",o:true},
  {n:"pdf",d:"官方 PDF Skill：抽取文字與表格、合併、註記、處理表單。",c:["doc"],r:"anthropics/skills",s:162638,u:"https://github.com/anthropics/skills/tree/main/skills/pdf",o:true},
  {n:"pptx",d:"官方簡報 Skill：讀取與生成投影片、版型、模板，做 Deck 必備。",c:["doc"],r:"anthropics/skills",s:162638,u:"https://github.com/anthropics/skills/tree/main/skills/pptx",o:true},
  {n:"xlsx",d:"官方試算表 Skill：公式、圖表、資料轉換，直接操作 Excel 檔。",c:["doc","data"],r:"anthropics/skills",s:162638,u:"https://github.com/anthropics/skills/tree/main/skills/xlsx",o:true},
  {n:"skill-creator",d:"官方「寫 Skill 的 Skill」：引導你把工作流封裝成規格正確的 Claude Skill。",c:["dev"],r:"anthropics/skills",s:162638,u:"https://github.com/anthropics/skills/tree/main/skills/skill-creator",o:true},
  {n:"web-artifacts-builder",d:"官方 Artifacts Skill：用 React、Tailwind 與 shadcn/ui 生成多元件互動網頁。",c:["dev","design"],r:"anthropics/skills",s:162638,u:"https://github.com/anthropics/skills/tree/main/skills/web-artifacts-builder",o:true},
  {n:"mcp-builder",d:"官方 MCP Skill：一步步引導你建立 Model Context Protocol server。",c:["mcp","dev"],r:"anthropics/skills",s:162638,u:"https://github.com/anthropics/skills/tree/main/skills/mcp-builder",o:true},
  {n:"test-driven-development",d:"Superpowers 招牌 Skill：先寫測試再寫程式的 TDD 紀律，避免 Claude 沒有驗證就往前衝。",c:["dev","test"],r:"obra/superpowers",s:257447,u:"https://github.com/obra/superpowers/tree/main/skills/test-driven-development"},
  {n:"root-cause-tracing",d:"把錯誤一路追回真正源頭，不做表面修補；除錯時很實用。",c:["dev"],r:"obra/superpowers",s:257447,u:"https://github.com/obra/superpowers/tree/main/skills/root-cause-tracing"},
  {n:"brainstorming",d:"把模糊想法追問成完整設計：蘇格拉底式提問，先想清楚再動手。",c:["dev","content"],r:"obra/superpowers",s:257447,u:"https://github.com/obra/superpowers/tree/main/skills/brainstorming"},
  {n:"using-git-worktrees",d:"用 Git worktree 建隔離工作區，平行開發不互踩，並包含安全檢查。",c:["dev"],r:"obra/superpowers",s:257447,u:"https://github.com/obra/superpowers/tree/main/skills/using-git-worktrees"},
  {n:"finishing-a-development-branch",d:"分支收尾 Skill：把合併、清理與 Pull Request 流程一次帶完。",c:["dev"],r:"obra/superpowers",s:257447,u:"https://github.com/obra/superpowers/tree/main/skills/finishing-a-development-branch"},
  {n:"changelog-generator",d:"把 Git commits 自動整理成使用者看得懂的 Release notes。",c:["dev","content"],r:"ComposioHQ/awesome-claude-skills",s:68086,u:"https://github.com/ComposioHQ/awesome-claude-skills/tree/master/changelog-generator"},
  {n:"software-architecture",d:"Clean Architecture、SOLID 與設計模式指導，讓 Claude 產出的架構不走鐘。",c:["dev"],r:"NeoLabHQ/context-engineering-kit",s:1255,u:"https://github.com/NeoLabHQ/context-engineering-kit"},
  {n:"prompt-engineering",d:"提示工程技巧包：協助你與 Claude 寫出更有效的 Prompt 與 Agent 指令。",c:["dev","content"],r:"NeoLabHQ/context-engineering-kit",s:1255,u:"https://github.com/NeoLabHQ/context-engineering-kit"},
  {n:"subagent-driven-development",d:"多 Subagent 開發流：自動派工與 Code review 檢查點，適合大型任務。",c:["dev","auto"],r:"NeoLabHQ/context-engineering-kit",s:1255,u:"https://github.com/NeoLabHQ/context-engineering-kit"},
  {n:"Skill Seekers",d:"把技術文件網站自動轉成 Claude Skill：餵入文件，產出可使用的 Skill。",c:["dev","auto"],r:"yusufkaraaslan/Skill_Seekers",s:14497,u:"https://github.com/yusufkaraaslan/Skill_Seekers"},
  {n:"D3.js Visualization",d:"教 Claude 產出正確的 D3 圖表與互動資料視覺化。",c:["dev","data","design"],r:"chrisvoncsefalvay/claude-d3js-skill",s:213,u:"https://github.com/chrisvoncsefalvay/claude-d3js-skill"},
  {n:"AWS Skills",d:"AWS CDK 開發、成本最佳化與 Serverless 模式，雲端開發者專用。",c:["dev"],r:"zxkane/aws-skills",s:333,u:"https://github.com/zxkane/aws-skills"},
  {n:"reddit-fetch",d:"WebFetch 被擋時改走 Reddit JSON API 抓內容，來自 ykdojo 的技巧合集。",c:["dev","data"],r:"ykdojo/claude-code-tips",s:9354,u:"https://github.com/ykdojo/claude-code-tips/tree/main/skills/reddit-fetch"},
  {n:"git-pushing",d:"自動化 Git 操作與 Repository 互動的工程工作流 Skill。",c:["dev","auto"],r:"mhattingpete/claude-skills-marketplace",s:648,u:"https://github.com/mhattingpete/claude-skills-marketplace"},
  {n:"test-fixing",d:"偵測失敗測試、定位原因並提出修法，讓紅燈有系統地變綠燈。",c:["dev","test"],r:"mhattingpete/claude-skills-marketplace",s:648,u:"https://github.com/mhattingpete/claude-skills-marketplace"},
  {n:"webapp-testing",d:"用 Playwright 實際打開本機網頁 App 操作驗證，網頁改完必跑。",c:["test"],r:"ComposioHQ/awesome-claude-skills",s:68086,u:"https://github.com/ComposioHQ/awesome-claude-skills/tree/master/webapp-testing"},
  {n:"Playwright Skill",d:"通用 Playwright 瀏覽器自動化：E2E 測試、表單與截圖都能做。",c:["test","auto"],r:"lackeyjb/playwright-skill",s:2925,u:"https://github.com/lackeyjb/playwright-skill"},
  {n:"iOS Simulator",d:"讓 Claude 操作 iOS 模擬器測試 App：點擊、截圖與驗證 UI。",c:["test"],r:"conorluddy/ios-simulator-skill",s:1160,u:"https://github.com/conorluddy/ios-simulator-skill"},
  {n:"PyPICT 測試組合",d:"用 Microsoft PICT 組合測試法自動產出高覆蓋率測試案例。",c:["test"],r:"omkamal/pypict-claude-skill",s:88,u:"https://github.com/omkamal/pypict-claude-skill"},
  {n:"CSV Data Summarizer",d:"丟入 CSV 就自動分析：摘要、洞察與視覺化一次產出。",c:["data"],r:"coffeefuelbump/csv-data-summarizer-claude-skill",s:432,u:"https://github.com/coffeefuelbump/csv-data-summarizer-claude-skill"},
  {n:"postgres",d:"安全唯讀模式查 PostgreSQL：讓 Claude 幫你寫 SQL，又不怕誤改資料。",c:["data"],r:"sanjay3290/ai-skills",s:348,u:"https://github.com/sanjay3290/ai-skills/tree/main/skills/postgres"},
  {n:"deep-research",d:"接 Gemini Deep Research 做多步驟深度研究，產出附來源的報告。",c:["data","content"],r:"sanjay3290/ai-skills",s:348,u:"https://github.com/sanjay3290/ai-skills/tree/main/skills/deep-research"},
  {n:"NotebookLM Integration",d:"讓 Claude 和 NotebookLM 對話，取得有來源根據的答案。",c:["data","content"],r:"PleasePrompto/notebooklm-skill",s:7431,u:"https://github.com/PleasePrompto/notebooklm-skill"},
  {n:"Connect（1000+ 服務）",d:"透過 Composio 連 Gmail、Slack、GitHub、Notion 等 1000+ 服務：寄信、開 Issue、發訊息。",c:["auto","mcp"],r:"ComposioHQ/awesome-claude-skills",s:68086,u:"https://github.com/ComposioHQ/awesome-claude-skills/tree/master/connect"},
  {n:"n8n Skills",d:"讓 Claude 看懂並操作 n8n 工作流，自動化玩家的橋接工具。",c:["auto"],r:"haunchen/n8n-skills",s:378,u:"https://github.com/haunchen/n8n-skills"},
  {n:"canvas-design",d:"用設計原則產出 PNG、PDF 視覺作品：海報、封面與卡片。",c:["design"],r:"ComposioHQ/awesome-claude-skills",s:68086,u:"https://github.com/ComposioHQ/awesome-claude-skills/tree/master/canvas-design"},
  {n:"theme-factory",d:"替 Artifacts 套上專業字體與配色主題，快速建立一致視覺。",c:["design"],r:"ComposioHQ/awesome-claude-skills",s:68086,u:"https://github.com/ComposioHQ/awesome-claude-skills/tree/master/theme-factory"},
  {n:"anydesign",d:"把圖片、網址或 Figma 檔逆向解析成 Design tokens 與設計系統。",c:["design"],r:"uxKero/anydesign",s:137,u:"https://github.com/uxKero/anydesign"},
  {n:"content-research-writer",d:"寫作前先研究：自動查資料、加引用、調整 Hook，產出有根據的內容。",c:["content"],r:"ComposioHQ/awesome-claude-skills",s:68086,u:"https://github.com/ComposioHQ/awesome-claude-skills/tree/master/content-research-writer"},
  {n:"Markdown → EPUB",d:"把 Markdown 與對話摘要轉成 EPUB 電子書，適合自出版流程。",c:["content","doc"],r:"smerchek/claude-epub-skill",s:140,u:"https://github.com/smerchek/claude-epub-skill"},
  {n:"FFUF Web Fuzzing",d:"整合 ffuf 模糊測試器進行網站弱點探測，僅限已授權測試。",c:["sec","test"],r:"jthack/ffuf_claude_skill",s:198,u:"https://github.com/jthack/ffuf_claude_skill"},
];
