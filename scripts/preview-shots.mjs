// Builds with SAMPLE_DATA=1 and saves review screenshots to _preview/. Run: npm run preview:shots
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { join, extname, resolve } from 'node:path';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const dir = resolve('.test-dist/preview');
const prodDir = resolve('.test-dist/preview-prod');
const clean = { ...process.env };
for (const k of ['SITE_URL', 'BASE_PATH', 'PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_ANON_KEY', 'SAMPLE_DATA']) delete clean[k];
for (const [out, extra] of [[dir, { SAMPLE_DATA: '1' }], [prodDir, {}]]) {
  const env = { ...clean, ...extra };
  spawnSync('node', ['scripts/prebuild.mjs'], { env });
  const r = spawnSync('npx', ['astro', 'build', '--outDir', out], { env, encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stdout, r.stderr); process.exit(1); }
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.avif': 'image/avif', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const serveDir = (root) => createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); let f = join(root, p); if (p.endsWith('/')) f = join(f, 'index.html');
  if (!existsSync(f) || statSync(f).isDirectory()) { f = join(root, '404.html'); res.statusCode = 404; }
  res.setHeader('content-type', types[extname(f)] || 'application/octet-stream'); res.end(readFileSync(f));
});
const server = serveDir(dir), prodServer = serveDir(prodDir);
await new Promise((ok) => prodServer.listen(0, '127.0.0.1', ok));
const prodOrigin = `http://127.0.0.1:${prodServer.address().port}`;
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const origin = `http://127.0.0.1:${server.address().port}`;
mkdirSync('_preview', { recursive: true });
// [name, path, width, options]
const shots = [
  ['home-desktop', '/', 1440], ['home-prod-desktop', '/', 1440, { prod: true }],
  ['home-mobile', '/', 390], ['home-mobile-top', '/', 390, { top: true }],
  ['program-desktop', '/program/', 1440], ['team-desktop', '/team/', 1440], ['placements-desktop', '/placements/', 1440], ['about-desktop', '/about/', 1440],
  ['join-desktop', '/join/', 1440], ['resume-guide-desktop', '/members/resume-guide/', 1440],
  ['members-profile-demo-desktop', '/members/profile/?demo=1', 1440], ['members-admin-demo-desktop', '/members/admin/?demo=1', 1440],
];
const browser = await pw.chromium.launch();
for (const [name, path, width, o = {}] of shots) {
  const ctx = await browser.newContext({ viewport: { width, height: o.top ? 844 : 900 }, deviceScaleFactor: o.top ? 2 : 1 });
  const page = await ctx.newPage();
  await page.goto((o.prod ? prodOrigin : origin) + path, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelectorAll('.reveal').forEach((e) => e.classList.add('in')));
  await page.waitForTimeout(700);
  if (name.includes('demo')) await page.waitForSelector('[data-state=ready]:not([hidden])', { timeout: 5000 });
  await page.screenshot({ path: `_preview/${name}.jpg`, type: 'jpeg', quality: 80, fullPage: !o.top });
  await ctx.close();
}
await browser.close(); server.close(); prodServer.close();
console.log('saved', shots.length, 'screenshots');
