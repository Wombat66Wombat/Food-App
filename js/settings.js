// Settings: appearance, calorie goal & deficit, food preferences, Apple Watch, data.

import { DIETS, ALLERGIES } from './recommend.js';
import { dateKey, normalizeState } from './store.js';
import { state, $, esc, persist, render, actions, changeHandlers, keyHandlers, toast, setTopbarExtra } from './core.js';
import { PALETTES, applyTheme, processWallpaper, isDark } from './theme.js';
import { eatingTarget } from './food.js';

const LIKE_SUGGESTIONS = ['chicken', 'salmon', 'eggs', 'pasta', 'rice', 'tofu', 'avocado', 'spicy', 'mexican', 'asian', 'italian', 'indian', 'sweet', 'quick', 'high-protein', 'low-carb'];
const DEFICITS = [[0, 'No deficit — maintain weight'], [10, '10% — gentle'], [15, '15% — steady'], [20, '20% — recommended max for most people'], [25, '25% — aggressive']];

const syncUrl = () => `${location.origin}${location.pathname}?burned=`;

function chipList(list, kind) {
  return `<div class="chips">${state.settings[list].map((v) => `<span class="chip ${kind === 'bad' ? 'bad' : ''}">${esc(v)}<button data-action="remove-chip" data-list="${list}" data-value="${esc(v)}" aria-label="Remove ${esc(v)}">✕</button></span>`).join('') || '<span class="small muted">Nothing yet</span>'}</div>`;
}

function renderSettings(el) {
  setTopbarExtra('');
  const st = state.settings;
  const th = st.theme;
  const c = st.calc || { sex: 'female', age: 30, height: 170, weight: 70, activity: 1.2 };
  const target = eatingTarget();
  const perWeek = ((st.goal - target) * 7) / 7700;
  const mode = isDark() ? 'dark' : 'light';

  el.innerHTML = `
    <div class="card" id="appearance">
      <h2>🎨 Appearance</h2>
      <div class="segmented">
        ${[['system', '📱 Match phone'], ['light', '☀️ Light'], ['dark', '🌙 Dark']].map(([k, l]) => `<button aria-selected="${th.mode === k}" data-action="theme-mode" data-mode="${k}">${l}</button>`).join('')}
      </div>
      <h3>Color theme</h3>
      <div class="palettes">
        ${Object.entries(PALETTES).map(([k, p]) => `<button class="palette" data-action="theme-palette" data-palette="${k}" aria-pressed="${th.palette === k}">
          <span class="dot" style="background:${p[mode]}"></span><span>${p.name}</span></button>`).join('')}
        ${th.wallAccent ? `<button class="palette" data-action="theme-palette" data-palette="wallpaper" aria-pressed="${th.palette === 'wallpaper'}">
          <span class="dot" style="background:${th.wallAccent[mode]}"></span><span>Wallpaper</span></button>` : ''}
      </div>
      <h3>Match your wallpaper</h3>
      <div class="small muted">Pick your phone wallpaper (or a screenshot of your home screen) and the app takes its colors from it.</div>
      <div class="row wrap" style="margin-top:8px">
        <button class="btn secondary" data-action="wallpaper-pick">🖼️ ${th.wallpaper ? 'Change wallpaper' : 'Choose wallpaper'}</button>
        ${th.wallpaper ? '<button class="btn danger small" data-action="wallpaper-remove">Remove</button>' : ''}
      </div>
      ${th.wallpaper ? `<label class="switch-row"><input type="checkbox" id="wall-bg" ${th.wallpaperBg ? 'checked' : ''}><span>Show wallpaper behind the app</span></label>` : ''}
      <input type="file" id="wallpaper-file" accept="image/*" hidden>
    </div>

    <div class="card" id="goal">
      <h2>🎯 Calories & deficit</h2>
      <label class="field"><span>Maintenance calories</span>
        <span class="small muted">What you burn on a normal day <b>without</b> workouts. Workouts come from your Apple Watch.</span>
        <div class="row"><input type="number" inputmode="numeric" id="goal-input" min="1000" max="6000" value="${st.goal}" aria-label="Maintenance calories"><span class="muted">kcal</span></div></label>
      <details style="margin-top:6px">
        <summary class="btn ghost small" style="padding-left:0">Don't know? Calculate it ›</summary>
        <div class="stack" style="margin-top:8px">
          <div class="row">
            <label class="field grow"><span>Sex</span><select id="calc-sex"><option value="female" ${c.sex === 'female' ? 'selected' : ''}>Female</option><option value="male" ${c.sex === 'male' ? 'selected' : ''}>Male</option></select></label>
            <label class="field grow"><span>Age</span><input type="number" id="calc-age" value="${c.age}"></label>
          </div>
          <div class="row">
            <label class="field grow"><span>Height (cm)</span><input type="number" id="calc-height" value="${c.height}"></label>
            <label class="field grow"><span>Weight (kg)</span><input type="number" id="calc-weight" value="${c.weight}"></label>
          </div>
          <label class="field"><span>Activity outside of workouts</span><select id="calc-activity">
            ${[[1.2, 'Mostly sitting (recommended with Apple Watch)'], [1.375, 'Lightly active job'], [1.55, 'On my feet most of the day']].map(([v, l]) => `<option value="${v}" ${Number(c.activity) === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select></label>
          <button class="btn secondary" data-action="calc-goal">Calculate & use</button>
        </div>
      </details>
      <label class="field" style="margin-top:10px"><span>Deficit</span>
        <select id="deficit-select">${DEFICITS.map(([v, l]) => `<option value="${v}" ${st.deficitPct === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="goal-summary">
        <div><b>${target}</b><span>kcal to eat per day</span></div>
        <div><b>${st.goal - target}</b><span>kcal deficit goal</span></div>
        <div><b>${perWeek.toFixed(2)}</b><span>kg / week</span></div>
      </div>
      <div class="small muted">Burned calories from your Apple Watch don't raise what you eat — they make your deficit bigger. At the end of each day you'll see if you met your goal.</div>
    </div>

    <div class="card" id="prefs">
      <h2>😋 What do you like?</h2>
      <div class="small muted">Foods, cuisines or styles. Ideas that match get recommended first.</div>
      <div class="row" style="margin:8px 0"><input type="text" id="like-input" placeholder="e.g. chicken, pasta, spicy" enterkeyhint="done"><button class="btn" data-action="add-chip" data-list="likes">Add</button></div>
      ${chipList('likes')}
      <div class="quick-ideas">${LIKE_SUGGESTIONS.filter((x) => !st.likes.includes(x)).map((x) => `<button class="pill" data-action="add-like" data-value="${x}">+ ${x}</button>`).join('')}</div>
      <h3>Don't like</h3>
      <div class="small muted">Ideas containing these are never suggested.</div>
      <div class="row" style="margin:8px 0"><input type="text" id="dislike-input" placeholder="e.g. mushrooms, tuna" enterkeyhint="done"><button class="btn secondary" data-action="add-chip" data-list="dislikes">Add</button></div>
      ${chipList('dislikes', 'bad')}
      <h3>Diet</h3>
      <select id="diet-select">${Object.entries(DIETS).map(([k, d]) => `<option value="${k}" ${st.diet === k ? 'selected' : ''}>${d.label}</option>`).join('')}</select>
      <h3>Allergies / avoid</h3>
      <div class="chips">${Object.entries(ALLERGIES).map(([k, l]) => `<button class="toggle-chip" data-action="toggle-allergy" data-value="${k}" aria-pressed="${st.allergies.includes(k)}">${l}</button>`).join('')}</div>
    </div>

    <div class="card" id="watch">
      <h2>⌚ Apple Watch sync</h2>
      <div class="small muted">A web app can't read Apple Health directly, but a free iPhone Shortcut can send today's Active Energy here in one tap (or automatically every evening).</div>
      <ol class="steps">
        <li>Open <b>Shortcuts</b> → <b>+</b>, name it “Sync calories”.</li>
        <li>Add <b>Find Health Samples</b>: Type is <i>Active Energy</i>, Start Date <i>is today</i>.</li>
        <li>Add <b>Calculate Statistics</b>: <i>Sum</i> of Health Samples.</li>
        <li>Add <b>Round Number</b>, then <b>Copy to Clipboard</b>.</li>
        <li>Add <b>Text</b> with this link and the <i>Rounded Number</i> at the end:<br>
          <code id="sync-url">${esc(syncUrl())}</code> <button class="btn ghost small" data-action="copy-url">Copy link</button></li>
        <li>Add <b>Open URLs</b>. Optional: Automation → <i>Time of Day</i> 9 pm → run it.</li>
      </ol>
      <div class="small muted" style="margin-top:6px">Using the Home Screen app? iPhone keeps its data separate from Safari — open the app after the shortcut and tap <b>📋</b> next to “Calories burned”.</div>
    </div>

    <div class="card" id="myfoods">
      <h2>🍱 My foods</h2>
      <div class="small muted">Add things the app doesn't know, then just type their name.</div>
      <div class="row" style="margin-top:8px">
        <input type="text" id="cf-name" placeholder="Name" class="grow">
        <input type="number" inputmode="numeric" id="cf-kcal" placeholder="kcal" style="max-width:90px">
        <input type="number" inputmode="numeric" id="cf-protein" placeholder="protein g" style="max-width:100px">
      </div>
      <button class="btn secondary block" style="margin-top:8px" data-action="add-custom-food">Save food (per serving)</button>
      ${st.customFoods.length ? `<ul class="breakdown" style="margin-top:10px">${st.customFoods.map((f, i) => `<li><span>${esc(f.name)}</span><span>${f.kcal} kcal${f.protein ? ` · ${f.protein}g P` : ''} <button class="icon-btn" data-action="remove-custom-food" data-index="${i}" aria-label="Delete">🗑</button></span></li>`).join('')}</ul>` : ''}
    </div>

    <div class="card">
      <h2 lang="zh">🀄 中文 Mandarin</h2>
      <label class="field"><span>New cards to write per day</span>
        <select id="md-daily">${[3, 4, 5, 6, 8, 10].map((n) => `<option value="${n}" ${st.mandarinDaily === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    </div>

    <div class="card">
      <h2>💾 Your data</h2>
      <div class="small muted">Everything is saved only on this device. Export a backup to move it to another phone.</div>
      <div class="row wrap" style="margin-top:8px">
        <button class="btn secondary" data-action="export">Export backup</button>
        <button class="btn secondary" data-action="import">Import backup</button>
        <button class="btn danger" data-action="reset">Reset everything</button>
      </div>
      <input type="file" id="import-file" accept="application/json,.json" hidden>
    </div>
    <div class="small muted" style="text-align:center">Calorie values are estimates. Not medical advice.</div>
  `;
}

export const views = {
  settings: { title: 'Settings', render: renderSettings },
};

function addChip(list, raw) {
  for (const v of raw.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)) {
    if (!state.settings[list].includes(v)) state.settings[list].push(v);
  }
  persist();
}

Object.assign(actions, {
  'theme-mode': ({ mode }) => { state.settings.theme.mode = mode; persist(); applyTheme(); render(); },
  'theme-palette': ({ palette }) => { state.settings.theme.palette = palette; persist(); applyTheme(); render(); },
  'wallpaper-pick': () => $('#wallpaper-file').click(),
  'wallpaper-remove': () => {
    Object.assign(state.settings.theme, { wallpaper: null, wallAccent: null, wallpaperBg: false });
    if (state.settings.theme.palette === 'wallpaper') state.settings.theme.palette = 'green';
    persist();
    applyTheme();
    render();
  },
  'add-chip': ({ list }) => {
    const sel = list === 'likes' ? '#like-input' : '#dislike-input';
    if (!$(sel).value.trim()) return;
    addChip(list, $(sel).value);
    render();
    $(sel).focus();
  },
  'add-like': ({ value }) => { addChip('likes', value); render(); },
  'remove-chip': ({ list, value }) => {
    state.settings[list] = state.settings[list].filter((v) => v !== value);
    persist();
    render();
  },
  'toggle-allergy': ({ value }) => {
    const a = state.settings.allergies;
    state.settings.allergies = a.includes(value) ? a.filter((x) => x !== value) : [...a, value];
    persist();
    render();
  },
  'calc-goal': () => {
    const calc = {
      sex: $('#calc-sex').value,
      age: Number($('#calc-age').value),
      height: Number($('#calc-height').value),
      weight: Number($('#calc-weight').value),
      activity: Number($('#calc-activity').value),
    };
    if (!calc.age || !calc.height || !calc.weight) { toast('Fill in age, height and weight'); return; }
    const bmr = 10 * calc.weight + 6.25 * calc.height - 5 * calc.age + (calc.sex === 'male' ? 5 : -161);
    state.settings.calc = calc;
    state.settings.goal = Math.round((bmr * calc.activity) / 10) * 10;
    persist();
    render();
    toast(`Maintenance set to ${state.settings.goal} kcal`);
  },
  'copy-url': async () => {
    try { await navigator.clipboard.writeText(syncUrl()); toast('Link copied'); } catch { toast('Could not copy'); }
  },
  'add-custom-food': () => {
    const name = $('#cf-name').value.trim();
    const kcal = Number($('#cf-kcal').value);
    const protein = Number($('#cf-protein').value) || 0;
    if (!name || !kcal) { toast('Add a name and calories'); return; }
    state.settings.customFoods = [...state.settings.customFoods.filter((f) => f.name.toLowerCase() !== name.toLowerCase()), { name, kcal, protein }];
    persist();
    render();
    toast(`Saved ${name}`);
  },
  'remove-custom-food': ({ index }) => {
    state.settings.customFoods = state.settings.customFoods.filter((_, i) => i !== Number(index));
    persist();
    render();
  },
  export: () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `my-space-backup-${dateKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  import: () => $('#import-file').click(),
  reset: () => {
    if (!confirm('Delete all your meals, plans, timetable, flashcards and settings on this device?')) return;
    Object.assign(state, normalizeState({}));
    persist();
    applyTheme();
    render();
    toast('Everything reset');
  },
});

keyHandlers.push((e) => {
  if (e.key !== 'Enter') return false;
  if (e.target.id === 'like-input') { actions['add-chip']({ list: 'likes' }); return true; }
  if (e.target.id === 'dislike-input') { actions['add-chip']({ list: 'dislikes' }); return true; }
  return false;
});

changeHandlers.push((e) => {
  const t = e.target;
  const st = state.settings;
  if (t.id === 'goal-input') {
    const v = Math.round(Number(t.value));
    if (v >= 800 && v <= 8000) { st.goal = v; persist(); render(); toast(`Maintenance set to ${v} kcal`); }
  } else if (t.id === 'deficit-select') {
    st.deficitPct = Number(t.value); persist(); render();
  } else if (t.id === 'diet-select') {
    st.diet = t.value; persist();
  } else if (t.id === 'md-daily') {
    st.mandarinDaily = Number(t.value); persist();
  } else if (t.id === 'wall-bg') {
    st.theme.wallpaperBg = t.checked; persist(); applyTheme();
  } else if (t.id === 'wallpaper-file' && t.files[0]) {
    processWallpaper(t.files[0]).then(({ dataUrl, accent }) => {
      Object.assign(st.theme, { wallpaper: dataUrl, wallAccent: accent, palette: 'wallpaper' });
      persist();
      applyTheme();
      render();
      toast('Colors matched to your wallpaper ✨');
    }).catch(() => toast("Couldn't read that image"));
  } else if (t.id === 'import-file' && t.files[0]) {
    t.files[0].text().then((txt) => {
      Object.assign(state, normalizeState(JSON.parse(txt)));
      persist();
      applyTheme();
      render();
      toast('Backup imported');
    }).catch(() => toast('That file is not a valid backup'));
  } else {
    return false;
  }
  return true;
});
