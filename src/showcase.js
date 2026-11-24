// 「AI 秘書能做什麼」: what the secretary edition does. Two actions: go back to the chat to
// try it (inside LINE the page simply closes), or open the member centre.
import './fresh.js';
const LIFF_ID = '2012197506-Vmb4O5iT';
const OA_ADD = 'https://line.me/R/ti/p/@228srwlt';

function loadSdk() {
  if (window.liff) return Promise.resolve(window.liff);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
    s.onload = () => resolve(window.liff);
    s.onerror = reject;
    document.head.append(s);
  });
}

async function backToChat() {
  try {
    const liff = await loadSdk();
    await liff.init({ liffId: LIFF_ID });
    if (liff.isInClient()) return liff.closeWindow();
  } catch {
    // Outside LINE: fall through to the add-friend link.
  }
  location.href = OA_ADD;
}

for (const b of document.querySelectorAll('[data-chat]')) b.addEventListener('click', backToChat);
for (const b of document.querySelectorAll('[data-build]'))
  b.addEventListener('click', () => (location.href = './member.html?tab=member'));
