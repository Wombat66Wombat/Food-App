// Fokus: "Nicht lernen. Nur anfangen." – timer, tiny steps, a short start checklist.

import { dateKey } from './store.js';
import { state, ui, $, esc, uid, persist, render, actions, keyHandlers, toast, setTopbarExtra } from './core.js';

const PRESETS = {
  short: { label: 'Nur 5 Min', min: 5, kind: 'focus' },
  focus: { label: 'Fokus 25', min: 25, kind: 'focus' },
  pause: { label: 'Pause 5', min: 5, kind: 'pause' },
};

const CHECKLIST = [
  'Handy in einen anderen Raum gelegt',
  'Alle Tabs und Apps zu, die nichts mit der Aufgabe zu tun haben',
  'Material liegt bereit',
  'Ich weiß genau, was mein erster Mini-Schritt ist',
];

function timer() {
  if (!state.focus.timer) state.focus.timer = { preset: 'short', remaining: PRESETS.short.min * 60, endAt: null };
  return state.focus.timer;
}

const remainingSec = (t = timer()) => (t.endAt ? Math.max(0, Math.ceil((t.endAt - Date.now()) / 1000)) : t.remaining);
const fmt = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

function todayStats() {
  const k = dateKey();
  state.focus.stats[k] = state.focus.stats[k] || { units: 0, minutes: 0, steps: 0 };
  return state.focus.stats[k];
}

let audioCtx = null;
function beep() {
  try {
    if (!audioCtx) return;
    [0, 0.35, 0.7].forEach((delay) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + delay + 0.3);
      o.connect(g).connect(audioCtx.destination);
      o.start(audioCtx.currentTime + delay);
      o.stop(audioCtx.currentTime + delay + 0.32);
    });
  } catch { /* no sound available */ }
}

function complete() {
  const t = timer();
  const preset = PRESETS[t.preset];
  t.endAt = null;
  t.remaining = preset.min * 60;
  const msg = preset.kind === 'focus'
    ? `Geschafft! ${preset.min} Minuten. Weitermachen oder Pause – beides ist okay.`
    : 'Pause vorbei. Nächster Mini-Schritt?';
  if (preset.kind === 'focus') {
    const s = todayStats();
    s.units++;
    s.minutes += preset.min;
  }
  persist();
  beep();
  navigator.vibrate?.([200, 100, 200]);
  if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
    try { new Notification('Fokus-Timer', { body: msg, icon: 'icons/icon-192.png' }); } catch { /* ignore */ }
  }
  toast(msg);
  if (ui.view === 'focus') render();
}

function updateDisplay() {
  const t = timer();
  const sec = remainingSec(t);
  const el = $('#timer-display');
  if (el) el.textContent = fmt(sec);
  const ring = $('#timer-ring');
  if (ring) {
    const total = PRESETS[t.preset].min * 60;
    ring.style.strokeDashoffset = String(ring.dataset.circ * (sec / total));
  }
  if (t.endAt) document.title = `${fmt(sec)} · Fokus`;
}

// Runs all the time so the timer finishes even while you're in another section.
setInterval(() => {
  const t = state.focus.timer;
  if (!t?.endAt) return;
  if (Date.now() >= t.endAt) { complete(); document.title = 'My Space'; return; }
  if (ui.view === 'focus') updateDisplay();
}, 500);

function renderFocus(el) {
  setTopbarExtra('');
  const t = timer();
  const preset = PRESETS[t.preset];
  const running = Boolean(t.endAt);
  const sec = remainingSec(t);
  const total = preset.min * 60;
  const paused = !running && sec < total;
  const r = 88;
  const circ = 2 * Math.PI * r;
  const steps = state.focus.steps;
  const stats = state.focus.stats[dateKey()] || { units: 0, minutes: 0, steps: 0 };

  el.innerHTML = `
    <div class="card hero">
      <div class="hero-title">Nicht lernen.<br>Nur anfangen.</div>
      <div class="small muted">Mach den ersten Schritt so klein, dass er fast lächerlich ist – und stell den Timer auf 5 Minuten.</div>
    </div>

    <div class="card timer-card">
      <div class="quick-ideas" style="justify-content:center">${Object.entries(PRESETS).map(([k, p]) => `<button class="pill ${k === t.preset ? 'active' : ''}" data-action="focus-preset" data-preset="${k}" ${running ? 'disabled' : ''}>${p.label}</button>`).join('')}</div>
      <div class="timer-ring">
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="100" cy="100" r="${r}" fill="none" stroke="var(--line)" stroke-width="10"/>
          <circle id="timer-ring" data-circ="${circ}" cx="100" cy="100" r="${r}" fill="none" stroke="${preset.kind === 'pause' ? 'var(--protein)' : 'var(--brand)'}" stroke-width="10" stroke-linecap="round"
            stroke-dasharray="${circ}" stroke-dashoffset="${circ * (sec / total)}" transform="rotate(-90 100 100)"/>
        </svg>
        <div class="timer-display" id="timer-display">${fmt(sec)}</div>
      </div>
      <div class="small muted" style="text-align:center">Starte mit 5 Minuten. Wenn du danach aufhören willst, darfst du. Meistens machst du weiter.</div>
      <div class="row" style="margin-top:12px">
        <button class="btn grow" data-action="focus-start">${running ? 'Pause' : paused ? 'Weiter' : 'Timer starten'}</button>
        <button class="btn secondary" data-action="focus-reset">Zurücksetzen</button>
      </div>
    </div>

    <div class="card">
      <h2>Aufgabe zerlegen</h2>
      <div class="small muted">Nicht „Für Mathe lernen“, sondern „Aufgabe 3 auf S. 42 lesen“. Jeder Schritt unter 15 Minuten.</div>
      <div class="row" style="margin-top:8px"><input type="text" id="step-input" placeholder="Allerkleinster erster Schritt…" enterkeyhint="done"><button class="btn" data-action="step-add">Hinzufügen</button></div>
      ${steps.length ? `<ul class="checklist">${steps.map((s, i) => `<li class="${s.done ? 'done' : ''}">
          <label><input type="checkbox" data-action="step-toggle" data-id="${s.id}" ${s.done ? 'checked' : ''}><span>${i + 1}. ${esc(s.text)}</span></label>
          <button class="icon-btn" data-action="step-delete" data-id="${s.id}" aria-label="Löschen">✕</button></li>`).join('')}</ul>
        ${steps.some((s) => s.done) ? '<button class="btn ghost small" data-action="step-clear-done">Erledigte entfernen</button>' : ''}`
        : '<div class="empty-state">Noch leer. Was ist der allerkleinste erste Schritt?</div>'}
    </div>

    <div class="card">
      <h2>Startklar in 2 Minuten</h2>
      <ul class="checklist">${CHECKLIST.map((text, i) => `<li class="${state.focus.checklist[i] ? 'done' : ''}">
        <label><input type="checkbox" data-action="check-toggle" data-index="${i}" ${state.focus.checklist[i] ? 'checked' : ''}><span>${esc(text)}</span></label></li>`).join('')}</ul>
      <button class="btn ghost small" data-action="check-clear">Für nächste Session leeren</button>
    </div>

    <div class="card">
      <h2>Heute geschafft</h2>
      <div class="stats">
        <div><b>${stats.units}</b><span>Fokus-Einheiten</span></div>
        <div><b>${stats.minutes}</b><span>Minuten</span></div>
        <div><b>${stats.steps}</b><span>Schritte erledigt</span></div>
      </div>
    </div>
  `;
}

export const views = {
  focus: { title: 'Fokus', render: renderFocus },
};

Object.assign(actions, {
  'focus-preset': ({ preset }) => {
    const t = timer();
    if (t.endAt) return;
    t.preset = preset;
    t.remaining = PRESETS[preset].min * 60;
    persist();
    render();
  },
  'focus-start': () => {
    const t = timer();
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      audioCtx.resume();
    } catch { /* ignore */ }
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    if (t.endAt) {
      t.remaining = remainingSec(t);
      t.endAt = null;
      document.title = 'My Space';
    } else {
      t.endAt = Date.now() + remainingSec(t) * 1000;
    }
    persist();
    render();
  },
  'focus-reset': () => {
    const t = timer();
    const preset = PRESETS[t.preset];
    const elapsedMin = Math.floor((preset.min * 60 - remainingSec(t)) / 60);
    if (preset.kind === 'focus' && elapsedMin > 0) todayStats().minutes += elapsedMin;
    t.endAt = null;
    t.remaining = preset.min * 60;
    document.title = 'My Space';
    persist();
    render();
  },
  'step-add': () => {
    const input = $('#step-input');
    const text = input.value.trim();
    if (!text) return;
    state.focus.steps.push({ id: uid(), text, done: false });
    persist();
    render();
    $('#step-input').focus();
  },
  'step-toggle': ({ id }) => {
    const step = state.focus.steps.find((s) => s.id === id);
    step.done = !step.done;
    const stats = todayStats();
    stats.steps = Math.max(0, stats.steps + (step.done ? 1 : -1));
    persist();
    render();
  },
  'step-delete': ({ id }) => {
    state.focus.steps = state.focus.steps.filter((s) => s.id !== id);
    persist();
    render();
  },
  'step-clear-done': () => {
    state.focus.steps = state.focus.steps.filter((s) => !s.done);
    persist();
    render();
  },
  'check-toggle': ({ index }) => {
    state.focus.checklist[index] = !state.focus.checklist[index];
    persist();
    render();
  },
  'check-clear': () => {
    state.focus.checklist = {};
    persist();
    render();
  },
});

keyHandlers.push((e) => {
  if (e.key === 'Enter' && e.target.id === 'step-input') { actions['step-add'](); return true; }
  return false;
});
