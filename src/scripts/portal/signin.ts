import { getApi, showState, $, setMessage, errText, base, UMICH } from './common';

(async () => {
  const api = await getApi();
  if (!api) return showState('unconfigured');
  const err = $('#msg');
  $('#btn-signin')?.addEventListener('click', async () => {
    try { await api.signIn(); } catch (e) { setMessage(err, errText(e), 'error'); }
  });
  $('#btn-signout')?.addEventListener('click', async () => { await api.signOut(); location.reload(); });
  try {
    const s = await api.getSession();
    if (!s) return showState('signedout');
    if (!UMICH.test(s.email)) return showState('wrongdomain');
    const access = await api.access();
    if (access === 'none') return showState('wrongdomain');
    $('#link-admin')!.hidden = access !== 'admin';
    showState('ready');
  } catch (e) {
    showState('signedout');
    setMessage(err, errText(e), 'error');
  }
  void base;
})();
