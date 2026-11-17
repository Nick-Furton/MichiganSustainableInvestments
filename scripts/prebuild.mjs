// Runs before `astro build` (see "build" in package.json).
// Downloads every published headshot into public/headshots/<profile_id>.webp so the public site never
// needs Supabase at view time. A failed REST fetch stops the build; a failed image only logs a warning
// (that person gets the initials avatar).
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { loadEnv } from 'vite';

for (const [k, v] of Object.entries(loadEnv('production', process.cwd(), ''))) if (process.env[k] === undefined) process.env[k] = v;
const dir = 'public/headshots';
const manifestPath = '.cache/headshots.json';
rmSync(dir, { recursive: true, force: true });
rmSync(manifestPath, { force: true });
mkdirSync('.cache', { recursive: true });
writeFileSync(manifestPath, '{}');

const base = (process.env.PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.PUBLIC_SUPABASE_ANON_KEY || '';
if (process.env.SAMPLE_DATA === '1' || !base || !key) process.exit(0);

const res = await fetch(`${base}/rest/v1/public_profiles?select=profile_id,headshot_path`, { headers: key.startsWith('eyJ') ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key } });
if (!res.ok) { console.error(`prebuild: public_profiles returned HTTP ${res.status}`); process.exit(1); }
const rows = await res.json();
const manifest = {};
mkdirSync(dir, { recursive: true });
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
    if (buf.subarray(0, 4).toString() !== 'RIFF' || buf.subarray(8, 12).toString() !== 'WEBP') throw new Error('not a WebP file');
    writeFileSync(`${dir}/${id}.webp`, buf);
    manifest[id] = `headshots/${id}.webp`;
  } catch (e) {
    console.warn(`prebuild: WARNING headshot for ${id} not downloaded (${e.message}); using the initials avatar`);
  }
}
writeFileSync(manifestPath, JSON.stringify(manifest));
console.log(`prebuild: ${Object.keys(manifest).length} headshot(s) downloaded`);
