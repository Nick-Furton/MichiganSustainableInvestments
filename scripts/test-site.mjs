// Site tests: builds three variants (production, BASE_PATH=/msi-site/, SAMPLE_DATA=1), checks every HTML file,
// then runs a Playwright smoke test on the production build. Run: npm test
import { spawn, spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { readdirSync, readFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { join, extname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = resolve('.');
const OUT = join(ROOT, '.test-dist');
let failures = 0, checks = 0;
const fail = (where, msg) => { failures++; console.error(`  FAIL [${where}] ${msg}`); };
const ok = (cond, where, msg) => { checks++; if (!cond) fail(where, msg); };

const BANNED = ['empower', 'unlock', 'elevate', 'journey', 'vibrant', 'passionate', 'delve', 'foster', 'comprehensive', 'cutting-edge', 'world-class'];
const DISCLAIMER = 'Michigan Sustainable Investments is a student organization at the University of Michigan. It is not an official unit of the University and does not speak for it. Nothing on this site is investment advice.';
const MEMBER_COUNT = /\b\d[\d,]*\+?\s+(?:(?:active|current|student|undergraduate)\s+)?members\b|\bmembers\s*[:\-]\s*\d/i;

// Async spawn: the Supabase test runs a mock server inside this process, so builds must not block the event loop.
function run(cmd, args, env) {
  return new Promise((resolve) => {
    const c = spawn(cmd, args, { env });
    let stdout = '', stderr = '';
    c.stdout.on('data', (d) => (stdout += d));
    c.stderr.on('data', (d) => (stderr += d));
    c.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}
async function build(name, env) {
  const outDir = join(OUT, name);
  rmSync(outDir, { recursive: true, force: true });
  const clean = { ...process.env };
  for (const k of ['SITE_URL', 'BASE_PATH', 'PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_ANON_KEY', 'SAMPLE_DATA', 'SEARCH_VISIBLE']) delete clean[k];
  const full = { ...clean, ...env };
  const pre = await run('node', ['scripts/prebuild.mjs'], full);
  if (pre.status !== 0) { console.error(pre.stdout, pre.stderr); fail(name, 'prebuild failed'); return null; }
  const r = await run('npx', ['astro', 'build', '--outDir', outDir], full);
  if (r.status !== 0) { console.error(r.stdout, r.stderr); fail(name, 'astro build failed'); return null; }
  return outDir;
}
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) { const p = join(dir, f); statSync(p).isDirectory() ? walk(p, out) : out.push(p); }
  return out;
}
const attr = (tag, name) => { const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag); return m ? (m[2] ?? m[3]) : null; };
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
function visibleText(html) {
  return decode(html.replace(/<(script|style|template|noscript)[\s\S]*?<\/\1>/gi, ' ').replace(/<head[\s\S]*?<\/head>/i, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function checkVariant(name, dir, { base = '/', sample = false, data = false }) {
  const hasData = sample || data;
  console.log(`\n== ${name} ==`);
  const files = walk(dir);
  const pages = files.filter((f) => f.endsWith('.html'));
  ok(pages.length >= 13, name, `expected at least 13 HTML pages, found ${pages.length}`);
  const titles = new Map(), descs = new Map();
  const ids = new Map();
  const htmlOf = new Map(pages.map((p) => [p, readFileSync(p, 'utf8')]));
  const pathOfFile = (f) => { const rel = f.slice(dir.length).replace(/\\/g, '/'); return rel.endsWith('/index.html') ? rel.slice(0, -10) : rel; };
  for (const [p, html] of htmlOf) ids.set(pathOfFile(p), new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));

  const resolves = (href, from) => {
    if (/^(https?:|mailto:|tel:|data:|javascript:)/i.test(href) || href.startsWith('#') && href.length === 1) return true;
    let path = href, hash = '';
    const hi = href.indexOf('#'); if (hi >= 0) { path = href.slice(0, hi); hash = href.slice(hi + 1); }
    path = path.split('?')[0];
    const samePage = path === '';
    if (samePage) path = from;
    if (path.startsWith('/') && !samePage) {
      if (!path.startsWith(base)) return `does not start with base ${base}`;
      path = '/' + path.slice(base.length);
    } else if (!samePage) path = new URL(path, 'http://x' + from).pathname;
    let file = join(dir, decodeURIComponent(path));
    if (path.endsWith('/')) file = join(file, 'index.html');
    if (!existsSync(file) || statSync(file).isDirectory()) return 'target not found';
    if (hash && file.endsWith('.html') && !ids.get(pathOfFile(file))?.has(hash)) return `anchor #${hash} not found`;
    return true;
  };

  for (const [p, html] of htmlOf) {
    const rel = pathOfFile(p);
    const w = `${name}:${rel}`;
    const isGuide = rel.includes('/members/resume-guide/');
    const robots = (/<meta name="robots" content="([^"]*)"/.exec(html) || [])[1] || '';
    const indexable = !/noindex/.test(robots);
    const h1s = (html.match(/<h1[\s>]/g) || []).length;
    ok(h1s === 1, w, `expected exactly one h1, found ${h1s}`);
    const title = decode((/<title>([\s\S]*?)<\/title>/.exec(html) || [])[1] || '').trim();
    ok(title.length > 0, w, 'empty title');
    ok(!titles.has(title), w, `duplicate title "${title}" (also ${titles.get(title)})`); titles.set(title, rel);
    const desc = decode((/<meta name="description" content="([^"]*)"/.exec(html) || [])[1] || '');
    ok(desc.length > 0, w, 'missing meta description');
    ok(!descs.has(desc), w, 'duplicate meta description'); descs.set(desc, rel);
    if (indexable) ok(desc.length >= 70 && desc.length <= 165, w, `description length ${desc.length} not in 70-165`);
    ok(/<link rel="canonical" href="https?:\/\/[^"]+"/.test(html), w, 'missing canonical');
    ok(/<html lang="en"/.test(html), w, 'missing lang="en"');
    ok(/<main[\s>]/.test(html) && /<header[\s>]/.test(html) && /<footer[\s>]/.test(html), w, 'missing landmarks');
    ok(/property="og:title"/.test(html) && /name="twitter:card"/.test(html), w, 'missing Open Graph / Twitter tags');
    if (base !== '/') ok(new RegExp(`<link rel="canonical" href="[^"]*${base}`).test(html), w, 'canonical lacks base path');
    // JSON-LD
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      try { JSON.parse(m[1]); checks++; } catch (e) { fail(w, 'JSON-LD does not parse: ' + e.message); }
    }
    if (rel === '/') ok(/"@type":"Organization"/.test(html) && /"@type":"WebSite"/.test(html), w, 'home needs Organization + WebSite JSON-LD');
    else if (!rel.endsWith('/404.html') && !rel.startsWith('/404')) ok(/"@type":"BreadcrumbList"/.test(html), w, 'inner page needs BreadcrumbList');
    // images
    for (const m of html.matchAll(/<img\b[^>]*>/g)) {
      ok(attr(m[0], 'alt') !== null && attr(m[0], 'width') && attr(m[0], 'height'), w, `img missing alt/width/height: ${m[0].slice(0, 90)}`);
    }
    // links and assets
    const refs = [];
    for (const m of html.matchAll(/<(a|link|script|img|source)\b[^>]*>/g)) {
      for (const a of ['href', 'src']) { const v = attr(m[0], a); if (v) refs.push(decode(v)); }
      const ss = attr(m[0], 'srcset'); if (ss) ss.split(',').forEach((s) => refs.push(decode(s.trim().split(/\s+/)[0])));
    }
    for (const m of html.matchAll(/<meta property="og:image" content="([^"]+)"/g)) refs.push(m[1].replace(/^https?:\/\/[^/]+/, ''));
    for (const r of refs) { const res = resolves(r, rel); ok(res === true, w, `broken reference ${r}: ${res}`); }
    // text rules
    const text = visibleText(html);
    ok(text.includes(DISCLAIMER), w, 'footer disclaimer missing');
    ok(/Founded in 2019 as the Michigan Impact Investing Symposium\./.test(text), w, 'footer history line missing');
    ok(!/lorem|TODO|\[CONFIRM\]/i.test(text), w, 'placeholder text found');
    if (!isGuide) ok(!/[\[\]]/.test(text), w, 'square-bracket placeholder in text');
    for (const word of BANNED) ok(!new RegExp(`\\b${word}\\b`, 'i').test(text + ' ' + title + ' ' + desc), w, `banned word "${word}"`);
    ok(!/not just[^.]*\bbut\b/i.test(text), w, 'banned "not just X but Y"');
    ok(!/!/.test(text), w, 'exclamation mark');
    ok(!MEMBER_COUNT.test(text + ' ' + desc), w, 'page states a member count');
    if (rel !== '/404.html' && rel !== '/404/') ok(!/^MSI\b/.test(title), w, 'title starts with bare MSI');
    // sample data / banner
    const banner = html.includes('Preview data — not real members');
    ok(banner === sample, w, sample ? 'preview banner missing' : 'preview banner present in production build');
    if (!sample) ok(!/Sample (Member|Firm)/.test(html), w, 'sample data in production build');
    // members area
    if (rel.includes('/members/') && !isGuide) ok(/noindex/.test(robots), w, 'members page must be noindex');
    if (isGuide) ok(indexable, w, 'resume guide must be indexable');
    ok(rel === '/404.html' || !html.includes('undefined'), w, 'literal "undefined" in page');
  }

  // Nav rules
  const home = htmlOf.get(join(dir, 'index.html'));
  const nav = /<nav class="nav"[\s\S]*?<\/nav>/.exec(home)[0];
  const labels = [...nav.matchAll(/<li><a [^>]*>([^<]+)<\/a><\/li>/g)].map((m) => m[1]);
  ok(labels.slice(0, 4).join('|') === 'Home|Sustainable investing|Program|Board', name, `nav order should start Home, Sustainable investing, Program, Board (got ${labels.join(', ')})`);
  ok(labels.includes('Board') && labels.includes('Join') && labels.includes('For employers') && !labels.includes('About') && !labels.includes('Team'), name, 'nav must always have Board, no About or Team');
  ok(labels.includes('Placements') === hasData, name, hasData ? 'Placements should be in the nav' : 'Placements must be absent from the nav when empty');
  ok(!existsSync(join(dir, 'about')) && !existsSync(join(dir, 'team')), name, 'About and Team pages must not exist');
  ok(existsSync(join(dir, 'board/index.html')) && existsSync(join(dir, 'sustainable-investing/index.html')), name, 'Board and Sustainable investing pages must exist');
  const si = htmlOf.get(join(dir, 'sustainable-investing/index.html'));
  ok([...si.matchAll(/<h2 id="([a-z-]+)">/g)].map((m) => m[1]).join(',') === 'microfinance,impact-venture-capital,green-bonds,esg-equities,clean-energy-finance', name, 'sustainable-investing sections/ids');
  ok((si.match(/<dt>(How it works|How investors are paid|What it does|What members examine)<\/dt>/g) || []).length === 20 && (si.match(/On record/g) || []).length === 2, name, 'sustainable-investing: 5 x 4 labelled parts and 2 On record lines');
  ok(/rel="noopener"/.test(si) && (si.match(/href="https:\/\/(www\.nobelprize\.org|www\.icmagroup\.org|treasury\.worldbank\.org)/g) || []).length === 3, name, 'sustainable-investing sources');
  ok(!/Key facts|fact-num/.test(home), name, 'home facts strip must be gone');
  ok(!/students applied/.test(home + htmlOf.get(join(dir, 'join/index.html'))), name, 'selectivity sentence must not show while empty');
  ok(hasData === /Where members go/.test(home) && hasData === />Leadership</.test(home), name, 'home Leadership / Where members go sections must match data');
  // JS bundles: demo code only in sample builds
  const js = walk(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(f, 'utf8')).join('\n');
  ok(sample === js.includes('sample.member'), name, sample ? 'demo mode missing from sample build' : 'demo/sample code compiled into production build');
  ok(!js.includes('Preview data'), name, 'banner text in JS');
  // sitemap / robots / llms
  const sm = existsSync(join(dir, 'sitemap-0.xml')) ? readFileSync(join(dir, 'sitemap-0.xml'), 'utf8') : '';
  ok(sm.includes('/members/resume-guide/'), name, 'sitemap lacks resume guide');
  ok(!/\/members\/(profile|admin)?\/?<|\/members\/<|\/404/.test(sm), name, 'sitemap includes members area or 404');
  ok(hasData ? sm.includes('/board/') : !sm.includes('/board/'), name, 'sitemap board entry should follow data');
  ok(sm.includes('/sustainable-investing/') && !sm.includes('/about/') && !sm.includes('/team/'), name, 'sitemap: sustainable-investing in, about and team out');
  if (base !== '/') ok(sm.includes(base), name, 'sitemap lacks base path');
  ok(existsSync(join(dir, 'robots.txt')) && /Sitemap:/.test(readFileSync(join(dir, 'robots.txt'), 'utf8')), name, 'robots.txt with sitemap');
  const llms = readFileSync(join(dir, 'llms.txt'), 'utf8');
  ok(llms.includes('Michigan Sustainable Investments') && !MEMBER_COUNT.test(llms), name, 'llms.txt content');
  ok(existsSync(join(dir, 'og.png')) && existsSync(join(dir, 'favicon.svg')), name, 'og.png / favicon missing');
}

function loadPlaywright() { try { return require('playwright'); } catch { return require('/opt/node-tools/node_modules/playwright'); } }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.avif': 'image/avif', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain', '.xml': 'application/xml' };
async function serve(dir) {
  const server = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = join(dir, p); if (p.endsWith('/')) f = join(f, 'index.html');
    if (!existsSync(f) || statSync(f).isDirectory()) { f = join(dir, '404.html'); res.statusCode = 404; }
    res.setHeader('content-type', TYPES[extname(f)] || 'application/octet-stream');
    res.end(readFileSync(f));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}
const pagePaths = (dir) => walk(dir).filter((f) => f.endsWith('.html')).map((f) => { const r = f.slice(dir.length).replace(/\\/g, '/'); return r.endsWith('/index.html') ? r.slice(0, -10) : r; });

// ---------- Accessibility (axe-core): no serious or critical violations ----------
async function a11y(prodDir, sampleDir) {
  console.log('\n== accessibility (axe-core) ==');
  const axePath = require.resolve('axe-core/axe.min.js');
  const browser = await loadPlaywright().chromium.launch();
  const run = async (origin, path, width, label, before) => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(origin + path, { waitUntil: 'load' });
    if (before) await before(page);
    await page.evaluate(() => document.querySelectorAll('.reveal').forEach((e) => e.classList.add('in')));
    await page.waitForTimeout(700);
    await page.addScriptTag({ path: axePath });
    const results = await page.evaluate(() => axe.run(document, { resultTypes: ['violations'] }));
    const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    ok(bad.length === 0, `a11y:${label}`, bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`).join('; '));
    await ctx.close();
  };
  const prod = await serve(prodDir);
  for (const p of pagePaths(prodDir)) await run(prod.origin, p, 1280, `prod ${p}`);
  await run(prod.origin, '/', 390, 'prod / @390');
  await run(prod.origin, '/join/', 390, 'prod /join/ @390');
  prod.close();
  const sample = await serve(sampleDir);
  for (const p of ['/', '/board/', '/placements/', '/sustainable-investing/']) await run(sample.origin, p, 1280, `sample ${p}`);
  await run(sample.origin, '/', 390, 'sample / @390');
  await run(sample.origin, '/members/profile/?demo=1', 1280, 'profile demo', (pg) => pg.waitForSelector('[data-state=ready]:not([hidden])'));
  await run(sample.origin, '/members/profile/?demo=1', 390, 'profile demo @390', (pg) => pg.waitForSelector('[data-state=ready]:not([hidden])'));
  for (const tab of ['roster', 'review', 'board', 'export']) {
    await run(sample.origin, '/members/admin/?demo=1', 1280, `admin demo ${tab}`, async (pg) => {
      await pg.waitForSelector('[data-state=ready]:not([hidden])');
      await pg.click(`#tab-${tab}`);
      await pg.waitForTimeout(300);
    });
  }
  sample.close();
  await browser.close();
}

// ---------- Headshot crop in the browser (profile demo, sample build) ----------
async function headshotCrop(sampleDir) {
  console.log('\n== headshot crop (profile demo) ==');
  // A tall test photo: top half red, bottom half blue.
  const blue = await sharp({ create: { width: 600, height: 600, channels: 3, background: '#0000ff' } }).png().toBuffer();
  const tall = await sharp({ create: { width: 600, height: 1200, channels: 3, background: '#ff0000' } }).composite([{ input: blue, top: 600, left: 0 }]).png().toBuffer();
  const big = await sharp({ create: { width: 3000, height: 3000, channels: 3, background: '#228855' } }).jpeg().toBuffer();
  const site = await serve(sampleDir);
  const browser = await loadPlaywright().chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(site.origin + '/members/profile/?demo=1', { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-state=ready]:not([hidden])');
    const fresh = (prev) => page.waitForFunction((p) => { const i = document.querySelector('#headshot-preview'); return !!i && i.src.startsWith('blob:') && i.src !== p && i.complete && i.naturalWidth > 0; }, prev);
    const sample = () => page.evaluate(async () => {
      const img = document.querySelector('#headshot-preview');
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const px = (y) => Array.from(x.getImageData(Math.floor(c.width / 2), y, 1, 1).data.slice(0, 3));
      const blob = await (await fetch(img.src)).blob();
      return { w: c.width, h: c.height, top: px(4), bottom: px(c.height - 5), type: blob.type, bytes: blob.size, src: img.src };
    });
    const isRed = (p) => p[0] > 180 && p[2] < 80, isBlue = (p) => p[2] > 180 && p[0] < 80;
    await page.setInputFiles('#headshot', { name: 'tall.png', mimeType: 'image/png', buffer: tall });
    await fresh('');
    const a = await sample();
    ok(a.w === 600 && a.h === 600, 'crop', `a 600px-wide photo must stay 600px, got ${a.w}x${a.h}`);
    ok(isRed(a.top) && isRed(a.bottom), 'crop', 'a tall photo must be cropped from the top by default');
    ok(a.type === 'image/webp' && a.bytes <= 1024 * 1024, 'crop', `stored photo must be WebP under 1 MB, got ${a.type} ${a.bytes}`);
    ok(await page.isVisible('#headshot-pos-row'), 'crop', 'the position slider must appear for a tall photo');
    await page.evaluate(() => { const s = document.querySelector('#headshot-pos'); s.value = '100'; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); });
    await fresh(a.src);
    const b = await sample();
    ok(isBlue(b.top) && isBlue(b.bottom), 'crop', 'moving the slider to the end must show the bottom of the photo');
    await page.setInputFiles('#headshot', { name: 'big.jpg', mimeType: 'image/jpeg', buffer: big });
    await fresh(b.src);
    const c = await sample();
    ok(c.w === 1200 && c.h === 1200, 'crop', `a large photo must be stored at 1200px, got ${c.w}x${c.h}`);
    ok(!(await page.isVisible('#headshot-pos-row')), 'crop', 'no position slider for a square photo');
  } finally { await browser.close(); site.close(); }
}

// ---------- Supabase build path against a local mock server ----------
async function supabaseBuild() {
  console.log('\n== supabase build path (mock server) ==');
  const ID1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ID2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ID3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const webp = await sharp({ create: { width: 1000, height: 1000, channels: 3, background: '#336699' } }).webp().toBuffer();
  // Safari uploads JPEG data under a name that still ends in .webp; the build must convert it.
  const jpeg = await sharp({ create: { width: 900, height: 900, channels: 3, background: '#996633' } }).jpeg().toBuffer();
  const log = [];
  let mode = 'ok';
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    log.push(path);
    const json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (path === '/rest/v1/public_profiles') {
      if (mode === 'fail') { res.statusCode = 500; return res.end('boom'); }
      return json([
        { profile_id: ID1, full_name: 'Mock Board Person', class_year: 2027, school: 'Mock School', major: 'Mock Major', linkedin_url: 'https://www.linkedin.com/in/mock-person', headshot_path: `${ID1}/abc123.webp`, board_title: 'Mock President', sort_order: 1 },
        { profile_id: ID3, full_name: 'Mock Safari Person', class_year: 2028, school: null, major: null, linkedin_url: null, headshot_path: `${ID3}/fromsafari.webp`, board_title: null, sort_order: null },
        { profile_id: ID2, full_name: 'Mock Member Two', class_year: 2028, school: null, major: null, linkedin_url: null, headshot_path: `${ID2}/broken.webp`, board_title: null, sort_order: null },
      ]);
    }
    if (path === '/rest/v1/public_placements') return json([
      { firm: 'Mock Firm One', team: 'Mock Group', kind: 'internship', year: 2026, member_name: 'Mock Board Person', class_year: 2027 },
      { firm: 'Mock Firm Two', team: null, kind: 'full_time', year: 2025, member_name: null, class_year: null },
    ]);
    if (path === `/storage/v1/object/public/headshots/${ID1}/abc123.webp`) { res.setHeader('content-type', 'image/webp'); return res.end(webp); }
    if (path === `/storage/v1/object/public/headshots/${ID3}/fromsafari.webp`) { res.setHeader('content-type', 'image/jpeg'); return res.end(jpeg); }
    res.statusCode = 404; res.end('not found');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const mockOrigin = `http://127.0.0.1:${server.address().port}`;
  const env = { PUBLIC_SUPABASE_URL: mockOrigin, PUBLIC_SUPABASE_ANON_KEY: 'mock-anon-key', SEARCH_VISIBLE: '1' };
  try {
    // A failed REST fetch must fail the build loudly.
    mode = 'fail';
    const bad = await run('node', ['scripts/prebuild.mjs'], { ...process.env, ...env });
    ok(bad.status !== 0, 'supabase', 'prebuild must fail when the REST fetch fails');
    mode = 'ok';
    const pre = await run('node', ['scripts/prebuild.mjs'], { ...process.env, ...env });
    ok(pre.status === 0 && /2 headshot/.test(pre.stdout), 'supabase', 'prebuild should download exactly two headshots (one WebP, one JPEG from Safari)');
    ok(new RegExp(`WARNING headshot for ${ID2}`).test(pre.stderr), 'supabase', 'a failed image download should print a warning');
    const dir = await build('supabase', env);
    if (!dir) return;
    checkVariant('supabase mock data', dir, { data: true });
    ok(existsSync(join(dir, 'headshots', `${ID1}.webp`)), 'supabase', 'headshot file missing from dist');
    ok(!existsSync(join(dir, 'headshots', `${ID2}.webp`)), 'supabase', 'failed headshot must not be shipped');
    const team = readFileSync(join(dir, 'board/index.html'), 'utf8');
    ok(team.includes('Mock Board Person') && team.includes('Mock President') && team.includes('Mock Member Two'), 'supabase', 'Board page lacks mock data');
    ok(team.includes('Mock Major') && !team.includes('Mock School'), 'supabase', 'profiles must show the major and never the school');
    const imgTag = (team.match(new RegExp(`<img[^>]*src="/headshots/${ID1}\\.webp"[^>]*>`)) || [''])[0];
    ok(/width="1000"/.test(imgTag) && /height="1000"/.test(imgTag), 'supabase', 'headshot img must carry the real width and height');
    ok(imgTag.includes(`/headshots/${ID1}-600.webp 600w`) && imgTag.includes(`/headshots/${ID1}.webp 1000w`) && /sizes="/.test(imgTag), 'supabase', 'headshot img must offer the 600px copy');
    ok(existsSync(join(dir, 'headshots', `${ID1}-600.webp`)), 'supabase', '600px headshot copy missing from dist');
    const safari = existsSync(join(dir, 'headshots', `${ID3}.webp`)) ? readFileSync(join(dir, 'headshots', `${ID3}.webp`)) : Buffer.alloc(12);
    ok(safari.subarray(0, 4).toString() === 'RIFF' && safari.subarray(8, 12).toString() === 'WEBP', 'supabase', 'a JPEG upload must be converted to WebP at build time');
    ok(/Initials avatar for Mock Member Two/.test(team), 'supabase', 'failed headshot should fall back to the initials avatar');
    ok(/"@type":"Person"/.test(team) && /"jobTitle":"Mock President"/.test(team), 'supabase', 'Person JSON-LD missing');
    const pl = readFileSync(join(dir, 'placements/index.html'), 'utf8');
    ok(pl.includes('Mock Firm One') && pl.includes('Mock Group') && pl.includes('Mock Firm Two') && pl.includes('Mock Board Person'), 'supabase', 'Placements page lacks mock data');
    // No Supabase address in any public HTML outside the members area.
    for (const p of pagePaths(dir)) {
      if (p.startsWith('/members/') && !p.includes('resume-guide')) continue;
      ok(!readFileSync(join(dir, p, p.endsWith('.html') ? '' : 'index.html'), 'utf8').includes(mockOrigin), `supabase:${p}`, 'Supabase address appears in public HTML');
    }
    // View time: loading the public pages must not touch the mock server.
    log.length = 0;
    const site = await serve(dir);
    const browser = await loadPlaywright().chromium.launch();
    const page = await browser.newPage();
    const external = [];
    page.on('request', (r) => { if (r.url().startsWith(mockOrigin)) external.push(r.url()); });
    for (const p of pagePaths(dir)) {
      if (p.startsWith('/members/') && !p.includes('resume-guide')) continue;
      await page.goto(site.origin + p, { waitUntil: 'networkidle' });
    }
    await browser.close(); site.close();
    ok(log.length === 0 && external.length === 0, 'supabase', `public pages contacted Supabase at view time: ${[...log, ...external].join(', ')}`);
  } finally { server.close(); }
}

// ---------- Playwright smoke test on the production build ----------
async function smoke(dir) {
  console.log('\n== smoke (Playwright, production build) ==');
  const pw = loadPlaywright();
  const srv = await serve(dir);
  const server = { close: srv.close };
  const origin = srv.origin;
  const pages = pagePaths(dir);
  const publicPages = pages.filter((p) => !/\/members\/(profile|admin)?\/?$/.test(p) && !p.includes('404'));
  const browser = await pw.chromium.launch();
  try {
    for (const width of [360, 1440]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      for (const p of pages) {
        await page.goto(origin + p, { waitUntil: 'load' });
        const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
        ok(o.sw <= o.iw, `smoke:${p}@${width}`, `horizontal overflow (${o.sw} > ${o.iw})`);
      }
      await ctx.close();
    }
    // Header must fit on one row at common desktop widths (hamburger takes over below 1401px).
    for (const width of [1401, 1440, 1600, 1920]) {
      const hc = await browser.newContext({ viewport: { width, height: 900 } });
      const hp = await hc.newPage();
      await hp.goto(origin + '/', { waitUntil: 'load' });
      const m = await hp.evaluate(() => { const h = document.querySelector('.header-inner'); const n = document.querySelector('.nav'); return { sw: h.scrollWidth, cw: h.clientWidth, h: h.getBoundingClientRect().height, nav: n.getBoundingClientRect().height }; });
      ok(m.sw <= m.cw + 1 && m.h < 130 && m.nav < 70, `smoke:header@${width}`, `header does not fit (scroll ${m.sw} > ${m.cw}, height ${m.h})`);
      await hc.close();
    }
    // Mobile nav with the keyboard
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(origin + '/', { waitUntil: 'load' });
    const toggle = page.locator('.nav-toggle');
    ok(await toggle.isVisible(), 'smoke:nav', 'mobile toggle not visible');
    ok(!(await page.locator('#site-nav').isVisible()), 'smoke:nav', 'nav should start closed on mobile');
    await toggle.focus();
    await page.keyboard.press('Enter');
    ok((await toggle.getAttribute('aria-expanded')) === 'true' && await page.locator('#site-nav').isVisible(), 'smoke:nav', 'Enter should open the menu');
    await page.keyboard.press('Escape');
    ok((await toggle.getAttribute('aria-expanded')) === 'false' && !(await page.locator('#site-nav').isVisible()), 'smoke:nav', 'Escape should close the menu');
    ok(await page.evaluate(() => document.activeElement?.classList.contains('nav-toggle')), 'smoke:nav', 'focus should return to the toggle');
    await page.keyboard.press('Space');
    ok((await toggle.getAttribute('aria-expanded')) === 'true', 'smoke:nav', 'Space should open the menu');
    await page.keyboard.press('Space');
    ok((await toggle.getAttribute('aria-expanded')) === 'false', 'smoke:nav', 'Space should close the menu');
    await ctx.close();
    // JavaScript disabled: main text still present
    const nojs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
    const np = await nojs.newPage();
    for (const p of publicPages) {
      await np.goto(origin + p, { waitUntil: 'load' });
      const t = await np.locator('main').innerText();
      const h1 = await np.locator('h1').innerText();
      ok(t.length > 150 && t.includes(h1), `smoke:nojs:${p}`, `main text missing without JavaScript (${t.length} chars)`);
      ok(await np.locator('main h1').isVisible(), `smoke:nojs:${p}`, 'h1 not visible without JS');
    }
    await nojs.close();
  } finally { await browser.close(); server.close(); }
}

const prod = await build('prod', { SEARCH_VISIBLE: '1' });
if (prod) checkVariant('production', prod, {});
const based = await build('base', { BASE_PATH: '/msi-site/', SITE_URL: 'https://example.github.io', SEARCH_VISIBLE: '1' });
if (based) checkVariant('base-path /msi-site/', based, { base: '/msi-site/' });
const sampled = await build('sample', { SAMPLE_DATA: '1', SEARCH_VISIBLE: '1' });
if (sampled) checkVariant('sample data', sampled, { sample: true });
if (prod && sampled) await a11y(prod, sampled);
if (sampled) await headshotCrop(sampled);
// Soft launch: with the search switch off, every page must ask search engines not to list it.
const soft = await build('soft', { SEARCH_VISIBLE: '0' });
if (soft) {
  console.log('\n== soft launch (hidden from search) ==');
  for (const f of walk(soft).filter((p) => p.endsWith('.html'))) {
    ok(/<meta name="robots" content="noindex/.test(readFileSync(f, 'utf8')), 'soft launch', `${f.slice(soft.length)} must be noindex`);
  }
  const robots = readFileSync(join(soft, 'robots.txt'), 'utf8');
  ok(/Allow: \//.test(robots) && !/Disallow: \/\s/.test(robots), 'soft launch', 'robots.txt still allows crawling');
}
await supabaseBuild();
// Leave no mock headshots behind for later builds.
spawnSync('node', ['scripts/prebuild.mjs'], { env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('PUBLIC_SUPABASE'))) });
if (prod) await smoke(prod);
console.log(`\n${checks} checks, ${failures} failed`);
if (failures) { console.error('SITE TESTS FAILED'); process.exit(1); }
console.log('SITE TESTS PASSED');
