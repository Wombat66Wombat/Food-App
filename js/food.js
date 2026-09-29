// Food: daily tracker with a calorie deficit goal, meal plan and meal ideas.

import { parseMeal, totals } from './parser.js';
import { FOODS } from './foods.js';
import { MEALS, MEAL_LABELS, MEAL_SHARE, getRecipe, recommend, slotTarget, planDays, dailyTips } from './recommend.js';
import { dateKey, fromKey, addDays, mondayOf } from './store.js';
import {
  state, ui, $, esc, uid, persist, render, actions, inputHandlers, changeHandlers, keyHandlers,
  toast, openSheet, closeSheet, setTopbarExtra,
} from './core.js';

Object.assign(ui, {
  date: dateKey(),
  weekStart: mondayOf(dateKey()),
  openAdd: null,
  drafts: {},
  mealsTab: 'plan',
  ideasSlot: null,
  ideasQuery: '',
});

const fmtDate = (key, opts) => fromKey(key).toLocaleDateString(undefined, opts);

// ---------- custom foods ----------

let customFoodList = [];
let customFoodSource = null;
function customFoods() {
  if (customFoodSource !== state.settings.customFoods) {
    customFoodSource = state.settings.customFoods;
    customFoodList = state.settings.customFoods.map((c) => ({
      name: c.name.toLowerCase(),
      kcal: c.kcal, // per serving; a serving is treated as 100 "g"
      protein: c.protein || 0,
      carbs: 0,
      fat: 0,
      unit: 100,
      unitName: 'serving',
      aliases: [],
      tags: [],
    }));
  }
  return customFoodList;
}
export const parse = (text) => parseMeal(text, customFoods());

// ---------- calories & deficit ----------

// Calories you want to eat: maintenance minus your deficit.
export function eatingTarget() {
  return Math.round(state.settings.goal * (1 - state.settings.deficitPct / 100));
}

function getDay(key) {
  if (!state.days[key]) state.days[key] = { entries: [], burned: 0 };
  return state.days[key];
}

function proteinGoal() {
  return Math.round((eatingTarget() * 0.3) / 4);
}

// Everything about one day's numbers.
export function summary(key) {
  const day = state.days[key] || { entries: [], burned: 0 };
  const t = totals(day.entries);
  const maintenance = state.settings.goal;
  const target = eatingTarget();
  const eaten = Math.round(t.kcal);
  const burned = Math.round(day.burned || 0);
  const deficit = maintenance + burned - eaten; // what you actually saved today
  const deficitGoal = maintenance - target;
  return {
    ...t,
    maintenance,
    target,
    eaten,
    burned,
    remaining: target - eaten, // what you can still eat — burned calories don't change this
    deficit,
    deficitGoal,
    met: day.entries.length > 0 && deficit >= deficitGoal,
    logged: day.entries.length > 0,
    loggedSlots: [...new Set(day.entries.map((e) => e.meal))],
  };
}

function suggestedSlot() {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  if (h < 10.5) return 'breakfast';
  if (h < 14.5) return 'lunch';
  if (h < 17) return 'snack';
  if (h < 21.5) return 'dinner';
  return 'snack';
}

function addEntry(key, meal, text, name) {
  const items = parse(text);
  if (!items.length) return null;
  const entry = { id: uid(), meal, text: text.trim(), name: name || null, items, ...totals(items), at: Date.now() };
  getDay(key).entries.push(entry);
  persist();
  return entry;
}

function logRecipe(key, recipe, meal = recipe.meal) {
  return addEntry(key, meal, recipe.ingredients, recipe.name);
}

export function setBurned(key, value, source) {
  const day = getDay(key);
  day.burned = Math.max(0, Math.round(value));
  day.burnedSource = source;
  day.burnedAt = Date.now();
  persist();
}

export function parseNumberLoose(text) {
  const m = String(text || '').replace(',', '.').match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

// ---------- shared bits ----------

function macroLine(t) {
  return `<div class="macro-line"><span class="p">P ${Math.round(t.protein)}g</span><span class="c">C ${Math.round(t.carbs)}g</span><span class="f">F ${Math.round(t.fat)}g</span></div>`;
}

function breakdownList(items) {
  return `<ul class="breakdown">${items.map((i) => i.matched
    ? `<li><span>${esc(i.label)} ${i.grams ? `<span class="g">${i.grams} g</span>` : ''}</span><span>${i.kcal} kcal</span></li>`
    : `<li class="unknown"><span>⚠︎ “${esc(i.input)}” not found</span><span>? kcal</span></li>`).join('')}</ul>`;
}

function previewHtml(text) {
  const items = parse(text);
  if (!items.length) return '';
  const t = totals(items);
  const unknown = items.filter((i) => !i.matched);
  return `${breakdownList(items)}
    <div class="sum"><span>Total</span><span>${Math.round(t.kcal)} kcal</span></div>
    ${unknown.length ? `<div class="hint">Don’t know “${esc(unknown[0].input)}”. Add the calories yourself, e.g. <b>${esc(unknown[0].input)} 250 kcal</b>, or save it under Settings → My foods.</div>` : ''}`;
}

function recipeCard(r, { reasons = [], actions: buttons = '' } = {}) {
  return `<div class="card recipe">
    <div class="recipe-top"><div class="recipe-name">${esc(r.name)}</div><div class="recipe-kcal">${Math.round(r.kcal)} kcal</div></div>
    <div class="ingr">${esc(r.ingredients)}</div>
    ${macroLine(r)}
    ${reasons.length ? `<div class="reasons">${reasons.map((x) => `<span class="reason">${esc(x)}</span>`).join('')}</div>` : ''}
    ${buttons ? `<div class="recipe-actions">${buttons}</div>` : ''}
  </div>`;
}

// ---------- Today ----------

function deficitCard(key, s) {
  const isToday = key === dateKey();
  const isPast = key < dateKey();
  const pct = s.deficitGoal > 0 ? Math.max(0, Math.min(s.deficit / s.deficitGoal, 1)) : 1;
  const fatKg = Math.max(s.deficit, 0) / 7700;

  let verdict;
  if (!s.logged) {
    verdict = `<div class="verdict none">No food logged ${isToday ? 'yet' : 'this day'}</div>`;
  } else if (s.met) {
    verdict = `<div class="verdict ok">✓ ${isPast ? 'Goal met' : 'On track'} — ${s.deficit} kcal deficit</div>`;
  } else if (s.deficit >= 0) {
    verdict = `<div class="verdict warn">${isPast ? '✗ Missed by' : 'Still'} ${s.deficitGoal - s.deficit} kcal ${isPast ? '' : 'short of your deficit'}</div>`;
  } else {
    verdict = `<div class="verdict bad">✗ ${-s.deficit} kcal over maintenance</div>`;
  }

  // Last 7 days strip
  const days = Array.from({ length: 7 }, (_, i) => addDays(dateKey(), i - 6));
  let weekDeficit = 0;
  const dots = days.map((k) => {
    const d = summary(k);
    if (d.logged) weekDeficit += d.deficit;
    const cls = !d.logged ? 'none' : d.met ? 'ok' : 'bad';
    const label = fmtDate(k, { weekday: 'narrow' });
    return `<button class="day-dot ${cls} ${k === key ? 'sel' : ''}" data-action="go-date" data-date="${k}" title="${esc(fmtDate(k, { weekday: 'long' }))}">
      <span>${!d.logged ? '·' : d.met ? '✓' : '✗'}</span><small>${label}</small></button>`;
  }).join('');

  return `<div class="card">
    <div class="row between"><h2 style="margin:0">${isPast ? 'Day result' : 'Deficit'}</h2>
      <span class="small muted">Goal: ${s.deficitGoal} kcal (${state.settings.deficitPct}%)</span></div>
    ${verdict}
    <div class="bar big"><i style="width:${pct * 100}%;background:${s.met ? 'var(--brand)' : 'var(--warn)'}"></i></div>
    <div class="equation" style="margin-top:10px">
      <span>Maintenance</span><span class="v">${s.maintenance}</span>
      <span>Burned ⌚ Apple Watch</span><span class="v burnv">+ ${s.burned}</span>
      <span>Eaten</span><span class="v">− ${s.eaten}</span>
      <span class="total">Deficit ${isToday ? 'so far' : ''}</span><span class="v total">${s.deficit}</span>
    </div>
    ${s.logged && fatKg >= 0.01 ? `<div class="small muted" style="margin-top:6px">≈ ${fatKg.toFixed(2)} kg of body fat (7,700 kcal ≈ 1 kg)</div>` : ''}
    ${isToday && s.logged ? '<div class="small muted">Final result once you add your food and Apple Watch calories for the whole day.</div>' : ''}
    <div class="week-dots">${dots}</div>
    <div class="small muted" style="text-align:center">Last 7 days: ${weekDeficit} kcal deficit ≈ ${(Math.max(weekDeficit, 0) / 7700).toFixed(2)} kg</div>
  </div>`;
}

function renderToday(el) {
  const key = ui.date;
  const s = summary(key);
  const day = state.days[key] || { entries: [], burned: 0 };
  const isToday = key === dateKey();

  const r = 56;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(s.eaten / Math.max(s.target, 1), 1);
  const over = s.remaining < 0;
  const pGoal = proteinGoal();
  const cGoal = Math.round((s.target * 0.4) / 4);
  const fGoal = Math.round((s.target * 0.3) / 9);
  const bar = (v, goal, color) => `<div class="bar"><i style="width:${Math.min((v / goal) * 100, 100)}%;background:${color}"></i></div>`;

  setTopbarExtra(`<div class="datenav">
    <button class="icon-btn" data-action="date-prev" aria-label="Previous day">‹</button>
    <button class="icon-btn label" data-action="date-today" style="width:auto">${isToday ? 'Today' : esc(fmtDate(key, { weekday: 'short', day: 'numeric', month: 'short' }))}</button>
    <button class="icon-btn" data-action="date-next" aria-label="Next day">›</button>
  </div>`);

  const burnSource = day.burned
    ? `<span class="chip-src">${day.burnedSource === 'watch' ? '⌚ Synced from Apple Watch' : '✍️ Entered manually'}${day.burnedAt ? ` · ${new Date(day.burnedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</span>`
    : '';

  const mealCards = MEALS.map((meal) => {
    const entries = day.entries.filter((e) => e.meal === meal);
    const kcal = Math.round(entries.reduce((sum, e) => sum + e.kcal, 0));
    const open = ui.openAdd === meal;
    const draft = ui.drafts[meal] || '';
    const target = slotTarget(meal, { goal: s.target, remaining: s.remaining, loggedSlots: s.loggedSlots });
    const ideas = open ? recommend({ slot: meal, target, prefs: state.settings, limit: 5 }) : [];
    return `<div class="card">
      <div class="meal-head">
        <h2>${MEAL_LABELS[meal]}</h2>
        <div class="row"><span class="meal-kcal">${kcal ? `${kcal} kcal` : ''}</span>
          <button class="btn small ${open ? 'secondary' : ''}" data-action="toggle-add" data-meal="${meal}">${open ? 'Close' : '+ Add'}</button></div>
      </div>
      ${entries.length ? `<ul class="entries">${entries.map((e) => `<li class="entry">
        <div class="entry-main">
          <div class="entry-text"><div class="t">${esc(e.name || e.text)}</div>
            <details><summary>${e.items.length} item${e.items.length === 1 ? '' : 's'} · P ${Math.round(e.protein)}g · C ${Math.round(e.carbs)}g · F ${Math.round(e.fat)}g ▾</summary>${breakdownList(e.items)}</details>
          </div>
          <span class="entry-kcal">${Math.round(e.kcal)}</span>
          <button class="icon-btn" data-action="edit-entry" data-id="${e.id}" aria-label="Edit">✎</button>
          <button class="icon-btn" data-action="delete-entry" data-id="${e.id}" aria-label="Delete">🗑</button>
        </div></li>`).join('')}</ul>` : ''}
      ${open ? `<div class="add-box">
        <textarea id="add-${meal}" data-draft="${meal}" rows="2" placeholder="What did you eat? e.g. 2 eggs, 1 slice toast with butter, coffee with milk">${esc(draft)}</textarea>
        <div class="preview" id="preview-${meal}">${previewHtml(draft)}</div>
        <div class="row" style="margin-top:8px"><button class="btn grow" data-action="add-entry" data-meal="${meal}">Add to ${MEAL_LABELS[meal].toLowerCase()}</button></div>
        ${ideas.length ? `<div class="small muted" style="margin-top:10px">Ideas for ~${target} kcal — tap to log:</div>
        <div class="quick-ideas">${ideas.map(({ recipe }) => `<button class="pill" data-action="quick-log" data-id="${recipe.id}" data-meal="${meal}">${esc(recipe.name)} <b>${Math.round(recipe.kcal)}</b></button>`).join('')}</div>` : ''}
      </div>` : ''}
    </div>`;
  }).join('');

  const tips = isToday ? dailyTips({
    goal: s.target, eaten: s.eaten, burned: s.burned, remaining: s.remaining,
    protein: s.protein, proteinGoal: pGoal, loggedSlots: s.loggedSlots, hour: new Date().getHours(),
  }) : [];

  el.innerHTML = `
    <div class="card">
      <div class="summary">
        <div class="ring ${over ? 'over' : ''}">
          <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
            <circle cx="66" cy="66" r="${r}" fill="none" stroke="var(--line)" stroke-width="12"/>
            <circle cx="66" cy="66" r="${r}" fill="none" stroke="${over ? 'var(--danger)' : 'var(--brand)'}" stroke-width="12" stroke-linecap="round"
              stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - pct)}"/>
          </svg>
          <div class="center"><div class="big">${Math.abs(s.remaining)}</div><div class="cap">${over ? 'kcal over' : 'kcal left'}</div></div>
        </div>
        <div class="equation">
          <span>Maintenance</span><span class="v">${s.maintenance}</span>
          <span>Deficit ${state.settings.deficitPct}%</span><span class="v">− ${s.deficitGoal}</span>
          <span class="total">Eating target</span><span class="v total">${s.target}</span>
          <span>Food</span><span class="v">− ${s.eaten}</span>
          <span class="total">Left to eat</span><span class="v total">${s.remaining}</span>
        </div>
      </div>
      <div class="macros">
        <div class="macro"><div class="name"><span>Protein</span><span>${Math.round(s.protein)}/${pGoal}g</span></div>${bar(s.protein, pGoal, 'var(--protein)')}</div>
        <div class="macro"><div class="name"><span>Carbs</span><span>${Math.round(s.carbs)}/${cGoal}g</span></div>${bar(s.carbs, cGoal, 'var(--carbs)')}</div>
        <div class="macro"><div class="name"><span>Fat</span><span>${Math.round(s.fat)}/${fGoal}g</span></div>${bar(s.fat, fGoal, 'var(--fat)')}</div>
      </div>
    </div>

    ${mealCards}

    <div class="card burn-card">
      <div class="row"><span class="flame" aria-hidden="true">🔥</span>
        <div class="grow"><b>Calories burned</b><div class="small muted">Active calories from your Apple Watch (Move ring). They add to your deficit — not to what you can eat.</div></div></div>
      <div class="row" style="margin-top:10px">
        <input type="number" inputmode="numeric" min="0" max="10000" id="burn-input" placeholder="e.g. 450" value="${day.burned || ''}" aria-label="Active calories burned">
        <span class="muted">kcal</span>
        <button class="btn burn" data-action="burn-save">Save</button>
        <button class="btn secondary" data-action="burn-paste" title="Paste a number copied by the Apple Watch shortcut">📋</button>
      </div>
      <div class="row between wrap" style="margin-top:8px">${burnSource}<button class="btn ghost small" data-action="goto" data-view="settings" data-anchor="watch">Sync automatically ›</button></div>
    </div>

    ${deficitCard(key, s)}

    ${tips.length ? `<div class="card"><h2>Tips</h2><ul class="tips">${tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
  `;

  if (ui.openAdd && ui.focusAdd) {
    const ta = $(`#add-${ui.openAdd}`);
    if (ta) {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
    ui.focusAdd = false;
  }
}

// ---------- Meals: plan ----------

function plannedMeal(value) {
  if (!value) return null;
  if (value.recipeId) {
    const r = getRecipe(value.recipeId);
    return r ? { name: r.name, kcal: Math.round(r.kcal), text: r.ingredients } : null;
  }
  const t = totals(parse(value.text));
  return { name: value.text, kcal: Math.round(t.kcal), text: value.text };
}

function weekKeys() {
  return Array.from({ length: 7 }, (_, i) => addDays(ui.weekStart, i));
}

function renderPlan() {
  const keys = weekKeys();
  const today = dateKey();
  const goal = eatingTarget();
  const range = `${fmtDate(keys[0], { day: 'numeric', month: 'short' })} – ${fmtDate(keys[6], { day: 'numeric', month: 'short' })}`;

  const days = keys.map((key) => {
    const plan = state.plan[key] || {};
    const meals = MEALS.map((slot) => ({ slot, meal: plannedMeal(plan[slot]), logged: plan[slot]?.logged }));
    const total = meals.reduce((sum, m) => sum + (m.meal?.kcal || 0), 0);
    const hasAny = meals.some((m) => m.meal);
    return `<div class="card day-card ${key === today ? 'today' : ''}">
      <div class="day-head"><h2>${esc(fmtDate(key, { weekday: 'long', day: 'numeric', month: 'short' }))}${key === today ? ' · Today' : ''}</h2>
        <span class="day-total ${total > goal * 1.1 ? 'over' : ''}">${total ? `${total} / ${goal}` : ''}</span></div>
      ${meals.map(({ slot, meal, logged }) => `<div class="slot" data-action="pick-slot" data-date="${key}" data-slot="${slot}" role="button" tabindex="0">
        <span class="slot-name">${MEAL_LABELS[slot]}</span>
        <span class="slot-meal ${meal ? '' : 'empty'}">${meal ? `${logged ? '✓ ' : ''}${esc(meal.name)}` : '+ add'}</span>
        <span class="slot-kcal">${meal ? meal.kcal : ''}</span>
      </div>`).join('')}
      ${hasAny ? `<div class="day-actions"><button class="btn secondary small" data-action="log-day" data-date="${key}">✓ Log to tracker</button></div>` : ''}
    </div>`;
  }).join('');

  return `
    <div class="card">
      <div class="weeknav">
        <button class="icon-btn" data-action="week-prev" aria-label="Previous week">‹</button>
        <button class="btn ghost" data-action="week-today"><b>${esc(range)}</b></button>
        <button class="icon-btn" data-action="week-next" aria-label="Next week">›</button>
      </div>
      <div class="row wrap" style="margin-top:8px">
        <button class="btn grow" data-action="autofill">✨ Fill empty slots</button>
        <button class="btn secondary grow" data-action="shopping">🛒 Shopping list</button>
      </div>
      <div class="row" style="margin-top:6px"><span class="small muted grow">Suggestions use your likes, diet and ${goal} kcal eating target.</span>
        <button class="btn ghost small" data-action="clear-week">Clear week</button></div>
    </div>
    ${days}`;
}

function openSlotPicker(key, slot, query = '') {
  const current = state.plan[key]?.[slot];
  const target = Math.round(eatingTarget() * MEAL_SHARE[slot]);
  const recs = recommend({ slot: query ? null : slot, target, prefs: state.settings, query, limit: 25 });
  openSheet(`${fmtDate(key, { weekday: 'long' })} · ${MEAL_LABELS[slot]}`, `
    <div class="stack">
      <label class="field"><span>Write your own</span>
        <textarea id="slot-text" rows="2" placeholder="e.g. 2 slices pizza, side salad">${current && !current.recipeId ? esc(current.text) : ''}</textarea></label>
      <div class="preview" id="slot-preview">${current && !current.recipeId ? previewHtml(current.text) : ''}</div>
      <button class="btn secondary" data-action="choose-text" data-date="${key}" data-slot="${slot}">Use this</button>
    </div>
    <input type="search" id="slot-search" placeholder="Search ideas (e.g. chicken, pasta, spicy)" value="${esc(query)}" data-date="${key}" data-slot="${slot}">
    <div class="small muted">${query ? 'Matching ideas' : `Recommended for ~${target} kcal`}</div>
    ${recs.length ? recs.map(({ recipe, reasons }) => `<button class="pick" data-action="choose-recipe" data-date="${key}" data-slot="${slot}" data-id="${recipe.id}">
      <div class="row"><b>${esc(recipe.name)}</b><span class="recipe-kcal">${Math.round(recipe.kcal)} kcal</span></div>
      ${reasons.length ? `<div class="small muted">${esc(reasons.join(' · '))}</div>` : ''}
    </button>`).join('') : '<div class="empty-state">No ideas match your preferences.</div>'}
    ${current ? `<button class="btn danger" data-action="clear-slot" data-date="${key}" data-slot="${slot}">Remove from plan</button>` : ''}
  `);
}

function shoppingList() {
  const byName = new Map();
  for (const key of weekKeys()) {
    const plan = state.plan[key] || {};
    for (const slot of MEALS) {
      const meal = plannedMeal(plan[slot]);
      if (!meal) continue;
      for (const item of parse(meal.text)) {
        if (!item.matched || item.custom) continue;
        const cur = byName.get(item.name) || { name: item.name, grams: 0 };
        cur.grams += item.grams || 0;
        byName.set(item.name, cur);
      }
    }
  }
  const foodsByName = new Map(FOODS.map((f) => [f.name, f]));
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)).map((it) => {
    const food = foodsByName.get(it.name);
    const countable = food && (food.unitName === food.name || ['egg', 'tortilla', 'pita', 'pancake', 'rice cake', 'cracker', 'clove'].includes(food.unitName));
    const amount = countable
      ? `${Math.ceil((it.grams / food.unit) * 2) / 2} × (${Math.round(it.grams)} g)`
      : it.grams >= 1000 ? `${(it.grams / 1000).toFixed(1)} kg` : `${Math.round(it.grams)} g`;
    return { name: it.name, amount };
  });
}

function openShopping() {
  const list = shoppingList();
  const checked = state.shopping[ui.weekStart] || [];
  openSheet('🛒 Shopping list', list.length ? `
    <div class="small muted">Everything in your plan for this week, added up.</div>
    <ul class="shopping">${list.map((it) => `<li class="${checked.includes(it.name) ? 'done' : ''}">
      <input type="checkbox" data-shop="${esc(it.name)}" ${checked.includes(it.name) ? 'checked' : ''} aria-label="${esc(it.name)}">
      <span class="grow">${esc(it.name)}</span><span class="muted small">${esc(it.amount)}</span></li>`).join('')}</ul>
    <button class="btn secondary" data-action="copy-shopping">Copy list</button>`
    : '<div class="empty-state">Your plan for this week is empty. Add some meals first.</div>');
}

// ---------- Meals: ideas ----------

function renderIdeas() {
  const s = summary(dateKey());
  const slot = ui.ideasSlot || suggestedSlot();
  const target = slotTarget(slot, { goal: s.target, remaining: s.remaining, loggedSlots: s.loggedSlots });
  const recs = recommend({ slot: ui.ideasQuery ? null : slot, target, prefs: state.settings, query: ui.ideasQuery, limit: 12 });
  const st = state.settings;
  const hasPrefs = st.likes.length || st.dislikes.length || st.diet !== 'none';

  return `
    <div class="card">
      <h2>${s.remaining > 0 ? `You can eat <span style="color:var(--brand)">${s.remaining} kcal</span> more today` : `You've reached today's eating target`}</h2>
      <div class="small muted">Suggestions for ${MEAL_LABELS[slot].toLowerCase()} aim for about ${target} kcal.</div>
      <div class="quick-ideas" style="margin-top:6px">${MEALS.map((m) => `<button class="pill ${m === slot && !ui.ideasQuery ? 'active' : ''}" data-action="ideas-slot" data-meal="${m}">${MEAL_LABELS[m]}</button>`).join('')}</div>
      <input type="search" id="ideas-search" placeholder="Craving something? (chicken, pasta, sweet…)" value="${esc(ui.ideasQuery)}" style="margin-top:8px">
      ${hasPrefs ? '' : `<div class="hint" style="margin-top:10px">Tell me what you like for better ideas → <a href="#" data-action="goto" data-view="settings" data-anchor="prefs">Preferences</a></div>`}
    </div>
    ${recs.length ? recs.map(({ recipe, reasons }) => recipeCard(recipe, {
      reasons,
      actions: `<button class="btn small" data-action="quick-log" data-id="${recipe.id}" data-meal="${ui.ideasQuery ? recipe.meal : slot}">Log to today</button>
        <button class="btn secondary small" data-action="plan-recipe" data-id="${recipe.id}">Add to plan</button>
        <span class="spacer"></span>
        <button class="icon-btn" data-action="fav" data-id="${recipe.id}" aria-label="Favourite" title="I like this">${st.favorites.includes(recipe.id) ? '❤️' : '🤍'}</button>
        <button class="icon-btn" data-action="hide" data-id="${recipe.id}" aria-label="Not for me" title="Not for me">👎</button>`,
    })).join('') : `<div class="card empty-state">No ideas match. Try another search or relax your preferences.</div>`}
    ${st.hidden.length ? `<button class="btn ghost" data-action="unhide-all">Show ${st.hidden.length} hidden idea${st.hidden.length === 1 ? '' : 's'} again</button>` : ''}
  `;
}

function openPlanRecipe(recipeId) {
  const recipe = getRecipe(recipeId);
  const keys = Array.from({ length: 7 }, (_, i) => addDays(dateKey(), i));
  openSheet(`Plan “${recipe.name}”`, `
    <label class="field"><span>Meal</span><select id="plan-slot">${MEALS.map((m) => `<option value="${m}" ${m === recipe.meal ? 'selected' : ''}>${MEAL_LABELS[m]}</option>`).join('')}</select></label>
    <div class="small muted">Pick a day:</div>
    ${keys.map((k, i) => {
      const taken = state.plan[k]?.[recipe.meal];
      return `<button class="pick" data-action="plan-to" data-id="${recipe.id}" data-date="${k}">
        <div class="row"><b>${i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : esc(fmtDate(k, { weekday: 'long', day: 'numeric', month: 'short' }))}</b>
        <span class="small muted">${taken ? `replaces ${esc(plannedMeal(taken)?.name || '')}` : ''}</span></div></button>`;
    }).join('')}
  `);
}

function renderMeals(el) {
  setTopbarExtra('');
  el.innerHTML = `
    <div class="segmented" role="tablist">
      <button role="tab" aria-selected="${ui.mealsTab === 'plan'}" data-action="meals-tab" data-tab="plan">📅 Week plan</button>
      <button role="tab" aria-selected="${ui.mealsTab === 'ideas'}" data-action="meals-tab" data-tab="ideas">💡 Ideas</button>
    </div>
    ${ui.mealsTab === 'plan' ? renderPlan() : renderIdeas()}`;
}

export const views = {
  food: { title: 'Food', render: renderToday },
  meals: { title: 'Meals', render: renderMeals },
};

// ---------- actions ----------

Object.assign(actions, {
  'date-prev': () => { ui.date = addDays(ui.date, -1); ui.openAdd = null; render(); },
  'date-next': () => { ui.date = addDays(ui.date, 1); ui.openAdd = null; render(); },
  'date-today': () => { ui.date = dateKey(); render(); },
  'go-date': ({ date }) => { ui.date = date; ui.openAdd = null; render(); },
  'toggle-add': ({ meal }) => { ui.openAdd = ui.openAdd === meal ? null : meal; ui.focusAdd = true; render(); },
  'add-entry': ({ meal }) => {
    const entry = addEntry(ui.date, meal, ui.drafts[meal] || '');
    if (!entry) { toast('Type what you ate first'); return; }
    ui.drafts[meal] = '';
    ui.openAdd = null;
    render();
    toast(`Added ${Math.round(entry.kcal)} kcal to ${MEAL_LABELS[meal].toLowerCase()}`);
  },
  'delete-entry': ({ id }) => {
    const day = getDay(ui.date);
    day.entries = day.entries.filter((e) => e.id !== id);
    persist();
    render();
  },
  'edit-entry': ({ id }) => {
    const day = getDay(ui.date);
    const entry = day.entries.find((e) => e.id === id);
    if (!entry) return;
    day.entries = day.entries.filter((e) => e.id !== id);
    persist();
    ui.drafts[entry.meal] = entry.text;
    ui.openAdd = entry.meal;
    ui.focusAdd = true;
    render();
  },
  'quick-log': ({ id, meal }) => {
    const recipe = getRecipe(id);
    const key = ui.view === 'food' ? ui.date : dateKey();
    logRecipe(key, recipe, meal);
    ui.openAdd = null;
    render();
    toast(`Logged ${recipe.name} (${Math.round(recipe.kcal)} kcal)`);
  },
  'burn-save': () => {
    const v = parseNumberLoose($('#burn-input').value);
    setBurned(ui.date, v || 0, 'manual');
    render();
    toast(v ? `Saved ${Math.round(v)} kcal burned` : 'Cleared burned calories');
  },
  'burn-paste': async () => {
    try {
      const v = parseNumberLoose(await navigator.clipboard.readText());
      if (v === null) { toast('No number on the clipboard'); return; }
      setBurned(ui.date, v, 'watch');
      render();
      toast(`⌚ Synced ${Math.round(v)} kcal from Apple Watch`);
    } catch {
      toast('Paste not allowed — type the number instead');
    }
  },

  'meals-tab': ({ tab }) => { ui.mealsTab = tab; render(); },
  'week-prev': () => { ui.weekStart = addDays(ui.weekStart, -7); render(); },
  'week-next': () => { ui.weekStart = addDays(ui.weekStart, 7); render(); },
  'week-today': () => { ui.weekStart = mondayOf(dateKey()); render(); },
  autofill: () => {
    const keys = weekKeys();
    const generated = planDays(keys, state.settings, eatingTarget());
    let filled = 0;
    for (const key of keys) {
      state.plan[key] = state.plan[key] || {};
      for (const slot of MEALS) {
        if (!state.plan[key][slot] && generated[key][slot]) { state.plan[key][slot] = generated[key][slot]; filled++; }
      }
    }
    persist();
    render();
    toast(filled ? `Planned ${filled} meals ✨` : 'Every slot is already planned');
  },
  'clear-week': () => {
    if (!confirm('Remove all planned meals for this week?')) return;
    for (const key of weekKeys()) delete state.plan[key];
    persist();
    render();
  },
  shopping: () => openShopping(),
  'copy-shopping': async () => {
    const text = shoppingList().map((it) => `• ${it.name} — ${it.amount}`).join('\n');
    try { await navigator.clipboard.writeText(text); toast('Shopping list copied'); } catch { toast('Could not copy'); }
  },
  'pick-slot': ({ date, slot }) => openSlotPicker(date, slot),
  'choose-recipe': ({ date, slot, id }) => {
    state.plan[date] = { ...(state.plan[date] || {}), [slot]: { recipeId: id } };
    persist();
    closeSheet();
    render();
  },
  'choose-text': ({ date, slot }) => {
    const text = $('#slot-text').value.trim();
    if (!text) return;
    state.plan[date] = { ...(state.plan[date] || {}), [slot]: { text } };
    persist();
    closeSheet();
    render();
  },
  'clear-slot': ({ date, slot }) => {
    if (state.plan[date]) delete state.plan[date][slot];
    persist();
    closeSheet();
    render();
  },
  'log-day': ({ date }) => {
    const plan = state.plan[date] || {};
    let count = 0;
    for (const slot of MEALS) {
      const value = plan[slot];
      if (!value || value.logged) continue;
      const meal = plannedMeal(value);
      if (meal && addEntry(date, slot, meal.text, value.recipeId ? meal.name : null)) {
        value.logged = true;
        count++;
      }
    }
    persist();
    render();
    toast(count ? `Logged ${count} meal${count === 1 ? '' : 's'} for ${fmtDate(date, { weekday: 'long' })}` : 'Already logged');
  },

  'ideas-slot': ({ meal }) => { ui.ideasSlot = meal; ui.ideasQuery = ''; render(); },
  fav: ({ id }) => {
    const favs = state.settings.favorites;
    state.settings.favorites = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id];
    persist();
    render();
  },
  hide: ({ id }) => {
    state.settings.hidden = [...state.settings.hidden, id];
    persist();
    render();
    toast("Got it — won't suggest that again");
  },
  'unhide-all': () => { state.settings.hidden = []; persist(); render(); },
  'plan-recipe': ({ id }) => openPlanRecipe(id),
  'plan-to': ({ id, date }) => {
    const slot = $('#plan-slot').value;
    state.plan[date] = { ...(state.plan[date] || {}), [slot]: { recipeId: id } };
    persist();
    closeSheet();
    toast(`Added to ${fmtDate(date, { weekday: 'long' })}'s ${MEAL_LABELS[slot].toLowerCase()}`);
  },
});

keyHandlers.push((e) => {
  if (e.key !== 'Enter') return false;
  const t = e.target;
  if (t.matches('.slot')) { actions['pick-slot']({ ...t.dataset }); return true; }
  if (t.id === 'burn-input') { actions['burn-save'](); return true; }
  if (!e.shiftKey && t.dataset.draft) {
    e.preventDefault();
    actions['add-entry']({ meal: t.dataset.draft });
    return true;
  }
  return false;
});

let searchTimer;
inputHandlers.push((e) => {
  const t = e.target;
  if (t.dataset.draft) {
    ui.drafts[t.dataset.draft] = t.value;
    $(`#preview-${t.dataset.draft}`).innerHTML = previewHtml(t.value);
  } else if (t.id === 'slot-text') {
    $('#slot-preview').innerHTML = previewHtml(t.value);
  } else if (t.id === 'ideas-search') {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      ui.ideasQuery = t.value.trim();
      render();
      const input = $('#ideas-search');
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }, 250);
  } else if (t.id === 'slot-search') {
    clearTimeout(searchTimer);
    const { date, slot } = t.dataset;
    searchTimer = setTimeout(() => {
      openSlotPicker(date, slot, t.value.trim());
      const input = $('#slot-search');
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }, 250);
  } else {
    return false;
  }
  return true;
});

changeHandlers.push((e) => {
  const t = e.target;
  if (!t.dataset.shop) return false;
  const list = state.shopping[ui.weekStart] || [];
  state.shopping[ui.weekStart] = t.checked ? [...list, t.dataset.shop] : list.filter((x) => x !== t.dataset.shop);
  t.closest('li').classList.toggle('done', t.checked);
  persist();
  return true;
});
