import { getApi, showState, $, $$, setMessage, errText, UMICH } from './common';
import { processHeadshot } from './image';
import type { Profile, Placement, ProfileInput } from './types';

const LINKEDIN = /^https:\/\/www\.linkedin\.com\/in\/[^\s/?#]+\/?$/;
const STATUS_TEXT: Record<string, string> = { draft: 'Draft', submitted: 'Waiting for board approval', approved: 'Published' };

(async () => {
  const api = await getApi();
  if (!api) return showState('unconfigured');
  const msg = $('#msg');
  $('#btn-signout')?.addEventListener('click', async () => { await api.signOut(); location.reload(); });

  let session;
  try { session = await api.getSession(); } catch (e) { setMessage(msg, errText(e), 'error'); }
  if (!session) return showState('signedout');
  if (!UMICH.test(session.email)) return showState('wrongdomain');
  let access;
  try { access = await api.access(); } catch (e) { showState('signedout'); return setMessage(msg, errText(e), 'error'); }
  if (access === 'none') return showState('none');
  $('#link-admin')!.hidden = access !== 'admin';

  const form = $<HTMLFormElement>('#profile-form')!;
  const f = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
  let profile: Profile | null = null;
  let newHeadshot: Blob | null = null;
  let previewUrl: string | null = null;

  const preview = $<HTMLImageElement>('#headshot-preview')!;
  function setPreview(src: string | null) {
    preview.hidden = !src;
    if (src) preview.src = src;
  }

  function renderPlacement(p: Placement = { firm: '', team: '', kind: 'internship', year: new Date().getFullYear() }) {
    const tpl = $<HTMLTemplateElement>('#placement-tpl')!;
    const row = (tpl.content.firstElementChild as HTMLElement).cloneNode(true) as HTMLElement;
    const set = (n: string, v: string) => ((row.querySelector(`[data-f=${n}]`) as HTMLInputElement).value = v);
    set('firm', p.firm); set('team', p.team ?? ''); set('kind', p.kind); set('year', p.year ? String(p.year) : '');
    row.dataset.id = p.id ?? '';
    // Unique ids so the labels point at their inputs.
    const n = $$('.placement-row').length + Math.floor(Math.random() * 1e6);
    row.querySelectorAll('[data-f]').forEach((inp) => {
      const id = `pl-${(inp as HTMLElement).dataset.f}-${n}`;
      inp.id = id;
      (row.querySelector(`label[data-for=${(inp as HTMLElement).dataset.f}]`) as HTMLLabelElement).htmlFor = id;
    });
    row.querySelector('[data-remove]')!.addEventListener('click', () => { row.remove(); $('#placement-list')!.dispatchEvent(new Event('change')); });
    $('#placement-list')!.append(row);
  }
  $('#btn-add-placement')!.addEventListener('click', () => renderPlacement());

  function readPlacements(): Placement[] {
    return $$('.placement-row').map((row) => {
      const g = (n: string) => (row.querySelector(`[data-f=${n}]`) as HTMLInputElement).value;
      return { firm: g('firm'), team: g('team') || null, kind: g('kind') as Placement['kind'], year: g('year') ? Number(g('year')) : null };
    });
  }

  function renderStatus() {
    const el = $('#status-line')!;
    const s = profile?.status ?? 'draft';
    el.textContent = s === 'changes_requested' ? `Changes requested: ${profile?.review_note ?? ''}` : STATUS_TEXT[s];
    $('#btn-unpublish')!.hidden = !(profile && profile.published);
    $('#btn-delete')!.hidden = !profile;
  }

  function fill(p: Profile | null, placements: Placement[], boardTitle: string | null) {
    profile = p;
    f('full_name').value = p?.full_name ?? '';
    f('class_year').value = p?.class_year ? String(p.class_year) : '';
    f('school').value = p?.school ?? '';
    f('major').value = p?.major ?? '';
    f('linkedin_url').value = p?.linkedin_url ?? '';
    f('bio').value = p?.bio ?? '';
    for (const k of ['show_identity', 'show_headshot', 'show_linkedin', 'show_placements', 'show_name_on_placements'] as const) f(k).checked = !!p?.[k];
    $('#placement-list')!.innerHTML = '';
    placements.forEach((x) => renderPlacement(x));
    setPreview(p?.headshot_path ? api!.headshotUrl(p.headshot_path) : null);
    $('#board-title-row')!.hidden = !boardTitle;
    $('#board-title')!.textContent = boardTitle ?? '';
    count();
    renderStatus();
  }
  const count = () => ($('#bio-count')!.textContent = `${f('bio').value.length} / 400`);
  f('bio').addEventListener('input', count);

  // Headshot: crop, resize and re-encode in the browser before anything is uploaded.
  f('headshot').addEventListener('change', async () => {
    const file = (f('headshot') as HTMLInputElement).files?.[0];
    setErr('headshot', '');
    if (!file) return;
    try {
      newHeadshot = await processHeadshot(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(newHeadshot);
      setPreview(previewUrl);
    } catch (e) {
      newHeadshot = null;
      (f('headshot') as HTMLInputElement).value = '';
      setErr('headshot', errText(e));
    }
  });

  function setErr(name: string, text: string) {
    const el = $(`[data-err=${name}]`);
    if (el) el.textContent = text;
    const inp = form.elements.namedItem(name) as HTMLElement | null;
    if (inp && 'setAttribute' in inp) inp.setAttribute('aria-invalid', text ? 'true' : 'false');
  }

  function validate(forSubmit: boolean): ProfileInput | null {
    let ok = true;
    const need = (name: string, label: string) => {
      const empty = !f(name).value.trim();
      setErr(name, empty ? `${label} is required.` : '');
      if (empty) ok = false;
    };
    need('full_name', 'Full name');
    if (forSubmit) { need('class_year', 'Class year'); need('school', 'School'); need('major', 'Major'); }
    const yr = f('class_year').value.trim();
    if (yr && (!/^\d{4}$/.test(yr) || +yr < 2015 || +yr > 2040)) { setErr('class_year', 'Enter a year from 2015 to 2040.'); ok = false; } else setErr('class_year', '');
    const li = f('linkedin_url').value.trim();
    if (li && !LINKEDIN.test(li)) { setErr('linkedin_url', 'Use a link that starts with https://www.linkedin.com/in/'); ok = false; } else setErr('linkedin_url', '');
    const bioLen = f('bio').value.length;
    if (bioLen > 400) { setErr('bio', 'Keep the bio to 400 characters.'); ok = false; } else setErr('bio', '');
    // Placements need a firm; year must be a four-digit number when given.
    for (const row of $$('.placement-row')) {
      const firm = (row.querySelector('[data-f=firm]') as HTMLInputElement).value.trim();
      const year = (row.querySelector('[data-f=year]') as HTMLInputElement).value.trim();
      const bad = !firm || (year !== '' && (!/^\d{4}$/.test(year) || +year < 2015 || +year > 2040));
      row.setAttribute('aria-invalid', String(bad));
      if (bad) { ok = false; (row.querySelector('[data-f=firm]') as HTMLInputElement).setAttribute('aria-invalid', String(!firm)); }
    }
    if ($$('.placement-row').length > 20) { setMessage(msg, 'Add at most 20 placements.', 'error'); return null; }
    if (!ok) { setMessage(msg, 'Fix the highlighted fields.', 'error'); form.querySelector<HTMLElement>('[aria-invalid=true]')?.focus(); return null; }
    return {
      full_name: f('full_name').value.trim(),
      class_year: yr ? Number(yr) : null,
      school: f('school').value.trim() || null,
      major: f('major').value.trim() || null,
      linkedin_url: li || null,
      headshot_path: profile?.headshot_path ?? null,
      bio: f('bio').value.trim() || null,
      show_identity: f('show_identity').checked,
      show_headshot: f('show_headshot').checked,
      show_linkedin: f('show_linkedin').checked,
      show_placements: f('show_placements').checked,
      show_name_on_placements: f('show_name_on_placements').checked,
    };
  }

  async function save(status: 'draft' | 'submitted') {
    setMessage(msg, '');
    const input = validate(status === 'submitted');
    if (!input) return;
    setBusy(true);
    try {
      profile = await api!.saveProfile(session!.userId, profile, input, status, readPlacements(), newHeadshot);
      newHeadshot = null;
      (f('headshot') as HTMLInputElement).value = '';
      const d = await api!.getMyProfile(session!.userId);
      fill(d.profile, d.placements, d.boardTitle);
      setMessage(msg, status === 'submitted' ? 'Submitted for approval.' : 'Draft saved.', 'ok');
    } catch (e) {
      setMessage(msg, errText(e), 'error');
    } finally { setBusy(false); }
  }
  const setBusy = (b: boolean) => $$('button', form).forEach((x) => ((x as HTMLButtonElement).disabled = b));

  form.addEventListener('submit', (e) => e.preventDefault());
  $('#btn-draft')!.addEventListener('click', () => save('draft'));
  $('#btn-submit')!.addEventListener('click', () => save('submitted'));
  $('#btn-unpublish')!.addEventListener('click', async () => {
    if (!confirm('Remove your profile from the public site? It goes back to a draft.')) return;
    setBusy(true);
    try { await api!.unpublish(); const d = await api!.getMyProfile(session!.userId); fill(d.profile, d.placements, d.boardTitle); setMessage(msg, 'Unpublished. Your profile is a draft again.', 'ok'); }
    catch (e) { setMessage(msg, errText(e), 'error'); } finally { setBusy(false); }
  });
  $('#btn-delete')!.addEventListener('click', async () => {
    if (!profile || !confirm('Delete your profile? This cannot be undone.')) return;
    setBusy(true);
    try { await api!.deleteProfile(session!.userId, profile); fill(null, [], null); setMessage(msg, 'Your profile is deleted. It leaves the public site at the next rebuild.', 'ok'); }
    catch (e) { setMessage(msg, errText(e), 'error'); } finally { setBusy(false); }
  });

  try {
    const d = await api.getMyProfile(session.userId);
    fill(d.profile, d.placements, d.boardTitle);
    showState('ready');
  } catch (e) {
    showState('signedout');
    setMessage(msg, errText(e), 'error');
  }
})();
