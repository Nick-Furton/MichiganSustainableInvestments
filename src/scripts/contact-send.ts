// Sends one contact message. Loaded by contact.ts when the form is submitted.
// It uses a plain fetch, not the Supabase library. In a sample build with no Supabase settings it sends nothing over
// the network: the message goes into the demo store instead, so the demo admin page can show it.

const SUPABASE_URL = ((import.meta.env.PUBLIC_SUPABASE_URL as string) || '').replace(/\/+$/, '');
const SUPABASE_KEY = (import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string) || '';

export type Payload = { p_name: string; p_email: string; p_organization: string; p_topic: string; p_message: string; p_trap: string };
// 'ok', a field name (the database refused that field), 'limit_sender', 'limit_busy', or 'failed' (anything else).
export type Result = 'ok' | 'name' | 'email' | 'organization' | 'topic' | 'message' | 'limit_sender' | 'limit_busy' | 'failed';

export async function send(p: Payload): Promise<Result> {
  if (__SAMPLE_DATA__ && !(SUPABASE_URL && SUPABASE_KEY)) {
    const { demoSendMessage } = await import('./portal/demo-api');
    demoSendMessage(p);
    return 'ok';
  }
  // Newer "publishable" keys must not be sent as a bearer token; only the older JWT-style keys (eyJ...) are.
  const headers: Record<string, string> = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  if (SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SUPABASE_KEY}`;
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/send_contact_message`, { method: 'POST', headers, body: JSON.stringify(p) });
  } catch {
    return 'failed';
  }
  if (res.status === 204 || res.status === 200) return 'ok';
  if (res.status === 400) {
    try {
      const code = String(((await res.json()) as { message?: unknown }).message ?? '');
      const map: Record<string, Result> = {
        contact_name: 'name', contact_email: 'email', contact_organization: 'organization', contact_topic: 'topic', contact_message: 'message',
        contact_limit_sender: 'limit_sender', contact_limit_busy: 'limit_busy',
      };
      return map[code] ?? 'failed';
    } catch { /* fall through */ }
  }
  return 'failed';
}
