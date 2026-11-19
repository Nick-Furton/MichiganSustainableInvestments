// Site configuration. Everything that changes between environments comes from environment variables
// (see .env.example), so the same code builds the preview, the GitHub Pages test site and the real site.
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { loadEnv } from 'vite';
import { execSync } from 'node:child_process';

const fileEnv = loadEnv('production', process.cwd(), '');
for (const [k, v] of Object.entries(fileEnv)) if (process.env[k] === undefined) process.env[k] = v;

const SITE_URL = (process.env.SITE_URL || 'https://michigansustainableinvestments.com').replace(/\/+$/, '');
let base = process.env.BASE_PATH || '/';
if (!base.startsWith('/')) base = '/' + base;
if (!base.endsWith('/')) base += '/';
const SAMPLE = process.env.SAMPLE_DATA === '1';

// The Leadership page is indexed only when it has approved profiles.
const { loadMembers } = await import('./src/lib/members.ts');
const members = await loadMembers();
const hidden = new Set(['/404/', '/members/', '/members/profile/', '/members/admin/']);
if (!members.profiles.length) hidden.add('/leadership/');

// The sitemap's "last modified" date is the date of the latest saved change to the site (the newest commit).
// If that cannot be read (no git here), the date is simply left out.
let lastmod;
try {
  const d = new Date(execSync('git log -1 --format=%cI', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim());
  if (!isNaN(+d)) lastmod = d.toISOString();
} catch { /* no git: leave it out */ }

export default defineConfig({
  site: SITE_URL,
  base,
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [
    sitemap({
      filter: (page) => {
        const path = new URL(page).pathname.slice(base.length - 1);
        return !hidden.has(path);
      },
      serialize: (item) => (lastmod ? { ...item, lastmod } : item),
    }),
  ],
  vite: {
    define: {
      __SAMPLE_DATA__: JSON.stringify(SAMPLE),
      __SITE_URL__: JSON.stringify(SITE_URL),
    },
  },
});
