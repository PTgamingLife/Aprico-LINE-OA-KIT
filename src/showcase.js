// 展示中心: 「我想要建置」 sends the same words in the Aprico OA chat, where the webhook
// switches this user's rich menu to the build center and replies with the way in.
// Outside LINE (or if sending fails) it simply opens the build center page.
const LIFF_ID = '2012197506-Vmb4O5iT';
export const BUILD_WORD = '我想要建置';

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

async function goBuild(status) {
  try {
    const liff = await loadSdk();
    await liff.init({ liffId: LIFF_ID });
    if (liff.isInClient()) {
      status.textContent = '正在為你開啟建置中心…';
      await liff.sendMessages([{ type: 'text', text: BUILD_WORD }]);
      liff.closeWindow();
      return;
    }
  } catch {
    // Fall through to the page itself.
  }
  location.href = './build.html';
}

const status = document.querySelector('[data-status]') ?? document.createElement('p');
for (const b of document.querySelectorAll('[data-build]'))
  b.addEventListener('click', () => {
    b.disabled = true;
    goBuild(status).finally(() => (b.disabled = false));
  });
