const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();

const DATA_DIR = path.join(__dirname, 'data');
const PROGRESS_FILE = path.join(DATA_DIR, 'state.json');
const TEMPLATE_FILE = path.join(__dirname, 'public', 'data', 'pipeline-template.json');

app.use(express.json({ limit: '5mb' }));

/*
  Podzial obowiazkow:

  public/data/pipeline-template.json  – SZABLON UNIWERSALNY. Struktura procesu:
      etapy, kroki, opisy, komendy, listy kontrolne, ustawienia fabryczne.
      Kazda zmiana struktury w przegladarce ladu tutaj od razu, wiec szablon
      rozwija sie w trakcie pracy nad ksiazka i wchodzi w kolejne tytuly.

  data/state.json                     – POSTEP BIEZACEJ KSIAZKI. Tylko to, co dotyczy
      jednego tytulu: nazwa ksiazki, statusy krokow, odhaczone pozycje.
      „Nowa ksiazka” zeruje ten plik, nie ruszajac szablonu.
*/

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

function blankProgress() {
  return { currentBook: '', updated: '', steps: {} };
}

// Wyciaga postep z pelnego stanu przyslanego przez przegladarke.
function extractProgress(state) {
  const out = { currentBook: state.meta && state.meta.currentBook || '',
                updated: state.meta && state.meta.updated || '',
                steps: {} };
  (state.stages || []).forEach((st) => (st.steps || []).forEach((s) => {
    const checks = {};
    (s.checks || []).forEach((c) => { if (c && c.d) checks[c.t] = true; });
    const entry = {};
    if (s.status && s.status !== 'todo') entry.status = s.status;
    if (Object.keys(checks).length) entry.checks = checks;
    if (Object.keys(entry).length) out.steps[s.id] = entry;
  }));
  return out;
}

// Zdejmuje postep ze stanu - to, co zostaje, jest szablonem.
function extractTemplate(state) {
  const t = JSON.parse(JSON.stringify(state));
  t.meta = Object.assign({}, t.meta, { currentBook: '' });
  (t.stages || []).forEach((st) => (st.steps || []).forEach((s) => {
    s.status = 'todo';
    (s.checks || []).forEach((c) => { if (c && typeof c === 'object') c.d = false; });
  }));
  return t;
}

// Stary format (pelny stan w data/state.json) czytamy jako postep.
function loadProgress() {
  if (!fs.existsSync(PROGRESS_FILE)) return blankProgress();
  try {
    const raw = readJson(PROGRESS_FILE);
    return Array.isArray(raw.stages) ? extractProgress(raw) : Object.assign(blankProgress(), raw);
  } catch (_) {
    return blankProgress();
  }
}

function merged() {
  const state = readJson(TEMPLATE_FILE);
  const prog = loadProgress();
  state.meta = state.meta || {};
  if (prog.currentBook) state.meta.currentBook = prog.currentBook;
  if (prog.updated) state.meta.updated = prog.updated;
  (state.stages || []).forEach((st) => (st.steps || []).forEach((s) => {
    const p = prog.steps[s.id];
    if (!p) return;
    if (p.status) s.status = p.status;
    if (p.checks) (s.checks || []).forEach((c) => { if (p.checks[c.t]) c.d = true; });
  }));
  return state;
}

app.get('/api/state', (req, res) => {
  try {
    res.json(merged());
  } catch (err) {
    res.status(500).json({ error: 'Nie moge zlozyc stanu: ' + err.message });
  }
});

app.put('/api/state', (req, res) => {
  const state = req.body;
  if (!state || !Array.isArray(state.stages)) {
    return res.status(400).json({ error: 'Brak pola stages.' });
  }
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(TEMPLATE_FILE, JSON.stringify(extractTemplate(state), null, 2) + '\n');
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(extractProgress(state), null, 2) + '\n');
    res.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Nie moge zapisac: ' + err.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

module.exports = app;
