// Build-time loader for the Team and Placements data.
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
function headshotManifest(): Record<string, string> {
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
    const res = await fetch(`${base}/rest/v1/${view}?select=*`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
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
    major: r.major ?? null,
    linkedin_url: r.linkedin_url ?? null,
    headshot_url: shots[r.profile_id] ?? null,  // site-relative path, e.g. headshots/<id>.webp
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

export const isSample = () => process.env.SAMPLE_DATA === '1';
export const portalConfigured = () => !!(process.env.PUBLIC_SUPABASE_URL && process.env.PUBLIC_SUPABASE_ANON_KEY);
