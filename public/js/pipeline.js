(() => {
  'use strict';

  const STATUSES = ['todo', 'doing', 'done', 'blocked'];
  const LABEL = { todo: 'do zrobienia', doing: 'w toku', done: 'zrobione', blocked: 'blokada' };

  let state = null;
  let active = 0;
  let saveTimer = null;
  const openSteps = new Set();

  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, txt) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  };
  const uid = (p) => p + '-' + Math.random().toString(36).slice(2, 8);

  /* ---------- stan ---------- */

  function normalize(d) {
    d.meta = d.meta || {};
    d.stages = d.stages || [];
    d.stages.forEach((st, i) => {
      st.id = st.id || uid('stage');
      st.num = st.num != null ? st.num : String(i);
      st.steps = st.steps || [];
      st.steps.forEach((s) => {
        s.id = s.id || uid('step');
        s.status = STATUSES.includes(s.status) ? s.status : 'todo';
        s.desc = s.desc || '';
        s.cmd = s.cmd || '';
        s.checks = (s.checks || []).map((c) =>
          typeof c === 'string' ? { t: c, d: false } : { t: c.t || '', d: !!c.d }
        );
        // Ustawienia fabryczne kroku. Gdy ich nie ma, fabryka = to, co przyszło w szablonie.
        s.factory = s.factory
          ? {
              title: s.factory.title != null ? s.factory.title : s.title,
              desc: s.factory.desc || '',
              cmd: s.factory.cmd || '',
              checks: (s.factory.checks || []).map((c) => (typeof c === 'string' ? c : c.t || ''))
            }
          : snapshot(s);
      });
    });
    return d;
  }

  function flag(kind, text) {
    const f = $('#saveFlag');
    f.className = 'saveflag ' + kind;
    f.textContent = text;
  }

  function touch() {
    clearTimeout(saveTimer);
    flag('', 'zapisuję…');
    saveTimer = setTimeout(async () => {
      state.meta.updated = new Date().toISOString().slice(0, 10);
      const where = await Store.save(state);
      flag(where === 'server' ? 'ok' : 'local',
        where === 'server' ? 'zapisano w repo' : 'tylko postęp');
      const f = document.getElementById('saveFlag');
      f.title = where === 'server'
        ? 'Struktura zapisana do szablonu, postęp do data/state.json'
        : 'Brak serwera: postęp zapisany w przeglądarce, zmiany struktury nie przetrwają odświeżenia. Uruchom „npm start”.';
      $('#tplUpdated').textContent = state.meta.updated;
    }, 500);
  }

  /* ---------- ustawienia fabryczne kroku ---------- */

  function snapshot(s) {
    return {
      title: s.title,
      desc: s.desc || '',
      cmd: s.cmd || '',
      checks: (s.checks || []).map((c) => c.t)
    };
  }

  function isDirty(s) {
    const f = s.factory;
    if (!f) return false;
    return s.title !== f.title
      || (s.desc || '') !== f.desc
      || (s.cmd || '') !== f.cmd
      || s.checks.map((c) => c.t).join('\u0000') !== f.checks.join('\u0000');
  }

  // Powrót do fabryki: treść kroku wraca do wzorca, a odhaczenia pozycji,
  // które w fabryce istnieją pod tą samą nazwą, zostają nietknięte.
  function restoreFactory(s) {
    const wasDone = new Map(s.checks.map((c) => [c.t, c.d]));
    s.title = s.factory.title;
    s.desc = s.factory.desc;
    s.cmd = s.factory.cmd;
    s.checks = s.factory.checks.map((t) => ({ t, d: !!wasDone.get(t) }));
  }

  const stageDone = (st) => st.steps.filter((s) => s.status === 'done').length;
  const stagePct = (st) => (st.steps.length ? Math.round((stageDone(st) / st.steps.length) * 100) : 0);

  /* ---------- render: wstążka ---------- */

  function renderRail() {
    const rail = $('#rail');
    rail.textContent = '';

    state.stages.forEach((st, i) => {
      const pct = stagePct(st);
      const tile = el('button', 'tile' + (i === active ? ' is-active' : '') + (pct === 100 ? ' is-done' : ''));
      tile.type = 'button';

      const ring = el('span', 'ring');
      ring.style.setProperty('--p', pct);
      ring.dataset.num = st.num;
      tile.appendChild(ring);

      const meta = el('span', 'tile__meta');
      meta.appendChild(el('span', 'tile__name', st.short || st.title));
      meta.appendChild(el('span', 'tile__count', stageDone(st) + '/' + st.steps.length));
      tile.appendChild(meta);

      tile.onclick = () => { active = i; render(); };
      rail.appendChild(tile);
    });

    const add = el('button', 'tile', '+ etap');
    add.type = 'button';
    add.style.color = 'var(--ink-3)';
    add.style.minWidth = '78px';
    add.onclick = () => {
      state.stages.push({
        id: uid('stage'), num: String(state.stages.length), title: 'Nowy etap',
        short: 'Nowy etap', input: '', output: '', doc: '', steps: []
      });
      active = state.stages.length - 1;
      touch(); render();
    };
    rail.appendChild(add);

    const total = state.stages.reduce((a, s) => a + s.steps.length, 0);
    const done = state.stages.reduce((a, s) => a + stageDone(s), 0);
    $('#globalBar').style.width = (total ? (done / total) * 100 : 0) + '%';
    $('#globalCount').textContent = done + ' / ' + total + ' kroków';
  }

  /* ---------- render: arkusz etapu ---------- */

  function editable(node, onCommit) {
    const before = node.textContent.trim();
    node.contentEditable = 'true';
    node.spellcheck = false;
    node.addEventListener('blur', () => {
      const now = node.textContent.trim();
      if (now !== before) onCommit(now);
    });
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && node.tagName !== 'PRE') { e.preventDefault(); node.blur(); }
      if (e.key === 'Escape') node.blur();
    });
    return node;
  }

  function renderStage() {
    const wrap = $('#stage');
    wrap.textContent = '';
    const st = state.stages[active];
    if (!st) return;

    /* nagłówek etapu */
    const head = el('div', 'stagehead');
    head.appendChild(el('span', 'stagehead__eyebrow',
      'Etap ' + st.num + ' z ' + (state.stages.length - 1) + ' · ' + stagePct(st) + '% zrobione'));

    const h1 = el('h1', 'stagehead__title', st.title);
    editable(h1, (v) => { st.title = v || 'Bez nazwy'; st.short = st.short || v; touch(); renderRail(); });
    head.appendChild(h1);

    const flow = el('div', 'flow');
    const chipIn = editable(el('span', 'chip', st.input || '—'), (v) => { st.input = v; touch(); });
    const chipOut = editable(el('span', 'chip', st.output || '—'), (v) => { st.output = v; touch(); });
    flow.appendChild(el('span', null, 'wejście'));
    flow.appendChild(chipIn);
    flow.appendChild(el('span', 'flow__arrow', '→'));
    flow.appendChild(el('span', null, 'wyjście'));
    flow.appendChild(chipOut);
    const doc = editable(el('span', 'flow__doc', st.doc || 'docs/…'), (v) => { st.doc = v; touch(); });
    flow.appendChild(doc);
    head.appendChild(flow);
    wrap.appendChild(head);

    /* kroki */
    st.steps.forEach((s, idx) => wrap.appendChild(renderStep(st, s, idx)));

    const add = el('button', 'addstep', '+ dodaj krok do tego etapu');
    add.type = 'button';
    add.onclick = () => {
      st.steps.push({ id: uid('step'), title: 'Nowy krok', desc: '', cmd: '', checks: [], status: 'todo' });
      touch(); render();
      const last = wrap.querySelectorAll('.step');
      if (last.length) last[last.length - 1].querySelector('.step__title').focus();
    };
    wrap.appendChild(add);

    if (state.stages.length > 1) {
      const del = el('button', 'mini danger', 'usuń cały etap „' + (st.short || st.title) + '”');
      del.style.marginTop = '18px';
      del.onclick = () => {
        if (!confirm('Usunąć etap i wszystkie jego kroki?')) return;
        state.stages.splice(active, 1);
        active = Math.max(0, active - 1);
        touch(); render();
      };
      wrap.appendChild(del);
    }
  }

  function renderStep(st, s, idx) {
    const node = el('div', 'step');
    node.dataset.status = s.status;
    node.dataset.id = s.id;
    node.draggable = false;

    /* --- głowa --- */
    const head = el('div', 'step__head');

    const grip = el('span', 'grip', '⣿');
    grip.title = 'Przeciągnij, aby zmienić kolejność';
    grip.onmousedown = () => { node.draggable = true; };
    grip.onmouseup = () => { node.draggable = false; };
    head.appendChild(grip);

    const tick = el('button', 'tick', '✓');
    tick.type = 'button';
    tick.title = 'Zrobione / do zrobienia';
    tick.onclick = () => { s.status = s.status === 'done' ? 'todo' : 'done'; touch(); render(); };
    head.appendChild(tick);

    const tw = el('div', 'step__titlewrap');
    if (isDirty(s)) {
      const badge = el('span', 'badge', 'poza wzorcem');
      badge.title = 'Ten krok różni się od ustawień fabrycznych';
      tw.appendChild(badge);
    }
    const title = editable(el('span', 'step__title', s.title), (v) => {
      s.title = v || 'Bez nazwy'; touch(); render();
    });
    tw.appendChild(title);
    if (s.desc) tw.appendChild(el('span', 'step__teaser', s.desc));
    head.appendChild(tw);

    const status = el('button', 'status', LABEL[s.status]);
    status.type = 'button';
    status.title = 'Kliknij, aby zmienić status';
    status.onclick = () => {
      s.status = STATUSES[(STATUSES.indexOf(s.status) + 1) % STATUSES.length];
      touch(); render();
    };
    head.appendChild(status);

    const toggle = () => {
      const open = node.classList.toggle('is-open');
      if (open) openSteps.add(s.id); else openSteps.delete(s.id);
      caret.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    const caret = el('button', 'caret', '▾');
    caret.type = 'button';
    caret.setAttribute('aria-label', 'Rozwiń krok');
    caret.onclick = toggle;
    head.appendChild(caret);

    // Cala glowa karty jest przelacznikiem - poza miejscami, ktore maja wlasne zadanie.
    head.addEventListener('click', (e) => {
      if (e.target.closest('.step__title, .tick, .status, .grip, .caret')) return;
      toggle();
    });

    title.addEventListener('focus', () => { node.classList.add('is-open'); openSteps.add(s.id); });
    if (openSteps.has(s.id)) {
      node.classList.add('is-open');
      caret.setAttribute('aria-expanded', 'true');
    }
    node.appendChild(head);

    /* --- ciało --- */
    const body = el('div', 'step__body');

    const desc = editable(el('p', 'desc', s.desc || 'Dopisz, o co tu chodzi i czego pilnujemy.'),
      (v) => { s.desc = v; touch(); render(); });
    body.appendChild(desc);

    if (s.cmd) {
      body.appendChild(cmdBlock(s));
    }

    const ul = el('ul', 'checks');
    s.checks.forEach((c, ci) => {
      const li = el('li');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = c.d;
      box.onchange = () => { c.d = box.checked; touch(); };
      li.appendChild(box);
      li.appendChild(editable(el('span', null, c.t), (v) => { c.t = v; touch(); render(); }));
      const kill = el('button', 'kill', '×');
      kill.type = 'button';
      kill.title = 'Usuń pozycję';
      kill.onclick = () => { s.checks.splice(ci, 1); touch(); render(); };
      li.appendChild(kill);
      ul.appendChild(li);
    });
    body.appendChild(ul);

    const tools = el('div', 'step__tools');
    tools.appendChild(mini('+ pozycja kontrolna', () => {
      s.checks.push({ t: 'nowa pozycja', d: false }); touch(); render();
    }));
    if (!s.cmd) {
      tools.appendChild(mini('+ komenda', () => { s.cmd = '# komenda'; touch(); render(); }));
    } else {
      const killCmd = mini('usuń komendę', () => {
        if (!confirm('Usunąć komendę z tego kroku?\nSam krok i lista kontrolna zostają.')) return;
        s.cmd = ''; touch(); render();
      });
      killCmd.classList.add('danger');
      tools.appendChild(killCmd);
    }
    tools.appendChild(mini('duplikuj krok', () => {
      const copy = JSON.parse(JSON.stringify(s));
      copy.id = uid('step');
      copy.status = 'todo';
      copy.checks.forEach((c) => (c.d = false));
      st.steps.splice(idx + 1, 0, copy); touch(); render();
    }));
    const dirty = isDirty(s);

    const back = mini('przywróć fabryczne', () => {
      if (!confirm('Przywrócić fabryczny tytuł, opis, komendę i listę kontrolną tego kroku?\n'
        + 'Status i odhaczenia zostają. Zmiany treści przepadną.')) return;
      restoreFactory(s); touch(); render();
    });
    back.title = dirty
      ? 'Wróć do wzorca zapisanego w szablonie'
      : 'Ten krok jest zgodny z ustawieniami fabrycznymi';
    if (!dirty) back.disabled = true;
    tools.appendChild(back);

    const seal = mini('zapisz jako fabryczne', () => {
      if (!confirm('Uznać obecną treść tego kroku za nowy wzorzec?\n'
        + 'Od teraz „przywróć fabryczne” będzie wracać właśnie tutaj.')) return;
      s.factory = snapshot(s); touch(); render();
    });
    seal.title = 'Zapisz obecny tytuł, opis, komendę i listę kontrolną jako wzorzec';
    if (!dirty) seal.disabled = true;
    tools.appendChild(seal);

    const del = mini('usuń krok', () => {
      if (!confirm('Usunąć krok „' + s.title + '”?')) return;
      st.steps.splice(idx, 1); touch(); render();
    });
    del.classList.add('danger');
    tools.appendChild(del);
    body.appendChild(tools);

    node.appendChild(body);
    wireDrag(node, st);
    return node;
  }

  function cmdBlock(s) {
    const box = el('div', 'cmd');
    const pre = el('pre', null, s.cmd);
    pre.contentEditable = 'true';
    pre.spellcheck = false;
    pre.addEventListener('blur', () => {
      const now = pre.textContent.replace(/\s+$/, '');
      if (now === s.cmd) return;
      s.cmd = now; touch(); render();
    });
    box.appendChild(pre);

    const tools = el('div', 'cmd__tools');

    // Dluga komenda zostaje zwinieta do kilku wierszy - karta nie rosnie w nieskonczonosc.
    const expand = el('button', 'cmd__btn', 'rozwiń');
    expand.type = 'button';
    expand.hidden = true;
    expand.onclick = () => {
      const tall = box.classList.toggle('is-tall');
      expand.textContent = tall ? 'zwiń' : 'rozwiń';
    };
    tools.appendChild(expand);

    const copy = el('button', 'cmd__btn', 'kopiuj');
    copy.type = 'button';
    copy.onclick = () => {
      navigator.clipboard.writeText(s.cmd).then(() => {
        copy.textContent = 'skopiowano';
        setTimeout(() => (copy.textContent = 'kopiuj'), 1200);
      });
    };
    tools.appendChild(copy);
    box.appendChild(tools);

    // „rozwiń” pokazuje sie tylko wtedy, gdy naprawde jest co rozwijac.
    // Liczymy z tresci, nie z ukladu - krok bywa jeszcze zwiniety i nic nie ma wymiarow.
    const CMD_LINES = 4;
    if (s.cmd.split('\n').length > CMD_LINES) {
      expand.hidden = false;
      box.classList.add('is-clipped');
    }

    return box;
  }

  function mini(label, fn) {
    const b = el('button', 'mini', label);
    b.type = 'button';
    b.onclick = fn;
    return b;
  }

  /* ---------- drag & drop kroków ---------- */

  let dragId = null;

  function wireDrag(node, st) {
    node.addEventListener('dragstart', () => {
      dragId = node.dataset.id;
      node.classList.add('dragging');
    });
    node.addEventListener('dragend', () => {
      dragId = null;
      node.draggable = false;
      node.classList.remove('dragging');
      document.querySelectorAll('.step').forEach((n) => n.classList.remove('dragover'));
    });
    node.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (dragId && dragId !== node.dataset.id) node.classList.add('dragover');
    });
    node.addEventListener('dragleave', () => node.classList.remove('dragover'));
    node.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!dragId || dragId === node.dataset.id) return;
      const from = st.steps.findIndex((x) => x.id === dragId);
      const to = st.steps.findIndex((x) => x.id === node.dataset.id);
      if (from < 0 || to < 0) return;
      st.steps.splice(to, 0, st.steps.splice(from, 1)[0]);
      touch(); render();
    });
  }

  /* ---------- render ---------- */

  function render() {
    renderRail();
    renderStage();
    $('#siteTitle').textContent = state.meta.title || 'Pipeline wydawniczy';
    $('#siteSubtitle').textContent = state.meta.subtitle || '';
    $('#bookName').textContent = state.meta.currentBook || 'bez tytułu';
    $('#tplVersion').textContent = state.meta.templateVersion || '–';
    $('#tplUpdated').textContent = state.meta.updated || '–';
  }

  /* ---------- pasek narzędzi ---------- */

  function wireToolbar() {
    $('#bookName').addEventListener('blur', (e) => {
      state.meta.currentBook = e.target.textContent.trim() || 'bez tytułu';
      touch();
    });
    $('#bookName').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    });

    $('#btnExport').onclick = () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'pipeline-' + (state.meta.currentBook || 'ksiazka')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
    };

    $('#fileImport').onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = () => {
        try {
          state = normalize(JSON.parse(fr.result));
          active = 0;
          touch(); render();
        } catch (_) { alert('To nie jest poprawny plik JSON pipeline’u.'); }
      };
      fr.readAsText(f);
      e.target.value = '';
    };

    $('#btnNewBook').onclick = () => {
      const name = prompt('Tytuł nowej książki:', '');
      if (name === null) return;
      if (!confirm('Wyzerować statusy i odhaczenia?\n'
        + 'Struktura pipeline\u2019u zostaje – to ona jest szablonem przenoszonym na kolejne tytuły.')) return;
      state.meta.currentBook = name.trim() || 'bez tytułu';
      state.stages.forEach((st) => st.steps.forEach((s) => {
        s.status = 'todo';
        s.checks.forEach((c) => (c.d = false));
      }));
      active = 0;
      touch(); render();
    };
  }

  /* ---------- start ---------- */

  (async () => {
    try {
      const { data, from } = await Store.load();
      state = normalize(data);
      wireToolbar();
      render();
      flag(from === 'server' ? 'ok' : from === 'local' ? 'local' : '',
        from === 'server' ? 'stan z repo' : from === 'local' ? 'postęp lokalny' : 'świeży szablon');
      if (from !== 'server') {
        document.getElementById('saveFlag').title =
          'Strona działa bez serwera: struktura czytana wprost z szablonu, postęp z przeglądarki. '
          + 'Uruchom „npm start”, żeby zapisywać do repo.';
      }
    } catch (err) {
      document.getElementById('stage').textContent =
        'Nie udało się wczytać szablonu: ' + err.message + ' — uruchom „npm start” i otwórz http://localhost:3000';
    }
  })();
})();
