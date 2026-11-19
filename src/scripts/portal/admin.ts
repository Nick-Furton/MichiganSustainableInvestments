import { getApi, showState, $, $$, setMessage, errText, toCsv, download, UMICH } from './common';

(async () => {
  const api = await getApi();
  if (!api) return showState('unconfigured');
  const msg = $('#msg');
  let session;
  try { session = await api.getSession(); } catch (e) { setMessage(msg, errText(e), 'error'); }
  if (!session) return showState('signedout');
  if (!UMICH.test(session.email)) return showState('wrongdomain');
  let access;
  try { access = await api.access(); } catch (e) { showState('signedout'); return setMessage(msg, errText(e), 'error'); }
  if (access === 'none') return showState('wrongdomain');
  if (access !== 'admin') return showState('forbidden');
  showState('ready');

  const run = async (fn: () => Promise<void>, ok = '') => {
    try { setMessage(msg, ''); await fn(); if (ok) setMessage(msg, ok, 'ok'); }
    catch (e) { setMessage(msg, errText(e), 'error'); }
  };
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (string | Node)[]): HTMLElementTagNameMap[K] => {
    const n = Object.assign(document.createElement(tag), props) as HTMLElementTagNameMap[K];
    n.append(...kids);
    return n;
  };

  // Tabs
  const tabs = $$('.tab');
  const select = (tab: HTMLElement) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $('#' + t.getAttribute('aria-controls'))!.hidden = !on;
    }
    if (tab.id === 'tab-review') loadReview();
    if (tab.id === 'tab-board') loadBoard();
    if (tab.id === 'tab-messages') loadMessages();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      const k = (e as KeyboardEvent).key;
      if (k !== 'ArrowRight' && k !== 'ArrowLeft') return;
      const next = tabs[(i + (k === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      select(next); next.focus();
    });
  });

  // Roster
  async function loadRoster() {
    const list = $('#roster-list')!;
    list.replaceChildren();
    for (const email of await api!.listRoster()) {
      const btn = el('button', { type: 'button', className: 'btn btn-outline btn-sm', textContent: 'Remove' });
      btn.setAttribute('aria-label', `Remove ${email}`);
      btn.addEventListener('click', () => run(async () => { await api!.removeRoster(email); await loadRoster(); }));
      list.append(el('tr', {}, el('td', {}, email), el('td', {}, btn)));
    }
  }
  $('#roster-form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $<HTMLTextAreaElement>('#roster-input')!;
    const items = input.value.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const bad = items.filter((x) => !UMICH.test(x));
    if (bad.length) return setMessage(msg, `Not a valid @umich.edu address: ${bad.join(', ')}`, 'error');
    if (!items.length) return;
    run(async () => { await api!.addRoster([...new Set(items)]); input.value = ''; await loadRoster(); }, 'Added to the roster.');
  });
  run(loadRoster);

  // Review queue
  async function loadReview() {
    await run(async () => {
      const box = $('#review-list')!;
      box.replaceChildren();
      const onRoster = new Set(await api!.listRoster());
      const items = await api!.listSubmitted();
      const deleteBtn = (p: { id: string; full_name: string | null; email: string }) => {
        const b = el('button', { type: 'button', className: 'btn btn-danger btn-sm', textContent: 'Delete' });
        b.setAttribute('aria-label', `Delete ${p.full_name ?? p.email}`);
        b.addEventListener('click', () => {
          if (!confirm('Delete this profile? This cannot be undone.')) return;
          run(async () => { await api!.adminDeleteProfile(p.id); await loadReview(); setMessage(msg, 'Profile deleted.', 'ok'); });
        });
        return b;
      };
      if (!items.length) box.append(el('p', { className: 'notice' }, 'No profiles are waiting for review.'));
      for (const { profile: p, placements } of items) {
        const shown = [p.show_identity && 'name, class year and program', p.show_headshot && 'headshot', p.show_linkedin && 'LinkedIn link', p.show_placements && 'placements', p.show_name_on_placements && 'name next to placements'].filter(Boolean) as string[];
        const head = el('div', { className: 'head' });
        if (p.headshot_path) head.append(Object.assign(el('img', { className: 'headshot-preview', alt: `Headshot of ${p.full_name ?? 'member'}`, src: api!.headshotUrl(p.headshot_path), width: 80, height: 80 })));
        head.append(el('div', {}, el('h3', {}, p.full_name || p.email), el('div', { className: 'small' }, p.email, ...(onRoster.has(p.email) ? [] : [' ', el('span', { className: 'tag tag-new' }, 'New')]))));
        const note = el('textarea', { id: `note-${p.id}`, placeholder: 'What should the member change?' }) as HTMLTextAreaElement;
        const noteField = el('div', { className: 'field' }, el('label', { htmlFor: note.id }, 'Note to the member'), note);
        const approve = el('button', { type: 'button', className: 'btn btn-dark btn-sm', textContent: 'Approve' });
        const changes = el('button', { type: 'button', className: 'btn btn-outline btn-sm', textContent: 'Request changes' });
        approve.addEventListener('click', () => run(async () => { await api!.approve(p.id); await loadReview(); setMessage(msg, 'Approved. The public site updates at the next rebuild.', 'ok'); }));
        changes.addEventListener('click', () => {
          if (!note.value.trim()) { setMessage(msg, 'Write a note first.', 'error'); note.focus(); return; }
          run(async () => { await api!.requestChanges(p.id, note.value.trim()); await loadReview(); setMessage(msg, 'Changes requested.', 'ok'); });
        });
        const plist = el('ul', {}, ...placements.map((x) => el('li', {}, `${x.firm}${x.team ? ', ' + x.team : ''} · ${x.kind === 'internship' ? 'Internship' : 'Full-time'}${x.year ? ' · ' + x.year : ''}`)));
        box.append(el('article', { className: 'review-card' },
          head,
          el('div', {}, [p.class_year, p.major].filter(Boolean).join(' · ')),
          p.linkedin_url ? el('div', {}, p.linkedin_url) : '',
          p.bio ? el('p', { className: 'small' }, p.bio) : '',
          placements.length ? plist : '',
          el('div', {}, ...(shown.length ? shown.map((s) => el('span', { className: 'tag' }, s)) : [el('span', { className: 'tag' }, 'Nothing chosen for the public site')])),
          noteField,
          el('div', { className: 'btn-row' }, approve, changes, deleteBtn(p))));
      }
      // Published profiles, with a way to take one down.
      const pub = await api!.listPublished();
      box.append(el('h2', { style: 'font-size:28px;margin:40px 0 16px' }, 'Published'));
      if (!pub.length) box.append(el('p', { className: 'notice' }, 'No profiles are published.'));
      for (const p of pub) {
        const note = el('textarea', { id: `pub-note-${p.id}`, placeholder: 'Why is it coming down?' }) as HTMLTextAreaElement;
        const btn = el('button', { type: 'button', className: 'btn btn-danger btn-sm', textContent: 'Unpublish' });
        btn.setAttribute('aria-label', `Unpublish ${p.full_name ?? p.email}`);
        btn.addEventListener('click', () => {
          if (!note.value.trim()) { setMessage(msg, 'Write a note first.', 'error'); note.focus(); return; }
          run(async () => { await api!.unpublishProfile(p.id, note.value.trim()); await loadReview(); setMessage(msg, 'Unpublished. The public site updates at the next rebuild.', 'ok'); });
        });
        box.append(el('article', { className: 'review-card' }, el('h3', {}, p.full_name || p.email), el('div', { className: 'small' }, p.email),
          el('div', { className: 'field' }, el('label', { htmlFor: note.id }, 'Note to the member'), note), el('div', { className: 'btn-row' }, btn, deleteBtn(p))));
      }
    });
  }

  // Board titles
  async function loadBoard() {
    await run(async () => {
      const list = $('#board-list')!;
      list.replaceChildren();
      for (const r of await api!.listBoard()) {
        const title = el('input', { type: 'text', value: r.title, id: `bt-${r.profile_id}` }) as HTMLInputElement;
        const order = el('input', { type: 'number', value: String(r.sort_order), id: `bo-${r.profile_id}`, min: '0' }) as HTMLInputElement;
        title.setAttribute('aria-label', `Title for ${r.full_name}`);
        order.setAttribute('aria-label', `Display order for ${r.full_name}`);
        const save = el('button', { type: 'button', className: 'btn btn-outline btn-sm', textContent: 'Save' });
        save.setAttribute('aria-label', `Save ${r.full_name}`);
        const saveRow = () => run(() => api!.setBoard(r.profile_id, title.value, Number(order.value) || 0), 'Saved.');
        save.addEventListener('click', saveRow);
        // Also save as soon as a title or order is changed, so an edit is never lost by forgetting the row's Save button.
        title.addEventListener('change', saveRow);
        order.addEventListener('change', saveRow);
        list.append(el('tr', {}, el('td', {}, r.full_name, el('div', { className: 'small' }, r.email)), el('td', {}, title), el('td', {}, order), el('td', {}, save)));
      }
    });
  }

  // Contact messages. Written by strangers, so every field is shown as plain text (never as HTML).
  const TOPICS: Record<string, string> = { recruiting: 'Recruiting or meeting members', speaking: 'Speaking at MSI', joining: 'Joining MSI', other: 'Something else' };
  const when = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const messagesTab = $('#tab-messages')!;
  const setWaiting = (n: number) => { messagesTab.textContent = n ? `Messages (${n})` : 'Messages'; };
  async function loadMessages() {
    await run(async () => {
      const box = $('#messages-list')!;
      box.replaceChildren();
      const items = await api!.listMessages();
      if (items === null) {
        setWaiting(0);
        box.append(el('p', { className: 'notice' }, 'The contact form is not switched on. Run supabase/03_contact.sql in Supabase, then republish the site.'));
        return;
      }
      setWaiting(items.filter((m) => !m.handled_at).length);
      if (!items.length) { box.append(el('p', { className: 'notice' }, 'No messages.')); return; }
      if (items.some((m) => m.handled_at)) {
        const all = el('button', { type: 'button', className: 'btn btn-outline btn-sm', textContent: 'Delete all handled' });
        all.addEventListener('click', () => {
          if (!confirm('Delete all handled messages? This cannot be undone.')) return;
          run(async () => { await api!.deleteHandledMessages(); await loadMessages(); setMessage(msg, 'Handled messages deleted.', 'ok'); });
        });
        box.append(el('p', { className: 'btn-row' }, all));
      }
      for (const m of items) {
        const handled = !!m.handled_at;
        const who = SIMPLE_EMAIL.test(m.email) ? el('a', { href: `mailto:${encodeURIComponent(m.email).replace(/%40/g, '@')}` }, m.email) : m.email;
        const toggle = el('button', { type: 'button', className: 'btn btn-dark btn-sm', textContent: handled ? 'Reopen' : 'Mark handled' });
        toggle.setAttribute('aria-label', `${handled ? 'Reopen' : 'Mark handled'}: message from ${m.name}`);
        toggle.addEventListener('click', () => run(async () => { await api!.setMessageHandled(m.id, !handled); await loadMessages(); }));
        const del = el('button', { type: 'button', className: 'btn btn-danger btn-sm', textContent: 'Delete' });
        del.setAttribute('aria-label', `Delete message from ${m.name}`);
        del.addEventListener('click', () => {
          if (!confirm('Delete this message? This cannot be undone.')) return;
          run(async () => { await api!.deleteMessage(m.id); await loadMessages(); setMessage(msg, 'Message deleted.', 'ok'); });
        });
        box.append(el('article', { className: 'review-card' },
          el('div', {}, el('h3', {}, m.name), el('div', { className: 'small contact-meta' }, who, ...(m.organization ? [` · ${m.organization}`] : []))),
          el('div', { className: 'small' }, `${TOPICS[m.topic] ?? m.topic} · ${when(m.created_at)}`),
          el('p', { className: 'message-text' }, m.message),
          el('div', {}, el('span', { className: handled ? 'tag' : 'tag tag-new' }, handled ? 'Handled' : 'New'), ...(handled ? [el('span', { className: 'small' }, `${m.handled_by ? 'By ' + m.handled_by + ' on ' : ''}${when(m.handled_at!)}`)] : [])),
          el('div', { className: 'btn-row' }, toggle, del)));
      }
    });
  }
  // Show how many messages are waiting before the tab is opened. A missing table or a failure here stays quiet.
  api.listMessages().then((items) => setWaiting(items ? items.filter((m) => !m.handled_at).length : 0)).catch(() => {});

  // Export
  const stamp = new Date().toISOString().slice(0, 10);
  $('#export-profiles')!.addEventListener('click', () => run(async () => { const d = await api!.exportAll(); download(`msi-profiles-${stamp}.csv`, toCsv(d.profiles)); }));
  $('#export-placements')!.addEventListener('click', () => run(async () => { const d = await api!.exportAll(); download(`msi-placements-${stamp}.csv`, toCsv(d.placements)); }));
})();
