// Demo data layer for ?demo=1 in SAMPLE_DATA builds only. In-memory, no network calls, obviously fake people.
import type { Api, Profile, Placement, ReviewItem, BoardRow, ContactMessage } from './types';

const mk = (n: string, i: number, status: Profile['status']): Profile => ({
  id: `demo-${i}`, email: `sample.member.${n.toLowerCase()}@umich.edu`, full_name: `Sample Member ${n}`, class_year: 2027, school: 'Ross School of Business',
  major: 'Sample Major One', linkedin_url: 'https://www.linkedin.com/in/sample-member', headshot_path: null, bio: 'Sample biography text for the preview.',
  show_identity: true, show_headshot: false, show_linkedin: true, show_placements: true, show_name_on_placements: false, status, review_note: null, published: null,
});
const wait = () => new Promise((r) => setTimeout(r, 120));

// Contact messages. The Contact page and the admin page are different pages, so the demo store lives in
// sessionStorage (this tab only, gone when the tab closes). If the browser blocks it, messages last for one page.
const MESSAGES_KEY = 'msi-demo-contact-messages';
let messagesInMemory: ContactMessage[] = [];
function loadMessages(): ContactMessage[] {
  try { return JSON.parse(sessionStorage.getItem(MESSAGES_KEY) || '[]') as ContactMessage[]; } catch { return messagesInMemory; }
}
function saveMessages(list: ContactMessage[]) {
  messagesInMemory = list;
  try { sessionStorage.setItem(MESSAGES_KEY, JSON.stringify(list)); } catch { /* blocked: keep it in memory */ }
}
/** Called by the Contact page in a sample build with no Supabase settings. Nothing is sent anywhere. */
export function demoSendMessage(p: { p_name: string; p_email: string; p_organization: string; p_topic: string; p_message: string }) {
  const list = loadMessages();
  list.push({ id: `demo-message-${Date.now()}-${list.length}`, created_at: new Date().toISOString(), name: p.p_name, email: p.p_email, organization: p.p_organization, topic: p.p_topic, message: p.p_message, handled_at: null, handled_by: null });
  saveMessages(list);
}

export function createDemoApi(): Api {
  const isAdmin = location.pathname.includes('/admin');
  let me: Profile | null = { ...mk('A', 1, 'draft'), id: 'demo-user', email: 'sample.member.a@umich.edu' };
  let myPlacements: Placement[] = [
    { id: 'p1', firm: 'Sample Firm One', team: 'Sample Group Alpha', kind: 'internship', year: 2026 },
    { id: 'p2', firm: 'Sample Firm Two', team: 'Sample Group Beta', kind: 'full_time', year: 2027 },
  ];
  let roster = ['sample.member.a@umich.edu', 'sample.member.b@umich.edu', 'sample.member.d@umich.edu', 'sample.member.e@umich.edu'];
  let queue: ReviewItem[] = [
    { profile: mk('B', 2, 'submitted'), placements: [{ firm: 'Sample Firm Three', team: 'Sample Group Gamma', kind: 'internship', year: 2026 }] },
    { profile: { ...mk('C', 3, 'submitted'), show_headshot: true, show_name_on_placements: true }, placements: [{ firm: 'Sample Firm Four', team: null, kind: 'full_time', year: 2026 }, { firm: 'Sample Firm Five', team: 'Sample Group Alpha', kind: 'internship', year: 2025 }] },
  ];
  let published: Profile[] = [{ ...mk('D', 4, 'approved'), published: {} }, { ...mk('E', 5, 'approved'), published: {} }];
  const board: BoardRow[] = ['A', 'B', 'C', 'D'].map((n, i) => ({ profile_id: `demo-${i + 1}`, full_name: `Sample Member ${n}`, email: `sample.member.${n.toLowerCase()}@umich.edu`, title: i < 2 ? ['President', 'Vice President of Education'][i] : '', sort_order: i < 2 ? i + 1 : 0 }));

  return {
    configured: true,
    async getSession() { return { userId: 'demo-user', email: 'sample.member.a@umich.edu' }; },
    async signIn() {}, async signOut() {},
    async access() { return isAdmin ? 'admin' : 'applicant'; },
    headshotUrl: (p) => p,
    async getMyProfile() { return { profile: me, placements: myPlacements, boardTitle: 'Vice President of Education' }; },
    async saveProfile(_u, _e, input, status, placements) {
      await wait();
      me = { ...(me as Profile), ...input, status };
      myPlacements = placements;
      return me;
    },
    async unpublish() { await wait(); if (me) me = { ...me, status: 'draft', published: null }; },
    async deleteProfile() { await wait(); me = null; myPlacements = []; },
    async listRoster() { return [...roster]; },
    async addRoster(emails) { await wait(); roster = [...new Set([...roster, ...emails])].sort(); },
    async removeRoster(email) { await wait(); roster = roster.filter((e) => e !== email); },
    async listSubmitted() { return [...queue]; },
    async listPublished() { return published.map((p) => ({ ...p })); },
    async unpublishProfile(id) { await wait(); published = published.filter((p) => p.id !== id); },
    async adminDeleteProfile(id) { await wait(); queue = queue.filter((q) => q.profile.id !== id); published = published.filter((p) => p.id !== id); },
    async approve(id) { await wait(); queue = queue.filter((q) => q.profile.id !== id); },
    async requestChanges(id) { await wait(); queue = queue.filter((q) => q.profile.id !== id); },
    async listBoard() { return board.map((b) => ({ ...b })); },
    async setBoard(id, title, order) { await wait(); const b = board.find((x) => x.profile_id === id); if (b) { b.title = title; b.sort_order = order; } },
    async listMessages() { return loadMessages().sort((a, b) => b.created_at.localeCompare(a.created_at)); },
    async setMessageHandled(id, handled) {
      await wait();
      saveMessages(loadMessages().map((m) => (m.id !== id ? m : { ...m, handled_at: handled ? m.handled_at ?? new Date().toISOString() : null, handled_by: handled ? 'sample.member.a@umich.edu' : null })));
    },
    async deleteMessage(id) { await wait(); saveMessages(loadMessages().filter((m) => m.id !== id)); },
    async deleteHandledMessages() { await wait(); saveMessages(loadMessages().filter((m) => !m.handled_at)); },
    async exportAll() { return { profiles: [{ ...mk('A', 1, 'draft') }], placements: myPlacements as unknown as Record<string, unknown>[] }; },
  };
}
