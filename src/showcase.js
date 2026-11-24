// 展示中心: what LINE, an OA and the AI secretary can do. The call to action opens the member centre.
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

// New flow: the Aprico OA itself is the secretary, so 「我想要建置」 opens the member centre,
// where membership and building your own OA live.
async function goBuild() {
  location.href = './member.html?tab=member';
}

const status = document.querySelector('[data-status]') ?? document.createElement('p');
for (const b of document.querySelectorAll('[data-build]'))
  b.addEventListener('click', () => {
    b.disabled = true;
    goBuild(status).finally(() => (b.disabled = false));
  });
