// Site tests: builds several variants (production, BASE_PATH=/msi-site/, SAMPLE_DATA=1, soft launch, Supabase mock with and
// without the contact form), checks every HTML file, then runs Playwright tests in a real browser. Run: npm test
import { spawn, spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { readdirSync, readFileSync, existsSync, rmSync, statSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { join, extname, resolve } from 'node:path';

// The firm list lives in src/data/firms.ts. It is read as text so the test needs no TypeScript step.
const firmsSource = readFileSync('src/data/firms.ts', 'utf8');
const FIRM_GROUPS = [...firmsSource.matchAll(/title:\s*'([^']+)',\s*firms:\s*\[([\s\S]*?)\n\s*\],/g)].map((m) => ({ title: m[1], names: [...m[2].matchAll(/name:\s*'([^']+)'/g)].map((n) => n[1]) }));
const FIRM_NAMES = FIRM_GROUPS.flatMap((g) => g.names);

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

function checkVariant(name, dir, { base = '/', sample = false, data = false, contact = false }) {
  const hasData = sample || data;
  console.log(`\n== ${name} ==`);
  const files = walk(dir);
  const pages = files.filter((f) => f.endsWith('.html'));
  ok(pages.length >= 10, name, `expected at least 10 HTML pages, found ${pages.length}`);
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
    const isHome = rel === '/';
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
    ok(/<main[\s>]/.test(html), w, 'missing main landmark');
    // The home page is a one-screen landing page with no site header or footer; every other page has both.
    if (isHome) ok(!/site-header/.test(html) && !/site-footer/.test(html) && !/<header[\s>]/.test(html) && !/<footer[\s>]/.test(html), w, 'home must have no site header or footer');
    else ok(/<header[\s>]/.test(html) && /<footer[\s>]/.test(html) && /site-header/.test(html) && /site-footer/.test(html), w, 'inner page needs header and footer');
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
    if (isHome) ok(text.includes('not an official unit') && text.includes('investment advice'), w, 'home small print missing');
    else {
      ok(text.includes(DISCLAIMER), w, 'footer disclaimer missing');
      ok(/Founded in 2019 as the Michigan Impact Investing Symposium\./.test(text), w, 'footer history line missing');
    }
    ok(!/lorem|TODO|\[CONFIRM\]/i.test(text), w, 'placeholder text found');
    ok(!/[\[\]]/.test(text), w, 'square-bracket placeholder in text');
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
    if (rel.includes('/members/')) ok(/noindex/.test(robots), w, 'members page must be noindex');
    ok(rel === '/404.html' || !html.includes('undefined'), w, 'literal "undefined" in page');
  }

  // Nav rules. Inner pages have the site header; the home page has its own landing navigation instead.
  const SECTIONS = ['Who We Are', 'Placements', 'Leadership', 'Recruitment'];
  const SECTION_PATHS = ['who-we-are/', 'placements/', 'leadership/', 'recruitment/'];
  const home = htmlOf.get(join(dir, 'index.html'));
  for (const [p, html] of htmlOf) {
    if (pathOfFile(p) === '/') continue;
    const n = /<nav class="nav"[\s\S]*?<\/nav>/.exec(html);
    const l = n ? [...n[0].matchAll(/<li><a [^>]*>([^<]+)<\/a><\/li>/g)].map((m) => m[1]).join('|') : '';
    ok(l === SECTIONS.join('|'), `${name}:nav`, `${pathOfFile(p)} nav is "${l}"`);
  }
  ok(!existsSync(join(dir, 'about')) && !existsSync(join(dir, 'team')), name, 'About and Team pages must not exist');
  for (const gone of ['sustainable-investing', 'program', 'employers', 'board', 'join']) ok(!existsSync(join(dir, gone)), name, `/${gone}/ must not exist`);
  for (const here of ['who-we-are', 'placements', 'leadership', 'recruitment']) ok(existsSync(join(dir, here, 'index.html')), name, `/${here}/ must exist`);
  const gonePaths = /href="[^"]*\/(sustainable-investing|program|employers|board|join)\/[^"]*"/;
  ok(![...htmlOf.values()].some((h) => gonePaths.test(h)), name, 'a page still links to a deleted section');
  // The résumé guide is gone: no page, no link.
  ok(!existsSync(join(dir, 'members', 'resume-guide')), name, 'the resume guide page must not exist');
  ok(![...htmlOf.values()].some((h) => /resume-guide|Résumé and LinkedIn guide/.test(h)), name, 'a page still mentions the resume guide');

  // Home page: one screen, no header or footer, its own navigation.
  const homeText = visibleText(home);
  const homeH1s = [...home.matchAll(/<h1[\s>][\s\S]*?<\/h1>/g)].map((m) => visibleText(m[0]));
  ok(homeH1s.length === 1 && homeH1s[0].includes('Michigan Sustainable Investments'), name, `home needs exactly one h1 with the club name (got ${homeH1s.join(' / ')})`);
  const landingNav = /<nav class="landing-nav"[\s\S]*?<\/nav>/.exec(home);
  ok(!!landingNav, name, 'home landing navigation missing');
  const landingLinks = landingNav ? [...landingNav[0].matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({ href: decode(m[1]), label: visibleText(m[2]) })) : [];
  ok(landingLinks.map((l) => l.label).join('|') === SECTIONS.join('|'), name, `landing nav must list ${SECTIONS.join(', ')} in order (got ${landingLinks.map((l) => l.label).join(', ')})`);
  ok(landingLinks.every((l, i) => l.href === base + SECTION_PATHS[i]), name, 'landing nav links point at the wrong pages');
  ok(new RegExp(`<a [^>]*href="${base}recruitment/"[^>]*>\\s*Apply\\s*</a>`).test(home), name, 'home needs an Apply link to recruitment/');
  ok(homeText.includes('not an official unit') && homeText.includes('investment advice'), name, 'home small print needs the not-official and not-advice lines');
  ok(new RegExp(`<p class="landing-legal">[\\s\\S]*<a [^>]*href="${base}privacy/"[^>]*>Privacy</a>`).test(home), name, 'home small print needs a Privacy link');
  // Member sign-in is reachable from the home page in both states: the second button, or the small print.
  ok(new RegExp(`<a [^>]*href="${base}members/"[^>]*>Member sign-in</a>`).test(home), name, 'home needs a Member sign-in link');
  if (contact) {
    ok(new RegExp(`<a [^>]*href="${base}contact/"[^>]*>Contact us</a>`).test(home), name, 'home needs the Contact us button when the form is ready');
    ok(/<p class="landing-legal">[\s\S]*Member sign-in/.test(home), name, 'member sign-in belongs in the small print when the form is ready');
  } else {
    ok(!/Contact us/.test(home) && !new RegExp(`href="${base}contact/"`).test(home), name, 'home must not mention contact when the form is not ready');
    ok(!/<p class="landing-legal">[\s\S]*Member sign-in/.test(home), name, 'member sign-in is the second button, not in the small print, when the form is not ready');
  }
  ok(!/Where members go|<h2>Leadership<\/h2>|What members do|Who has spoken/.test(home), name, 'home is one screen: no section blocks');

  // Footer on an inner page.
  const foot = /<footer[\s\S]*?<\/footer>/.exec(htmlOf.get(join(dir, 'privacy/index.html')))[0];
  const footLabels = [...foot.matchAll(/<li><a [^>]*>([^<]+)<\/a><\/li>/g)].map((m) => m[1]);
  const wantFoot = [...SECTIONS, ...(contact ? ['Contact'] : []), 'Privacy'];
  ok(footLabels.slice(0, wantFoot.length).join('|') === wantFoot.join('|') && footLabels.length === wantFoot.length, name, `footer links must be ${wantFoot.join(', ')} (got ${footLabels.join(', ')})`);

  // Contact page: exists, is linked and is in the sitemap only when the form is ready.
  ok(existsSync(join(dir, 'contact', 'index.html')) === contact, name, contact ? '/contact/ must exist when the form is ready' : '/contact/ must not exist when the form is not ready');
  const linksToContact = [...htmlOf.values()].some((h) => new RegExp(`href="${base}contact/"`).test(h));
  ok(linksToContact === contact, name, contact ? 'nothing links to /contact/' : 'a page links to /contact/ although the form is not ready');
  if (contact) {
    const c = htmlOf.get(join(dir, 'contact/index.html'));
    ok(/<h1[^>]*>Contact<\/h1>/.test(c) && visibleText(c).includes('Send the MSI board a message.'), name, 'contact page heading or lead');
    ok(/<title>Contact \| Michigan Sustainable Investments<\/title>/.test(c), name, 'contact page title');
    ok(/<noscript>/.test(c) && /needs JavaScript/.test(c), name, 'contact page needs a noscript notice');
    ok(/name="trap"/.test(c) && /tabindex="-1"/.test(c) && /Leave this field empty/.test(c), name, 'contact page trap field');
    ok(/class="trap" aria-hidden="true"/.test(c), name, 'the trap field wrapper must be aria-hidden');
    ok(/<option value="" selected>/.test(c) && ['recruiting', 'speaking', 'joining', 'other'].every((v) => c.includes(`<option value="${v}">`)), name, 'contact topics');
    ok(/Your message goes to the MSI board\. See <a [^>]*href="[^"]*privacy\/"/.test(c), name, 'contact page privacy line');
  }
  const wwa = visibleText(htmlOf.get(join(dir, 'who-we-are/index.html')));
  ok(['What we do', 'The program', 'Investing education', 'Hands-on projects', 'Professional development', 'Speakers and the Symposium', 'Who has spoken at MSI', 'Sustainable finance is a way into banking', 'Where the work happens'].every((h) => wwa.includes(h)), name, 'who-we-are sections');
  ok(!/For employers and speakers|Speak to members|Meet members|Support the symposium/.test(wwa), name, 'the employers section must be gone from Who We Are');

  // Placements: logo wall.
  const plHtml = htmlOf.get(join(dir, 'placements/index.html'));
  const plText = visibleText(plHtml);
  ok(/<h2 id="careers">Careers members prepare for<\/h2>/.test(plHtml) && (plHtml.match(/<li><strong>/g) || []).length === 4, name, 'placements careers section');
  ok(!/noindex/.test((/<meta name="robots" content="([^"]*)"/.exec(plHtml) || [])[1] || ''), name, 'placements must be indexable even when empty');
  ok(plText.includes('MSI alumni have gone on to work at these firms.'), name, 'placements intro line');
  ok(!/Internship and full-time offers accepted by MSI members|MSI publishes placements as members report them|sign in to add yours/i.test(plText), name, 'old placements lead, empty state or sign-in link is back');
  const groupHeads = [...plHtml.matchAll(/<h2>([^<]+)<\/h2>/g)].map((m) => decode(m[1]));
  ok(groupHeads.slice(0, 3).join('|') === 'Investment banks|Private equity and credit|Asset management', name, `placements groups (got ${groupHeads.join(', ')})`);
  ok(groupHeads.slice(0, 3).join('|') === FIRM_GROUPS.map((g) => g.title).join('|'), name, 'placements groups must match src/data/firms.ts');
  const tiles = [...plHtml.matchAll(/<li class="firm-tile">([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  ok(tiles.length === 24 && FIRM_NAMES.length === 24, name, `placements needs 24 firm tiles (page ${tiles.length}, list ${FIRM_NAMES.length})`);
  const alts = [];
  for (const t of tiles) {
    const img = /<img\b[^>]*>/.exec(t);
    if (!img) { alts.push(visibleText(t)); continue; }
    const alt = decode(attr(img[0], 'alt') || '');
    alts.push(alt);
    ok(alt.length > 0 && Number(attr(img[0], 'width')) > 0 && Number(attr(img[0], 'height')) > 0, name, `logo needs alt, width and height: ${img[0].slice(0, 80)}`);
    const src = decode(attr(img[0], 'src') || '');
    ok(src.startsWith(base + 'firms/') && existsSync(join(dir, src.slice(base.length))), name, `logo file missing from the build: ${src}`);
  }
  ok(alts.join('|') === FIRM_NAMES.join('|'), name, 'firm names on the page must match src/data/firms.ts, in order');
  ok(/trademarks of their owners/.test(plText), name, 'placements trademark note');
  const hasOffers = /<h2 class="offers-title">Offers by year<\/h2>/.test(plHtml);
  ok(hasOffers === hasData, name, hasData ? 'placements needs "Offers by year" when members reported offers' : 'placements must not show "Offers by year" without offers');
  if (hasData) ok(/<h3>20\d\d<\/h3>/.test(plHtml), name, 'offers need year headings');
  // Leadership: headings never skip a level.
  const ldHtml = htmlOf.get(join(dir, 'leadership/index.html'));
  const levels = [...ldHtml.replace(/<(script|style)[\s\S]*?<\/\1>/g, '').matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  ok(levels.every((v, i) => i === 0 ? v === 1 : v <= levels[i - 1] + 1), name, `leadership heading levels skip (${levels.join(',')})`);
  ok(!/Executive board<|MSI is run by its executive board/.test(ldHtml), name, 'old Leadership heading or lead sentence is back');
  if (hasData) ok(levels.includes(2), name, 'leadership cards need h2 headings');
  const recr = visibleText(htmlOf.get(join(dir, 'recruitment/index.html')));
  ok(/Leadership and Placements pages/.test(recr) && !/Board and Placements/.test(recr), name, 'recruitment FAQ wording');
  ok(!/Key facts|fact-num/.test(home), name, 'home facts strip must be gone');
  ok(!/students applied/.test(home + htmlOf.get(join(dir, 'recruitment/index.html'))), name, 'selectivity sentence must not show while empty');
  // JS bundles: demo code only in sample builds
  const js = walk(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(f, 'utf8')).join('\n');
  ok(sample === js.includes('sample.member'), name, sample ? 'demo mode missing from sample build' : 'demo/sample code compiled into production build');
  ok(!js.includes('Preview data'), name, 'banner text in JS');
  // sitemap / robots / llms
  const sm = existsSync(join(dir, 'sitemap-0.xml')) ? readFileSync(join(dir, 'sitemap-0.xml'), 'utf8') : '';
  ok(!sm.includes('resume-guide'), name, 'sitemap lists the removed resume guide');
  ok(sm.includes('/contact/') === contact, name, contact ? 'sitemap lacks /contact/' : 'sitemap lists /contact/ although the form is not ready');
  ok(!/\/members\/(profile|admin)?\/?<|\/members\/<|\/404/.test(sm), name, 'sitemap includes members area or 404');
  ok(hasData ? sm.includes('/leadership/') : !sm.includes('/leadership/'), name, 'sitemap leadership entry should follow data');
  ok(sm.includes('/placements/') && sm.includes('/who-we-are/') && sm.includes('/recruitment/') && !/\/(sustainable-investing|program|employers|board|join)\//.test(sm) && !sm.includes('/about/') && !sm.includes('/team/'), name, 'sitemap: four sections in (placements even when empty), deleted pages, about and team out');
  if (base !== '/') ok(sm.includes(base), name, 'sitemap lacks base path');
  ok(existsSync(join(dir, 'robots.txt')) && /Sitemap:/.test(readFileSync(join(dir, 'robots.txt'), 'utf8')), name, 'robots.txt with sitemap');
  const llms = readFileSync(join(dir, 'llms.txt'), 'utf8');
  ok(llms.includes('Michigan Sustainable Investments') && !MEMBER_COUNT.test(llms), name, 'llms.txt content');
  ok(!/resume-guide/i.test(llms), name, 'llms.txt mentions the removed guide');
  ok(/\[Contact\]\(/.test(llms) === contact, name, contact ? 'llms.txt lacks the Contact line' : 'llms.txt has a Contact line although the form is not ready');
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
  await run(prod.origin, '/recruitment/', 390, 'prod /recruitment/ @390');
  prod.close();
  const sample = await serve(sampleDir);
  for (const p of ['/', '/leadership/', '/placements/', '/who-we-are/', '/contact/', '/privacy/']) await run(sample.origin, p, 1280, `sample ${p}`);
  await run(sample.origin, '/contact/', 390, 'sample /contact/ @390');
  await run(sample.origin, '/', 390, 'sample / @390');
  await run(sample.origin, '/members/profile/?demo=1', 1280, 'profile demo', (pg) => pg.waitForSelector('[data-state=ready]:not([hidden])'));
  await run(sample.origin, '/members/profile/?demo=1', 390, 'profile demo @390', (pg) => pg.waitForSelector('[data-state=ready]:not([hidden])'));
  for (const tab of ['roster', 'review', 'board', 'messages', 'export']) {
    await run(sample.origin, '/members/admin/?demo=1', 1280, `admin demo ${tab}`, async (pg) => {
      // Two demo messages (one waiting, one handled) so the Messages tab is checked with cards on it.
      await pg.evaluate(() => sessionStorage.setItem('msi-demo-contact-messages', JSON.stringify([
        { id: 'a1', created_at: '2026-11-02T15:04:00Z', name: 'Sample Visitor', email: 'sample.visitor@example.com', organization: 'Sample Firm', topic: 'speaking', message: 'Line one.\nLine two.', handled_at: null, handled_by: null },
        { id: 'a2', created_at: '2026-11-01T15:04:00Z', name: 'Sample Visitor Two', email: 'sample.two@example.com', organization: '', topic: 'other', message: 'An older message.', handled_at: '2026-11-02T10:00:00Z', handled_by: 'sample.member.a@umich.edu' },
      ])));
      await pg.reload();
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

// ---------- Home page fits one screen ----------
// Window sizes the home page must fit without scrolling (width x height). Keep docs/CONTENT.md in step with this list.
const FIT_SIZES = [[2560, 1440], [1920, 1080], [1728, 1117], [1536, 864], [1440, 900], [1366, 768], [1366, 650], [1280, 720], [1280, 600], [1180, 820], [1024, 768], [1024, 600], [900, 700], [861, 640], [860, 1000], [820, 1180], [768, 1024], [430, 746], [414, 720], [412, 780], [393, 660], [390, 664], [375, 667], [360, 640]];
// So small that scrolling is allowed, but nothing may be cut off.
const SCROLL_OK_SIZES = [[320, 568], [844, 390]];
async function fitCheck(dir, label) {
  console.log(`\n== home page fits one screen (${label}) ==`);
  const site = await serve(dir);
  const browser = await loadPlaywright().chromium.launch();
  try {
    for (const [w, h] of [...FIT_SIZES, ...SCROLL_OK_SIZES]) {
      const scrollOk = SCROLL_OK_SIZES.some(([a, b]) => a === w && b === h);
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await ctx.newPage();
      await page.goto(site.origin + '/', { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(100);
      const m = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: window.innerHeight, sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      const where = `fit:${label}:${w}x${h}`;
      ok(m.sw <= m.iw, where, `horizontal overflow (${m.sw} > ${m.iw})`);
      if (!scrollOk) ok(m.sh <= m.ih, where, `home page scrolls (${m.sh} > ${m.ih})`);
      else {
        // Scrolling is allowed; check that every piece is reachable and inside the window sideways.
        const privacy = page.locator('.landing-legal a', { hasText: 'Privacy' });
        await privacy.scrollIntoViewIfNeeded();
        const r = await page.evaluate(() => {
          const box = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
          const priv = [...document.querySelectorAll('.landing-legal a')].find((a) => a.textContent.trim() === 'Privacy');
          const parts = [...document.querySelectorAll('.landing h1, .landing-nav a, .landing-legal, .landing .btn')].map(box);
          return { priv: box(priv), sideways: parts.every((b) => b.l >= -0.5 && b.r <= window.innerWidth + 0.5), ih: window.innerHeight };
        });
        ok(r.priv.t >= 0 && r.priv.b <= r.ih + 1, where, 'the Privacy link cannot be scrolled into view');
        ok(r.sideways, where, 'something on the home page is cut off at the side');
      }
      await ctx.close();
    }
  } finally { await browser.close(); site.close(); }
}

// ---------- Contact form in a real browser ----------
const VALID = { name: 'Sample Visitor', email: 'sample.visitor@example.com', organization: 'Sample Organization', topic: 'speaking', message: 'We would like to send a speaker to a meeting.' };
async function fillForm(page, v = VALID, trap = '') {
  await page.fill('#c-name', v.name);
  await page.fill('#c-email', v.email);
  await page.fill('#c-organization', v.organization);
  await page.selectOption('#c-topic', v.topic);
  await page.fill('#c-message', v.message);
  if (trap) await page.fill('#c-trap', trap);
}
// Real-database mode: the page posts to Supabase. The browser's request is answered here, so nothing leaves the machine.
async function contactMock(dir, mockOrigin, key, { full = true } = {}) {
  console.log(`\n== contact form in the browser (${full ? 'full' : 'headers only'}, key ${key.startsWith('eyJ') ? 'JWT-style' : 'publishable-style'}) ==`);
  const site = await serve(dir);
  const browser = await loadPlaywright().chromium.launch();
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
  try {
    const session = async () => {
      const requests = [];
      const reply = { status: 204, body: '', delay: 0, abort: false };
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await ctx.route(`${mockOrigin}/**`, async (route) => {
        const req = route.request();
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
        requests.push({ url: req.url(), headers: req.headers(), body: req.postDataJSON() });
        if (reply.delay) await new Promise((r) => setTimeout(r, reply.delay));
        if (reply.abort) return route.abort('failed');
        return route.fulfill({ status: reply.status, headers: { ...cors, 'content-type': 'application/json' }, body: reply.body });
      });
      const page = await ctx.newPage();
      await page.goto(site.origin + '/contact/', { waitUntil: 'load' });
      return { page, ctx, requests, reply };
    };
    // A valid submit: exactly one request, right body and headers, then the confirmation.
    {
      const { page, ctx, requests, reply } = await session();
      reply.delay = 500;
      await fillForm(page);
      await page.click('#contact-send');
      await page.waitForFunction(() => document.querySelector('#contact-send').textContent === 'Sending…');
      ok(await page.locator('#contact-send').isDisabled(), 'contact', 'the button must be disabled while sending');
      await page.locator('#contact-send').click({ force: true, timeout: 500 }).catch(() => {});
      await page.waitForSelector('#contact-done:not([hidden])');
      ok(requests.length === 1, 'contact', `a valid submit must send exactly one request (sent ${requests.length})`);
      const r = requests[0];
      ok(r.url === `${mockOrigin}/rest/v1/rpc/send_contact_message`, 'contact', `request address (${r.url})`);
      ok(JSON.stringify(r.body) === JSON.stringify({ p_name: VALID.name, p_email: VALID.email, p_organization: VALID.organization, p_topic: 'speaking', p_message: VALID.message, p_trap: '' }), 'contact', `request body (${JSON.stringify(r.body)})`);
      ok(r.headers.apikey === key && /^application\/json/.test(r.headers['content-type']), 'contact', 'request needs the apikey and a JSON content type');
      if (key.startsWith('eyJ')) ok(r.headers.authorization === `Bearer ${key}`, 'contact', 'a JWT-style key must also be sent as a bearer token');
      else ok(!('authorization' in r.headers), 'contact', 'a publishable-style key must not be sent as a bearer token');
      if (full) {
        ok(await page.locator('#contact-form').isHidden(), 'contact', 'the form must be replaced by the confirmation');
        ok((await page.locator('#contact-done').innerText()).includes('Your message has been sent to the MSI board.'), 'contact', 'confirmation text');
        ok(await page.evaluate(() => document.activeElement?.id === 'contact-done') && (await page.getAttribute('#contact-done', 'role')) === 'status', 'contact', 'the confirmation must be a status region with focus');
        ok((await page.getAttribute('#contact-done a', 'href')) === '/', 'contact', 'confirmation needs a link back to the home page');
      }
      await ctx.close();
    }
    if (!full) return;
    // Empty submit: field errors, focus on the first, nothing sent.
    {
      const { page, ctx, requests } = await session();
      await page.click('#contact-send');
      await page.waitForTimeout(150);
      ok(requests.length === 0, 'contact', 'an empty form must send nothing');
      for (const f of ['name', 'email', 'topic', 'message']) {
        ok((await page.getAttribute(`#c-${f}`, 'aria-invalid')) === 'true' && (await page.locator(`#c-${f}-err`).innerText()).length > 0, 'contact', `empty submit must mark ${f}`);
        ok((await page.getAttribute(`#c-${f}`, 'aria-describedby')).includes(`c-${f}-err`), 'contact', `${f} must point at its error`);
      }
      ok((await page.getAttribute('#c-organization', 'aria-invalid')) === null, 'contact', 'the optional organization field is not an error when empty');
      ok(await page.evaluate(() => document.activeElement?.id === 'c-name'), 'contact', 'focus must go to the first field in error');
      ok(await page.locator('#contact-summary').isVisible(), 'contact', 'an error summary must show');
      await page.fill('#c-name', 'Sample Visitor');
      await page.fill('#c-email', 'not-an-email');
      await page.selectOption('#c-topic', 'other');
      await page.fill('#c-message', 'too short');
      await page.click('#contact-send');
      ok(requests.length === 0 && (await page.getAttribute('#c-email', 'aria-invalid')) === 'true' && (await page.getAttribute('#c-message', 'aria-invalid')) === 'true' && (await page.getAttribute('#c-name', 'aria-invalid')) === null, 'contact', 'a bad email and a short message must be refused before sending');
      await ctx.close();
    }
    // The hidden trap field is passed through.
    {
      const { page, ctx, requests } = await session();
      ok(await page.evaluate(() => { const t = document.querySelector('#c-trap'); const r = t.getBoundingClientRect(); return r.right < 0 || r.left > window.innerWidth; }), 'contact', 'the trap field must sit off screen');
      await fillForm(page, VALID, 'robot');
      await page.click('#contact-send');
      await page.waitForSelector('#contact-done:not([hidden])');
      ok(requests.length === 1 && requests[0].body.p_trap === 'robot', 'contact', 'a filled trap field must be sent as p_trap');
      await ctx.close();
    }
    // Refusals and failures keep what the person typed.
    const refusals = [
      ['daily limit', { status: 400, body: JSON.stringify({ message: 'contact_limit_sender' }) }, '#contact-summary', 'You have sent three messages today. Try again tomorrow.'],
      ['busy', { status: 400, body: JSON.stringify({ message: 'contact_limit_busy' }) }, '#contact-summary', 'The form is busy. Try again in an hour.'],
      ['server error', { status: 500, body: 'boom' }, '#contact-summary', 'Your message was not sent. Check your connection and try again.'],
      ['unknown 400', { status: 400, body: JSON.stringify({ message: 'something_else' }) }, '#contact-summary', 'Your message was not sent. Check your connection and try again.'],
      ['network failure', { abort: true }, '#contact-summary', 'Your message was not sent. Check your connection and try again.'],
    ];
    for (const [label, r, sel, text] of refusals) {
      const { page, ctx, requests, reply } = await session();
      Object.assign(reply, r);
      await fillForm(page);
      await page.click('#contact-send');
      await page.waitForFunction((s) => !document.querySelector(s).hidden, sel);
      ok((await page.locator(sel).innerText()).trim() === text, `contact:${label}`, `wrong sentence: ${await page.locator(sel).innerText()}`);
      ok((await page.inputValue('#c-message')) === VALID.message && (await page.inputValue('#c-name')) === VALID.name && (await page.inputValue('#c-email')) === VALID.email && (await page.inputValue('#c-topic')) === 'speaking', `contact:${label}`, 'typed text must be kept');
      ok(await page.locator('#contact-form').isVisible() && await page.locator('#contact-send').isEnabled() && (await page.locator('#contact-send').innerText()) === 'Send message', `contact:${label}`, 'the form must stay usable after a failure');
      ok(requests.length === 1, `contact:${label}`, 'one request expected');
      await ctx.close();
    }
    for (const code of ['name', 'email', 'organization', 'topic', 'message']) {
      const { page, ctx, reply } = await session();
      reply.status = 400; reply.body = JSON.stringify({ message: `contact_${code}` });
      await fillForm(page);
      await page.click('#contact-send');
      await page.waitForSelector(`#c-${code}[aria-invalid=true]`);
      ok((await page.locator(`#c-${code}-err`).innerText()).length > 0 && await page.evaluate((c) => document.activeElement?.id === `c-${c}`, code), `contact:${code}`, 'a refused field must be marked, described and focused');
      ok((await page.inputValue('#c-message')) === VALID.message, `contact:${code}`, 'typed text must be kept');
      await ctx.close();
    }
    // Without JavaScript the form says it cannot send, and the page does not overflow at phone and desktop width.
    const nojs = await browser.newContext({ javaScriptEnabled: false });
    const np = await nojs.newPage();
    await np.goto(site.origin + '/contact/', { waitUntil: 'load' });
    ok((await np.locator('main').innerText()).includes('needs JavaScript'), 'contact', 'the no-JavaScript notice must show');
    await nojs.close();
    for (const width of [360, 1440]) {
      const c = await browser.newContext({ viewport: { width, height: 900 } });
      const pg = await c.newPage();
      await pg.goto(site.origin + '/contact/', { waitUntil: 'load' });
      const o = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      ok(o.sw <= o.iw, `contact@${width}`, `horizontal overflow (${o.sw} > ${o.iw})`);
      await c.close();
    }
  } finally { await browser.close(); site.close(); }
}

// Demo mode (sample build, no Supabase settings): sending makes no network call, and the message shows up on the demo admin page.
async function contactDemo(dir) {
  console.log('\n== contact form in demo mode (sample build) ==');
  const site = await serve(dir);
  const browser = await loadPlaywright().chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const outside = [];
    page.on('request', (r) => { if (!r.url().startsWith(site.origin) && !r.url().startsWith('data:')) outside.push(r.url()); if (/\/rest\/|rpc/.test(r.url())) outside.push(r.url()); });
    await page.goto(site.origin + '/contact/', { waitUntil: 'networkidle' });
    const tricky = '<img src=x onerror="window.__xss=1">';
    await fillForm(page, { ...VALID, name: tricky, message: `${tricky}\nSecond line of the message.` });
    await page.click('#contact-send');
    await page.waitForSelector('#contact-done:not([hidden])');
    ok(outside.length === 0, 'contact demo', `demo mode must not call the network (${outside.join(', ')})`);
    await page.goto(site.origin + '/members/admin/?demo=1', { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-state=ready]:not([hidden])');
    await page.waitForFunction(() => document.querySelector('#tab-messages').textContent === 'Messages (1)');
    await page.click('#tab-messages');
    const card = page.locator('#messages-list .review-card');
    await card.first().waitFor();
    ok((await card.count()) === 1, 'contact demo', 'the sent message must show on the Messages tab');
    const text = await card.first().innerText();
    ok(text.includes(tricky) && text.includes('Second line of the message.') && text.includes('Sample Organization') && text.includes('Speaking at MSI') && text.includes('New'), 'contact demo', `card content: ${text}`);
    ok(await page.evaluate(() => !window.__xss && !document.querySelector('#messages-list img')), 'contact demo', 'message text must never be treated as HTML');
    ok((await page.getAttribute('#messages-list a[href^="mailto:"]', 'href')) === 'mailto:sample.visitor%40example.com', 'contact demo', 'the email must be a mailto link');
    ok(await page.evaluate(() => getComputedStyle(document.querySelector('.message-text')).whiteSpace === 'pre-wrap'), 'contact demo', 'line breaks in the message must be kept');
    await page.click('#messages-list button:text-is("Mark handled")');
    await page.waitForSelector('#messages-list .tag:not(.tag-new)');
    ok((await card.first().innerText()).includes('Handled') && (await page.innerText('#tab-messages')) === 'Messages', 'contact demo', 'Mark handled must change the tag and the tab count');
    await page.click('#messages-list button:text-is("Reopen")');
    await page.waitForSelector('#messages-list .tag-new');
    ok((await page.innerText('#tab-messages')) === 'Messages (1)', 'contact demo', 'Reopen must bring the count back');
    // A bad address never becomes a link.
    await page.evaluate(() => sessionStorage.setItem('msi-demo-contact-messages', JSON.stringify([{ id: 'x1', created_at: '2026-11-02T15:04:00Z', name: 'Bad Address', email: 'x" onmouseover="1', organization: '', topic: 'other', message: 'A message with a bad address.', handled_at: '2026-11-02T16:00:00Z', handled_by: 'sample.member.a@umich.edu' }])));
    await page.reload();
    await page.waitForSelector('[data-state=ready]:not([hidden])');
    await page.click('#tab-messages');
    await page.waitForSelector('#messages-list .review-card');
    ok((await page.locator('#messages-list a[href^="mailto:"]').count()) === 0, 'contact demo', 'an invalid address must not become a mailto link');
    // Delete all handled, with a confirmation.
    let asked = 0;
    page.on('dialog', (d) => { asked++; d.accept(); });
    await page.click('#messages-list button:text-is("Delete all handled")');
    await page.waitForSelector('#messages-list >> text=No messages.');
    ok(asked === 1, 'contact demo', 'Delete all handled must ask first');
    // Delete one: a refused confirmation keeps it, an accepted one removes it.
    await page.evaluate(() => sessionStorage.setItem('msi-demo-contact-messages', JSON.stringify([{ id: 'y1', created_at: '2026-11-02T15:04:00Z', name: 'Delete Me', email: 'delete.me@example.com', organization: '', topic: 'joining', message: 'Please delete this message.', handled_at: null, handled_by: null }])));
    await page.reload();
    await page.waitForSelector('[data-state=ready]:not([hidden])');
    await page.click('#tab-messages');
    await page.waitForSelector('#messages-list .review-card');
    page.removeAllListeners('dialog');
    page.once('dialog', (d) => d.dismiss());
    await page.click('#messages-list button:text-is("Delete")');
    await page.waitForTimeout(300);
    ok((await page.locator('#messages-list .review-card').count()) === 1, 'contact demo', 'a refused confirmation must keep the message');
    page.once('dialog', (d) => d.accept());
    await page.click('#messages-list button:text-is("Delete")');
    await page.waitForSelector('#messages-list >> text=No messages.');
    await ctx.close();
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
  // How the mock answers rpc/contact_form_ready: 'ready' (200 true), 'missing' (404, form not installed), 'error' (500).
  let contactMode = 'missing';
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    log.push(path);
    const json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (path === '/rest/v1/rpc/contact_form_ready') {
      if (contactMode === 'ready') return json(true);
      res.statusCode = contactMode === 'error' ? 500 : 404;
      return res.end('{}');
    }
    if (path === '/rest/v1/public_profiles') {
      if (mode === 'fail') { res.statusCode = 500; return res.end('boom'); }
      return json([
        { profile_id: ID1, full_name: 'Mock Board Person', class_year: 2027, school: 'Mock School', major: 'Mock Major', linkedin_url: 'https://www.linkedin.com/in/mock-person', headshot_path: `${ID1}/abc123.webp`, board_title: 'Mock President', sort_order: 1 },
        { profile_id: ID3, full_name: 'Mock Safari Person', class_year: 2028, school: null, major: 'Mock School of Testing, Mock Second Major', linkedin_url: null, headshot_path: `${ID3}/fromsafari.webp`, board_title: null, sort_order: null },
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
    // The contact form switch: 404 = not installed (form stays off), 200 true = on, anything else fails the build.
    const readyFlag = () => JSON.parse(readFileSync('.cache/contact.json', 'utf8')).ready;
    contactMode = 'missing';
    const off = await run('node', ['scripts/prebuild.mjs'], { ...process.env, ...env });
    ok(off.status === 0 && readyFlag() === false, 'supabase', 'a 404 from rpc/contact_form_ready must leave the contact form off without failing the build');
    contactMode = 'ready';
    const on = await run('node', ['scripts/prebuild.mjs'], { ...process.env, ...env });
    ok(on.status === 0 && readyFlag() === true, 'supabase', 'a true answer from rpc/contact_form_ready must turn the contact form on');
    contactMode = 'error';
    const broken = await run('node', ['scripts/prebuild.mjs'], { ...process.env, ...env });
    ok(broken.status !== 0, 'supabase', 'a 500 from rpc/contact_form_ready must fail the build');
    contactMode = 'ready';
    const pre = await run('node', ['scripts/prebuild.mjs'], { ...process.env, ...env });
    ok(pre.status === 0 && /2 headshot/.test(pre.stdout), 'supabase', 'prebuild should download exactly two headshots (one WebP, one JPEG from Safari)');
    ok(new RegExp(`WARNING headshot for ${ID2}`).test(pre.stderr), 'supabase', 'a failed image download should print a warning');
    // Supabase settings present but the form not installed: the site has no contact page.
    contactMode = 'missing';
    const noForm = await build('supabase-noform', env);
    if (noForm) checkVariant('supabase mock data, contact form not installed', noForm, { data: true });
    contactMode = 'ready';
    const dir = await build('supabase', env);
    if (!dir) return;
    await fitCheck(dir, 'contact form ready');
    await contactMock(dir, mockOrigin, env.PUBLIC_SUPABASE_ANON_KEY);
    const jwtKey = 'eyJmock.jwt.key';
    const jwtDir = await build('supabase-jwt', { ...env, PUBLIC_SUPABASE_ANON_KEY: jwtKey });
    if (jwtDir) await contactMock(jwtDir, mockOrigin, jwtKey, { full: false });
    checkVariant('supabase mock data', dir, { data: true, contact: true });
    ok(existsSync(join(dir, 'headshots', `${ID1}.webp`)), 'supabase', 'headshot file missing from dist');
    ok(!existsSync(join(dir, 'headshots', `${ID2}.webp`)), 'supabase', 'failed headshot must not be shipped');
    const team = readFileSync(join(dir, 'leadership/index.html'), 'utf8');
    ok(team.includes('Mock Board Person') && team.includes('Mock President') && team.includes('Mock Member Two'), 'supabase', 'Leadership page lacks mock data');
    ok(team.includes('Mock Major') && !team.includes('Mock School'), 'supabase', 'profiles must show the major and never the school');
    ok(team.includes('Mock Second Major') && !team.includes('Mock School of Testing'), 'supabase', 'a school typed into the major box must be dropped');
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
      if (p.startsWith('/members/')) continue;
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
      if (p.startsWith('/members/')) continue;
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
    // Header must fit on one row at common desktop widths (hamburger takes over below 1130px).
    for (const width of [1130, 1280, 1440, 1600, 1920]) {
      const hc = await browser.newContext({ viewport: { width, height: 900 } });
      const hp = await hc.newPage();
      await hp.goto(origin + '/privacy/', { waitUntil: 'load' });
      const m = await hp.evaluate(() => { const h = document.querySelector('.header-inner'); const n = document.querySelector('.nav'); return { sw: h.scrollWidth, cw: h.clientWidth, h: h.getBoundingClientRect().height, nav: n.getBoundingClientRect().height }; });
      ok(m.sw <= m.cw + 1 && m.h < 130 && m.nav < 50, `smoke:header@${width}`, `header does not fit (scroll ${m.sw} > ${m.cw}, height ${m.h})`);
      await hc.close();
    }
    // Mobile nav with the keyboard
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(origin + '/privacy/', { waitUntil: 'load' });
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
if (sampled) checkVariant('sample data', sampled, { sample: true, contact: true });
if (prod && sampled) await a11y(prod, sampled);
if (prod) await fitCheck(prod, 'production');
if (sampled) await contactDemo(sampled);
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
