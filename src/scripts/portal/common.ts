import type { Api } from './types';

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T | null;
export const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll(sel)) as T[];

export const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');

/** Show exactly one state panel: elements marked data-state="name". */
// True when Google sign-in bounced back with an error. The usual cause is a personal (non-umich) Google
// account: the database refuses to create it, so there is no session to inspect.
function signInWasRefused() {
  const q = new URLSearchParams(location.search);
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  const refused = q.has('error') || q.has('error_description') || h.has('error') || h.has('error_description');
  if (refused) history.replaceState(null, '', location.pathname);
  return refused;
}
export function showState(name: string) {
  // A refused sign-in looks like "signed out"; show the "use your umich account" panel instead.
  if (name === 'signedout' && signInWasRefused()) name = 'wrongdomain';
  for (const el of $$('[data-state]')) el.hidden = el.dataset.state !== name;
}

export const isDemo = () => __SAMPLE_DATA__ && new URLSearchParams(location.search).get('demo') === '1';

/** Pick the data layer. Demo mode exists only in SAMPLE_DATA builds; the branch is removed from production builds. */
export async function getApi(): Promise<Api | null> {
  if (__SAMPLE_DATA__ && isDemo()) {
    const { createDemoApi } = await import('./demo-api');
    return createDemoApi();
  }
  const { createSupabaseApi, supabaseConfigured } = await import('./supabase-api');
  return supabaseConfigured() ? createSupabaseApi() : null;
}

export function setMessage(el: HTMLElement | null, text: string, kind: '' | 'error' | 'ok' = '') {
  if (!el) return;
  el.textContent = text;
  el.className = 'notice' + (kind ? ' ' + kind : '');
  el.hidden = !text;
}

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** CSV with quotes escaped and spreadsheet-formula characters neutralised. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
}

export function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const UMICH = /^[^\s@]+@umich\.edu$/;

// Sign-out buttons on any state panel.
document.addEventListener('click', async (e) => {
  if (!(e.target as HTMLElement).closest?.('[data-signout]')) return;
  const api = await getApi();
  await api?.signOut();
  location.reload();
});
