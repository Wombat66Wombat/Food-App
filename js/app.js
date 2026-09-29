// App shell: navigation, event delegation, Apple Watch URL sync.

import { dateKey } from './store.js';
import {
  state, ui, $, actions, inputHandlers, changeHandlers, keyHandlers,
  setRenderer, closeSheet, sheetClosed, sheetIsOpen, toast,
} from './core.js';
import { applyTheme } from './theme.js';
import { views as foodViews, setBurned, parseNumberLoose } from './food.js';
import { views as timetableViews } from './timetable.js';
import { views as mandarinViews } from './mandarin.js';
import { views as focusViews } from './focus.js';
import { views as settingsViews } from './settings.js';

const VIEWS = { ...foodViews, ...timetableViews, ...mandarinViews, ...focusViews, ...settingsViews };
const VIEW_KEY = 'my-space.view';

function render() {
  for (const name of Object.keys(VIEWS)) $(`#view-${name}`).hidden = name !== ui.view;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === ui.view));
  $('#settings-btn').classList.toggle('active', ui.view === 'settings');
  $('#view-title').textContent = VIEWS[ui.view].title;
  VIEWS[ui.view].render($(`#view-${ui.view}`));
}
setRenderer(render);

function go(view, anchor) {
  if (!VIEWS[view]) return;
  ui.view = view;
  try { sessionStorage.setItem(VIEW_KEY, view); } catch { /* ignore */ }
  render();
  if (anchor) $(`#${anchor}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else window.scrollTo(0, 0);
}

actions.goto = ({ view, anchor }) => go(view, anchor);

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => go(t.dataset.view)));
$('#settings-btn').addEventListener('click', () => go('settings'));

const sheet = $('#sheet');
$('#sheet-close').addEventListener('click', closeSheet);
sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
sheet.addEventListener('close', sheetClosed);

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  fn({ ...el.dataset });
});

document.addEventListener('keydown', (e) => {
  for (const h of keyHandlers) if (h(e)) return;
});
document.addEventListener('input', (e) => {
  for (const h of inputHandlers) if (h(e)) return;
});
document.addEventListener('change', (e) => {
  for (const h of changeHandlers) if (h(e)) return;
});

// Apple Watch sync via URL: ?burned=452&date=2026-09-28 (sent by an iPhone Shortcut)
function handleIncomingUrl() {
  const params = new URLSearchParams(location.search || location.hash.replace(/^#/, ''));
  if (!params.has('burned')) return;
  const v = parseNumberLoose(params.get('burned'));
  const key = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '') ? params.get('date') : dateKey();
  history.replaceState(null, '', location.pathname);
  if (v === null) return;
  setBurned(key, v, 'watch');
  ui.view = 'food';
  ui.date = key;
  setTimeout(() => toast(`⌚ Synced ${Math.round(v)} kcal from Apple Watch`), 300);
}

try {
  const saved = sessionStorage.getItem(VIEW_KEY);
  if (saved && VIEWS[saved]) ui.view = saved;
} catch { /* ignore */ }

applyTheme();
handleIncomingUrl();
render();

// Refresh when coming back to the app (new day, timetable "now", etc.).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || sheetIsOpen()) return;
  if (ui.view === 'food' && ui.openAdd) return;
  if (document.activeElement?.matches('input, textarea')) return;
  render();
});

// Keep the timetable's "now / next" fresh.
setInterval(() => {
  if (ui.view === 'timetable' && !sheetIsOpen() && document.visibilityState === 'visible') render();
}, 60_000);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Handy for debugging from the console.
window.mySpace = { state };
