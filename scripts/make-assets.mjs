// Regenerates public/logo.png, public/apple-touch-icon.png and public/og.png. Run: node scripts/make-assets.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const svg = readFileSync('public/favicon.svg');
await sharp(svg, { density: 600 }).resize(512, 512).png().toFile('public/logo.png');
await sharp(svg, { density: 600 }).resize(180, 180).png().toFile('public/apple-touch-icon.png');
const mark = `<svg viewBox="0 0 48 52" width="96" height="104"><rect x="4" y="38" width="10" height="12" rx="5" fill="#0b1f3a"/><rect x="19" y="26" width="10" height="24" rx="5" fill="#0b1f3a"/><rect x="34" y="14" width="10" height="36" rx="5" fill="#0b1f3a"/><circle cx="39" cy="6" r="5" fill="#ffcb05"/></svg>`;
const html = `<html><body style="margin:0;width:1200px;height:630px;background:#fbfaf7;font-family:Inter,Arial,sans-serif;position:relative;overflow:hidden">
<div style="position:absolute;left:80px;top:72px;display:flex;align-items:center;gap:24px">${mark}<div style="font-weight:800;letter-spacing:.14em;font-size:26px;line-height:1.3;color:#27282a">MICHIGAN<br>SUSTAINABLE INVESTMENTS</div></div>
<div style="position:absolute;left:80px;top:270px;width:900px;font-weight:600;font-size:84px;line-height:1.04;letter-spacing:-.04em;color:#27282a">The sustainable investing club at the University of Michigan.</div>
<div style="position:absolute;left:0;right:0;bottom:0;height:22px;background:#0b1f3a"></div><div style="position:absolute;left:80px;bottom:22px;width:160px;height:10px;background:#ffcb05"></div>
</body></html>`;
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.screenshot({ path: 'public/og.png' });
await browser.close();
