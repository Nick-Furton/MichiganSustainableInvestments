// Real data layer. The database (row-level security + my_access()) decides who can do what;
// nothing here trusts the Google "hd" hint or user_metadata for authorization.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Api, Profile, Placement, ReviewItem, BoardRow, Access, ContactMessage } from './types';

const URL_ = import.meta.env.PUBLIC_SUPABASE_URL as string;
const KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string;
const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');

export const supabaseConfigured = () => !!(URL_ && KEY);

function redirectUrl() {
  // Production: SITE_URL + BASE_PATH. On localhost use the current origin so local testing works.
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const origin = local ? location.origin : __SITE_URL__;
  return origin + BASE + 'members/profile/';
}

let client: SupabaseClient | undefined;
function sb() {
  return (client ??= createClient(URL_, KEY, { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true } }));
}
function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

export function createSupabaseApi(): Api {
  return {
    configured: supabaseConfigured(),
    async getSession() {
      const { data } = await sb().auth.getSession();
      const u = data.session?.user;
      return u ? { userId: u.id, email: (u.email || '').toLowerCase() } : null;
    },
    async signIn() {
      const { error } = await sb().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl(), queryParams: { hd: 'umich.edu', prompt: 'select_account' } },
      });
      if (error) throw new Error(error.message);
    },
    async signOut() {
      await sb().auth.signOut();
    },
    async access() {
      const { data, error } = await sb().rpc('my_access');
      if (error) throw new Error(error.message);
      return (data as Access) || 'none';
    },
    headshotUrl: (path) => `${URL_.replace(/\/+$/, '')}/storage/v1/object/public/headshots/${path}`,

    async getMyProfile(userId) {
      const p = check(await sb().from('profiles').select('*').eq('id', userId).maybeSingle());
      if (!p) return { profile: null, placements: [], boardTitle: null };
      const pl = check(await sb().from('placements').select('id, firm, team, kind, year').eq('profile_id', userId).order('year', { ascending: false }));
      const bp = check(await sb().from('board_positions').select('title').eq('profile_id', userId).maybeSingle());
      return { profile: p as Profile, placements: pl as Placement[], boardTitle: (bp as { title: string } | null)?.title ?? null };
    },

    async saveProfile(userId, existing, input, status, placements, newHeadshot) {
      let headshot_path = input.headshot_path;
      let uploaded: string | null = null;
      if (newHeadshot) {
        const rand = crypto.randomUUID().replace(/-/g, '');
        uploaded = `${userId}/${rand}.webp`;
        const up = await sb().storage.from('headshots').upload(uploaded, newHeadshot, { contentType: newHeadshot.type || 'image/webp', upsert: false });
        if (up.error) throw new Error(up.error.message);
        headshot_path = uploaded;
      }
      const row = { ...input, headshot_path, status };
      try {
        if (existing) {
          check(await sb().from('profiles').update(row).eq('id', userId).select('*').single());
        } else {
          check(await sb().from('profiles').insert({ id: userId, ...row }).select('*').single());
        }
      } catch (e) {
        if (uploaded) await sb().storage.from('headshots').remove([uploaded]);
        throw e;
      }
      // Replace the placements list.
      check(await sb().from('placements').delete().eq('profile_id', userId));
      const rows = placements.filter((p) => p.firm.trim()).map((p) => ({ profile_id: userId, firm: p.firm.trim(), team: p.team?.trim() || null, kind: p.kind, year: p.year }));
      if (rows.length) check(await sb().from('placements').insert(rows));
      // Re-read: a trigger may have set the status (editing an approved profile sets it back to submitted).
      const fresh = check(await sb().from('profiles').select('*').eq('id', userId).single()) as Profile;
      // Tidy the member's folder, but never touch a file the live site still uses:
      // keep the current headshot and the one inside the published snapshot.
      if (uploaded) {
        const keep = new Set([fresh.headshot_path, (fresh.published as { headshot_path?: string } | null)?.headshot_path]);
        const files = (await sb().storage.from('headshots').list(userId)).data ?? [];
        const stale = files.map((f) => `${userId}/${f.name}`).filter((path) => !keep.has(path));
        if (stale.length) await sb().storage.from('headshots').remove(stale);
      }
      return fresh;
    },

    async unpublish() {
      check(await sb().rpc('unpublish_my_profile'));
    },
    async deleteProfile(userId, profile) {
      check(await sb().from('profiles').delete().eq('id', userId));
      // Remove every file in the member's own folder (the current and any snapshot headshot).
      const files = (await sb().storage.from('headshots').list(userId)).data ?? [];
      const paths = files.map((f) => `${userId}/${f.name}`);
      if (profile.headshot_path && !paths.includes(profile.headshot_path)) paths.push(profile.headshot_path);
      if (paths.length) await sb().storage.from('headshots').remove(paths);
    },

    async listRoster() {
      const rows = check(await sb().from('roster').select('email').order('email')) as { email: string }[];
      return rows.map((r) => r.email);
    },
    async addRoster(emails) {
      check(await sb().from('roster').upsert(emails.map((email) => ({ email })), { onConflict: 'email', ignoreDuplicates: true }));
    },
    async removeRoster(email) {
      check(await sb().from('roster').delete().eq('email', email));
    },
    async listSubmitted() {
      const profiles = check(await sb().from('profiles').select('*').eq('status', 'submitted').order('updated_at')) as Profile[];
      if (!profiles.length) return [];
      const pl = check(await sb().from('placements').select('id, profile_id, firm, team, kind, year').in('profile_id', profiles.map((p) => p.id))) as (Placement & { profile_id: string })[];
      return profiles.map((profile): ReviewItem => ({ profile, placements: pl.filter((x) => x.profile_id === profile.id) }));
    },
    async listPublished() {
      return check(await sb().from('profiles').select('*').not('published', 'is', null).order('full_name')) as Profile[];
    },
    async unpublishProfile(profileId, note) {
      check(await sb().rpc('unpublish_profile', { profile_id: profileId, note }));
    },
    async adminDeleteProfile(profileId) {
      check(await sb().rpc('delete_profile', { profile_id: profileId }));
      // Admins may list and delete any headshot, so clean up the person's folder too.
      const files = (await sb().storage.from('headshots').list(profileId)).data ?? [];
      if (files.length) await sb().storage.from('headshots').remove(files.map((f) => `${profileId}/${f.name}`));
    },
    async approve(profileId) {
      check(await sb().rpc('approve_profile', { profile_id: profileId }));
    },
    async requestChanges(profileId, note) {
      check(await sb().rpc('request_changes', { profile_id: profileId, note }));
    },
    async listBoard() {
      // Everyone who is submitted or approved, plus anyone who already has a title.
      const profiles = check(await sb().from('profiles').select('id, full_name, email, status').order('full_name')) as { id: string; full_name: string | null; email: string; status: string }[];
      const bp = check(await sb().from('board_positions').select('profile_id, title, sort_order')) as { profile_id: string; title: string; sort_order: number }[];
      return profiles.filter((p) => p.status === 'submitted' || p.status === 'approved' || bp.some((x) => x.profile_id === p.id)).map((p): BoardRow => {
        const b = bp.find((x) => x.profile_id === p.id);
        return { profile_id: p.id, full_name: p.full_name || p.email, email: p.email, title: b?.title ?? '', sort_order: b?.sort_order ?? 0 };
      });
    },
    async setBoard(profileId, title, order) {
      if (!title.trim()) check(await sb().from('board_positions').delete().eq('profile_id', profileId));
      else check(await sb().from('board_positions').upsert({ profile_id: profileId, title: title.trim(), sort_order: order }, { onConflict: 'profile_id' }));
    },
    async listMessages() {
      const r = await sb().from('contact_messages').select('id, created_at, name, email, organization, topic, message, handled_at, handled_by').order('created_at', { ascending: false });
      // The table is missing until supabase/03_contact.sql has been run.
      if (r.error && (r.error.code === 'PGRST205' || r.error.code === '42P01' || /schema cache|does not exist/i.test(r.error.message))) return null;
      return check(r) as ContactMessage[];
    },
    async setMessageHandled(id, handled) {
      check(await sb().rpc('set_contact_handled', { message_id: id, handled }));
    },
    async deleteMessage(id) {
      check(await sb().from('contact_messages').delete().eq('id', id));
    },
    async deleteHandledMessages() {
      check(await sb().from('contact_messages').delete().not('handled_at', 'is', null));
    },
    async exportAll() {
      const profiles = check(await sb().from('profiles').select('*').order('full_name')) as Record<string, unknown>[];
      const placements = check(await sb().from('placements').select('*').order('year')) as Record<string, unknown>[];
      return { profiles, placements };
    },
  };
}
