// Render the Aprico OA rich menus to public/menus/{showcase,build}.png.
// Needs the oaw-template checkout next to this repo (for liff/menu-shapes.js) and Playwright.
// Usage: node scripts/render-aprico-menus.cjs [port]
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..'); // folder holding both checkouts
const port = Number(process.argv[2] || 4181);
const types = { '.html': 'text/html', '.js': 'text/javascript' };
const server = http
  .createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = url.startsWith('/oaw-template/')
      ? path.join(root, url)
      : path.join(root, 'aprico-line-oa-kit', url);
    if (!file.startsWith(root) || !fs.existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'text/plain' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, '127.0.0.1');

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 810 } });
  await p.goto(`http://127.0.0.1:${port}/scripts/aprico-menus.html`);
  await p.waitForFunction(() => window.ready);
  const out = path.join(__dirname, '..', 'public', 'menus');
  fs.mkdirSync(out, { recursive: true });
  for (const name of ['showcase', 'build']) {
    const data = await p.evaluate((n) => window.render(n), name);
    fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(data.split(',')[1], 'base64'));
    console.log('wrote', `public/menus/${name}.png`);
  }
  await b.close();
  server.close();
})();
