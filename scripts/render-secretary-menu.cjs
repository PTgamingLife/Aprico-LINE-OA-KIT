// Render the four-cell Aprico secretary rich menu to public/menus/secretary.png (1200x405).
// Usage: node scripts/render-secretary-menu.cjs   (needs Playwright and Noto Sans TC)
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const face = fs.readFileSync(path.join(__dirname, '..', 'public', 'mascot', 'secretary.png')).toString('base64');
const cells = [
  ['我的秘書', `<img src="data:image/png;base64,${face}">`, 'sun'],
  ['會員中心', '👑', ''],
  ['推薦好友', '🎁', ''],
  ['問題回報', '💬', ''],
];
const html = `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;width:1200px;height:405px;display:grid;grid-template-columns:repeat(4,1fr);gap:18px;padding:22px;
 background:linear-gradient(160deg,#EDE7FB,#D9E4FB 55%,#F7F2FF);font-family:'Noto Sans TC','Noto Sans CJK TC',sans-serif}
.c{background:rgba(255,255,255,.88);border-radius:44px;display:grid;place-items:center;align-content:center;gap:22px;
 box-shadow:0 12px 0 #C9CEF2,0 26px 34px rgba(88,102,214,.2)}
.o{width:176px;height:176px;border-radius:50%;display:grid;place-items:center;font-size:84px;
 background:radial-gradient(circle at 34% 30%,#fff 0 12%,#E4E8FF 30%,#A9B4FF 70%,#7C8CF0);box-shadow:0 0 0 8px rgba(255,255,255,.7),0 0 34px 10px rgba(124,140,240,.45)}
.o.sun{background:radial-gradient(circle at 34% 30%,#fff 0 14%,#FFF6C9 26%,#FFE07A 55%,#FFC53D 80%,#FFA826);box-shadow:0 0 0 8px rgba(255,248,214,.8),0 0 40px 14px rgba(255,214,92,.85)}
.o img{width:78%;height:78%;object-fit:contain}
.t{font-size:46px;font-weight:900;color:#2B2A4A;letter-spacing:2px}
</style>${cells.map(([t, i, k]) => `<div class="c"><div class="o ${k}">${i}</div><div class="t">${t}</div></div>`).join('')}`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 405 } });
  await p.setContent(html);
  await p.evaluate(() => document.fonts.ready);
  const out = path.join(__dirname, '..', 'public', 'menus', 'secretary.png');
  await p.screenshot({ path: out });
  console.log('wrote public/menus/secretary.png');
  await b.close();
})();
