// The Contact page form. It checks the fields, then sends the message to the database's one public
// function, send_contact_message (see supabase/03_contact.sql). It uses a plain fetch, not the Supabase library.
// In a sample build with no Supabase settings it sends nothing over the network: the message goes into the
// demo store instead, so the demo admin page can show it.

const SUPABASE_URL = ((import.meta.env.PUBLIC_SUPABASE_URL as string) || '').replace(/\/+$/, '');
const SUPABASE_KEY = (import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string) || '';

type Payload = { p_name: string; p_email: string; p_organization: string; p_topic: string; p_message: string; p_trap: string };
// 'ok', a field name (the database refused that field), 'limit_sender', 'limit_busy', or 'failed' (anything else).
type Result = 'ok' | 'name' | 'email' | 'organization' | 'topic' | 'message' | 'limit_sender' | 'limit_busy' | 'failed';

const FIELDS = ['name', 'email', 'organization', 'topic', 'message'] as const;
type Field = (typeof FIELDS)[number];

const TEXT = {
  name: 'Enter your name.',
  email: 'Enter a valid email address.',
  organization: 'Keep this to 160 characters or fewer.',
  topic: 'Choose what this is about.',
  messageShort: 'Write at least 10 characters.',
  messageLong: 'Keep the message to 4,000 characters or fewer.',
  limitSender: 'You have sent three messages today. Try again tomorrow.',
  limitBusy: 'The form is busy. Try again in an hour.',
  failed: 'Your message was not sent. Check your connection and try again.',
};

async function send(p: Payload): Promise<Result> {
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

const form = document.querySelector<HTMLFormElement>('#contact-form');
if (form) {
  const summary = document.querySelector<HTMLElement>('#contact-summary')!;
  const done = document.querySelector<HTMLElement>('#contact-done')!;
  const button = document.querySelector<HTMLButtonElement>('#contact-send')!;
  const input = (f: Field) => document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`#c-${f}`)!;
  const errBox = (f: Field) => document.querySelector<HTMLElement>(`#c-${f}-err`)!;
  let sending = false;

  const clearErrors = () => {
    summary.hidden = true;
    summary.textContent = '';
    for (const f of FIELDS) { input(f).removeAttribute('aria-invalid'); errBox(f).textContent = ''; }
  };
  const showFieldError = (f: Field, text: string) => {
    input(f).setAttribute('aria-invalid', 'true');
    errBox(f).textContent = text;
  };
  const showSummary = (text: string) => { summary.textContent = text; summary.hidden = false; };

  const messageProblem = (m: string) => (m.length < 10 ? TEXT.messageShort : m.length > 4000 ? TEXT.messageLong : '');
  // What the page checks before anything is sent. The database checks again; the page is never trusted.
  const problems = (v: Payload): Partial<Record<Field, string>> => {
    const out: Partial<Record<Field, string>> = {};
    if (!v.p_name || v.p_name.length > 120) out.name = TEXT.name;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.p_email) || v.p_email.length > 254) out.email = TEXT.email;
    if (v.p_organization.length > 160) out.organization = TEXT.organization;
    if (!['recruiting', 'speaking', 'joining', 'other'].includes(v.p_topic)) out.topic = TEXT.topic;
    const m = messageProblem(v.p_message);
    if (m) out.message = m;
    return out;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sending) return;
    clearErrors();
    const payload: Payload = {
      p_name: input('name').value.trim(),
      p_email: input('email').value.trim(),
      p_organization: input('organization').value.trim(),
      p_topic: input('topic').value,
      p_message: input('message').value.trim(),
      p_trap: (document.querySelector<HTMLInputElement>('#c-trap')?.value) ?? '',
    };
    const bad = problems(payload);
    const first = FIELDS.find((f) => bad[f]);
    if (first) {
      for (const f of FIELDS) if (bad[f]) showFieldError(f, bad[f]!);
      showSummary('Some answers need fixing. See the messages below.');
      input(first).focus();
      return;
    }
    sending = true;
    button.disabled = true;
    button.textContent = 'Sending…';
    const result = await send(payload);
    sending = false;
    button.disabled = false;
    button.textContent = 'Send message';
    if (result === 'ok') {
      form.hidden = true;
      done.hidden = false;
      done.focus();
    } else if (result === 'limit_sender') showSummary(TEXT.limitSender);
    else if (result === 'limit_busy') showSummary(TEXT.limitBusy);
    else if (result === 'failed') showSummary(TEXT.failed);
    else {
      showFieldError(result, result === 'message' ? messageProblem(payload.p_message) || TEXT.messageShort : TEXT[result]);
      showSummary('Some answers need fixing. See the messages below.');
      input(result).focus();
    }
  });
}
