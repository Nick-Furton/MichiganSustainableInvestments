// Build-time loader for the Leadership and Placements data.
// Source: the two public Supabase views (anon key, plain fetch), or sample-profiles.json when SAMPLE_DATA=1.
// This file runs only at build time (it is also loaded by astro.config.mjs), so it reads process.env directly.

export type PublicProfile = {
  profile_id: string;
  full_name: string;
  class_year: number | null;
  school: string | null;
  major: string | null;
  linkedin_url: string | null;
  headshot_url: string | null;
  headshot_small_url?: string | null; // 600px copy for ordinary screens, when one was made
  headshot_width?: number | null;     // pixel width of the full photo
  board_title: string | null;
  sort_order: number | null;
};
export type PublicPlacement = {
  firm: string;
  team: string | null;
  kind: 'internship' | 'full_time';
  year: number;
  member_name: string | null;
  class_year: number | null;
};
export type MembersData = {
  source: 'sample' | 'supabase' | 'none';
  profiles: PublicProfile[];
  placements: PublicPlacement[];
};

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Headshots are downloaded by scripts/prebuild.mjs into public/headshots/ and listed in .cache/headshots.json.
// Profiles show the major only. Members sometimes type their school in front of it
// ("Ross School of Business, Finance"), so comma-separated parts that name a school or college are dropped.
export function cleanMajor(major: string | null | undefined): string | null {
  if (!major) return null;
  const parts = major.split(',').map((s) => s.trim()).filter(Boolean);
  const kept = parts.filter((s) => !/\b(school|college)\b/i.test(s));
  return (kept.length ? kept : parts).join(', ') || null;
}

type Shot = { src: string; width: number | null; small: string | null };
function headshotManifest(): Record<string, Shot> {
  try { return JSON.parse(readFileSync(join(process.cwd(), '.cache/headshots.json'), 'utf8')); } catch { return {}; }
}

let cached: Promise<MembersData> | undefined;
export function loadMembers(): Promise<MembersData> {
  return (cached ??= load());
}

async function load(): Promise<MembersData> {
  if (process.env.SAMPLE_DATA === '1') {
    const raw = (await import('../data/sample-profiles.json')).default as { profiles: PublicProfile[]; placements: PublicPlacement[] };
    return { source: 'sample', profiles: raw.profiles, placements: raw.placements };
  }
  const base = (process.env.PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.PUBLIC_SUPABASE_ANON_KEY || '';
  if (!base || !key) return { source: 'none', profiles: [], placements: [] };

  const get = async (view: string) => {
    const res = await fetch(`${base}/rest/v1/${view}?select=*`, { headers: key.startsWith('eyJ') ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key } });
    // Fail loudly: a broken fetch must stop the build so the last good site stays live.
    if (!res.ok) throw new Error(`Supabase view ${view} returned HTTP ${res.status}`);
    return (await res.json()) as any[];
  };
  const [p, pl] = await Promise.all([get('public_profiles'), get('public_placements')]);
  const shots = headshotManifest();
  const profiles: PublicProfile[] = p.map((r) => ({
    profile_id: r.profile_id,
    full_name: r.full_name,
    class_year: r.class_year ?? null,
    school: r.school ?? null,
    major: cleanMajor(r.major),
    linkedin_url: r.linkedin_url ?? null,
    headshot_url: shots[r.profile_id]?.src ?? null,  // site-relative path, e.g. headshots/<id>.webp
    headshot_small_url: shots[r.profile_id]?.small ?? null,
    headshot_width: shots[r.profile_id]?.width ?? null,
    board_title: r.board_title ?? null,
    sort_order: r.sort_order ?? null,
  }));
  const placements: PublicPlacement[] = pl.map((r) => ({
    firm: r.firm,
    team: r.team ?? null,
    kind: r.kind,
    year: r.year,
    member_name: r.member_name ?? null,
    class_year: r.class_year ?? null,
  }));
  profiles.sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999) || a.full_name.localeCompare(b.full_name));
  placements.sort((a, b) => b.year - a.year || a.firm.localeCompare(b.firm));
  return { source: 'supabase', profiles, placements };
}

export type BoardRole = { title: string; people: PublicProfile[] };

// The board as a list of roles, in display order. Two people with the same title (two co-presidents, say) share
// one entry, which keeps them next to each other on the Leadership page and on one line in llms.txt. A role sits
// where its first holder sits; "Co-VP Finance" typed with different capitals or spacing still counts as the same title.
export function boardRoles(profiles: PublicProfile[]): BoardRole[] {
  const same = (t: string) => t.trim().replace(/\s+/g, ' ').toLowerCase();
  const board = profiles
    .filter((p) => p.board_title && p.board_title.trim())
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (a.p.sort_order ?? 999) - (b.p.sort_order ?? 999) || a.i - b.i)
    .map((x) => x.p);
  const roles: BoardRole[] = [];
  for (const p of board) {
    const title = p.board_title!.trim().replace(/\s+/g, ' ');
    const role = roles.find((r) => same(r.title) === same(title));
    if (role) role.people.push(p);
    else roles.push({ title, people: [p] });
  }
  return roles;
}

export const isSample = () => process.env.SAMPLE_DATA === '1';
export const portalConfigured = () => !!(process.env.PUBLIC_SUPABASE_URL && process.env.PUBLIC_SUPABASE_ANON_KEY);
