import { existsSync, readFileSync } from 'node:fs';

// Is the contact form installed? scripts/prebuild.mjs asks the database before every build and writes the
// answer to .cache/contact.json. The Contact page, and every link to it, exists only when the answer is yes.
// To switch the form on: run supabase/03_contact.sql in Supabase, then rebuild the site.
export function contactReady(): boolean {
  const file = '.cache/contact.json';
  if (!existsSync(file)) return false;
  try { return JSON.parse(readFileSync(file, 'utf8')).ready === true; } catch { return false; }
}
