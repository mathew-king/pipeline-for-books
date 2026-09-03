/*
  Zasada: STRUKTURA zawsze pochodzi z szablonu (public/data/pipeline-template.json),
  a przegladarka trzyma tylko POSTEP. Dzieki temu zmiana w szablonie jest widoczna
  natychmiast i nigdy nie jest przeslaniana starym stanem z localStorage.

  Z serwerem (`npm start`): stan idzie do repo, struktura zapisuje sie do szablonu.
  Bez serwera (Live Server, plik lokalny): postep zostaje w przegladarce,
  ale zmiany struktury nie maja gdzie sie zapisac - ida do wyrzucenia po odswiezeniu.
*/
const Store = (() => {
  const LS_KEY = 'tdw-pipeline-v1';
  const TPL_URL = 'data/pipeline-template.json';
  let hasServer = false;

  const blank = () => ({ currentBook: '', updated: '', steps: {} });

  function extractProgress(state) {
    const out = {
      currentBook: (state.meta && state.meta.currentBook) || '',
      updated: (state.meta && state.meta.updated) || '',
      steps: {}
    };
    (state.stages || []).forEach((st) => (st.steps || []).forEach((s) => {
      const checks = {};
      (s.checks || []).forEach((c) => { if (c && c.d) checks[c.t] = true; });
      const e = {};
      if (s.status && s.status !== 'todo') e.status = s.status;
      if (Object.keys(checks).length) e.checks = checks;
      if (Object.keys(e).length) out.steps[s.id] = e;
    }));
    return out;
  }

  function applyProgress(tpl, prog) {
    tpl.meta = tpl.meta || {};
    if (prog.currentBook) tpl.meta.currentBook = prog.currentBook;
    if (prog.updated) tpl.meta.updated = prog.updated;
    (tpl.stages || []).forEach((st) => (st.steps || []).forEach((s) => {
      const p = prog.steps[s.id];
      if (!p) return;
      if (p.status) s.status = p.status;
      if (p.checks) (s.checks || []).forEach((c) => { if (p.checks[c.t]) c.d = true; });
    }));
    return tpl;
  }

  async function fetchTemplate() {
    const r = await fetch(TPL_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('Brak pliku ' + TPL_URL);
    return r.json();
  }

  function readProgress() {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    try {
      const p = JSON.parse(raw);
      // stary format: w localStorage lezal pelny stan - bierzemy z niego tylko postep
      return Array.isArray(p.stages) ? extractProgress(p) : Object.assign(blank(), p);
    } catch (_) {
      return null;
    }
  }

  async function load() {
    try {
      const r = await fetch('api/state', { cache: 'no-store' });
      if (r.ok) {
        hasServer = true;
        const data = await r.json();
        if (data && data.stages) return { data, from: 'server' };
      }
    } catch (_) { /* brak serwera - lecimy z pliku szablonu */ }

    const tpl = await fetchTemplate();
    const prog = readProgress();
    return { data: prog ? applyProgress(tpl, prog) : tpl, from: prog ? 'local' : 'template' };
  }

  async function save(state) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(extractProgress(state))); } catch (_) {}
    if (hasServer) {
      try {
        const r = await fetch('api/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state)
        });
        if (r.ok) return 'server';
      } catch (_) {}
      hasServer = false;
    }
    return 'local';
  }

  return { load, save, fetchTemplate };
})();
