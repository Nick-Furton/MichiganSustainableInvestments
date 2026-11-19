// Runs before `astro build` (see "build" in package.json).
// Downloads every published headshot into public/headshots/<profile_id>.webp so the public site never
// needs Supabase at view time. A failed REST fetch stops the build; a failed image only logs a warning
// (that person gets the initials avatar).
// It also asks the database whether the contact form is installed (supabase/03_contact.sql) and writes the
// answer to .cache/contact.json. The site shows the Contact page and its links only when the answer is yes.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { loadEnv } from 'vite';

for (const [k, v] of Object.entries(loadEnv('production', process.cwd(), ''))) if (process.env[k] === undefined) process.env[k] = v;
const dir = 'public/headshots';
const manifestPath = '.cache/headshots.json';
rmSync(dir, { recursive: true, force: true });
rmSync(manifestPath, { force: true });
mkdirSync('.cache', { recursive: true });
writeFileSync(manifestPath, '{}');
// Sample builds always have the contact form (it runs in demo mode there). Otherwise: off until the database says yes.
const contactPath = '.cache/contact.json';
writeFileSync(contactPath, JSON.stringify({ ready: process.env.SAMPLE_DATA === '1' }));

const base = (process.env.PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.PUBLIC_SUPABASE_ANON_KEY || '';
if (process.env.SAMPLE_DATA === '1' || !base || !key) process.exit(0);

const headers = key.startsWith('eyJ') ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key };

// 404 means the function does not exist yet, so the form stays off. Any other failure stops the build,
// so a database hiccup can never make a working Contact page disappear from the live site.
const probe = await fetch(`${base}/rest/v1/rpc/contact_form_ready`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' });
if (probe.ok) {
  const ready = (await probe.json()) === true;
  writeFileSync(contactPath, JSON.stringify({ ready }));
  console.log(`prebuild: contact form ${ready ? 'is installed' : 'did not answer yes'}`);
} else if (probe.status === 404) {
  console.log('prebuild: contact form not installed (run supabase/03_contact.sql to switch it on)');
} else {
  console.error(`prebuild: contact_form_ready returned HTTP ${probe.status}`);
  process.exit(1);
}

const res = await fetch(`${base}/rest/v1/public_profiles?select=profile_id,headshot_path`, { headers });
if (!res.ok) { console.error(`prebuild: public_profiles returned HTTP ${res.status}`); process.exit(1); }
const rows = await res.json();
const manifest = {};
mkdirSync(dir, { recursive: true });
let sharp = null;
try { sharp = (await import('sharp')).default; } catch { console.warn('prebuild: note: image library not available; photos are used as uploaded'); }
const kind = (b) => (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') ? 'webp'
  : (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ? 'jpeg'
  : (b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') ? 'png' : null;
for (const r of rows) {
  if (!r.headshot_path) continue;
  const id = String(r.profile_id);
  try {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('unexpected profile id');
    if (!/^[0-9a-f-]{36}\/[A-Za-z0-9_-]+\.webp$/i.test(r.headshot_path)) throw new Error('unexpected headshot path');
    const img = await fetch(`${base}/storage/v1/object/public/headshots/${r.headshot_path}`);
    if (!img.ok) throw new Error(`HTTP ${img.status}`);
    const buf = Buffer.from(await img.arrayBuffer());
    if (buf.length > 2 * 1024 * 1024) throw new Error('image over 2 MB');
    // Uploads are WebP from most browsers and JPEG from Safari, which cannot write WebP. The stored
    // name always ends in .webp (a database rule), so the real format is read from the file itself.
    const type = kind(buf);
    if (!type) throw new Error('not a WebP, JPEG or PNG file');
    const entry = { src: `headshots/${id}.webp`, width: null, small: null };
    if (sharp) {
      const meta = await sharp(buf).metadata();
      let full = buf;
      // A WebP that is already small enough, in pixels and in bytes, is shipped untouched (no second round of
      // compression). Anything else is re-encoded; some phones upload small photos that are heavy.
      if (type !== 'webp' || (meta.width || 0) > 1200 || meta.width !== meta.height || buf.length > 150 * 1024) {
        full = await sharp(buf).rotate().resize({ width: 1200, height: 1200, fit: 'cover', withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
      }
      writeFileSync(`${dir}/${id}.webp`, full);
      entry.width = (await sharp(full).metadata()).width || null;
      // A 600px copy keeps the page light on ordinary screens; sharp screens get the full one.
      if ((entry.width || 0) > 700) {
        await sharp(full).resize(600, 600, { fit: 'cover' }).webp({ quality: 82 }).toFile(`${dir}/${id}-600.webp`);
        entry.small = `headshots/${id}-600.webp`;
      }
    } else {
      if (type !== 'webp') throw new Error('cannot convert this photo without the image library');
      writeFileSync(`${dir}/${id}.webp`, buf);
    }
    manifest[id] = entry;
  } catch (e) {
    console.warn(`prebuild: WARNING headshot for ${id} not downloaded (${e.message}); using the initials avatar`);
  }
}
writeFileSync(manifestPath, JSON.stringify(manifest));
console.log(`prebuild: ${Object.keys(manifest).length} headshot(s) downloaded`);
