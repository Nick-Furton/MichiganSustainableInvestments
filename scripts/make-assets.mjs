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
const mark = `<svg viewBox="2 0 62 58" width="104" height="97"><path d="M8 52 L22 22 L33 40 L46 14 L56 34" fill="none" stroke="#0b1f3a" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M46 13 C46 5 52 1 61 1 C61 10 55 13 46 13 Z" fill="#ffcb05"/></svg>`;
const b64 = (f) => readFileSync(f).toString('base64');
const fonts = `<style>
@font-face{font-family:'Inter Variable';font-weight:100 900;src:url(data:font/woff2;base64,${b64('node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')}) format('woff2-variations')}
@font-face{font-family:'Source Serif 4 Variable';font-weight:200 900;src:url(data:font/woff2;base64,${b64('node_modules/@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2')}) format('woff2-variations')}
</style>`;
const html = `<html><head>${fonts}</head><body style="margin:0;width:1200px;height:630px;background:#fbfaf7;font-family:'Inter Variable',Arial,sans-serif;position:relative;overflow:hidden">
<div style="position:absolute;left:80px;top:72px;display:flex;align-items:center;gap:24px">${mark}<div style="font-weight:800;letter-spacing:.14em;font-size:26px;line-height:1.3;color:#27282a">MICHIGAN<br>SUSTAINABLE INVESTMENTS</div></div>
<div style="position:absolute;left:80px;top:262px;width:980px;font-family:'Source Serif 4 Variable',Georgia,serif;font-weight:600;font-size:84px;line-height:1.08;letter-spacing:-.02em;color:#27282a">The sustainable investing club at the University of Michigan.</div>
<div style="position:absolute;left:0;right:0;bottom:0;height:22px;background:#0b1f3a"></div><div style="position:absolute;left:80px;bottom:22px;width:160px;height:10px;background:#ffcb05"></div>
</body></html>`;
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'public/og.png' });
await browser.close();
