import { parseMeal, totals } from './parser.js';
import { FOODS } from './foods.js';
import {
  MEALS, MEAL_LABELS, MEAL_SHARE, DIETS, ALLERGIES,
  getRecipe, recommend, slotTarget, planDays, dailyTips,
} from './recommend.js';
import { loadState, saveState, normalizeState, dateKey, fromKey, addDays, mondayOf } from './store.js';

const state = loadState();
const ui = {
  view: 'today',
  date: dateKey(),
  weekStart: mondayOf(dateKey()),
  openAdd: null,
  drafts: {},
  ideasSlot: null,
  ideasQuery: '',
};

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const uid = () => Math.random().toString(36).slice(2, 10);
const fmtDate = (key, opts) => fromKey(key).toLocaleDateString(undefined, opts);
const persist = () => saveState(state);

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
const parse = (text) => parseMeal(text, customFoods());

// ---------- day helpers ----------

function getDay(key) {
  if (!state.days[key]) state.days[key] = { entries: [], burned: 0 };
  return state.days[key];
}

function proteinGoal() {
  return Math.round((state.settings.goal * 0.25) / 4);
}

function summary(key) {
  const day = state.days[key] || { entries: [], burned: 0 };
  const t = totals(day.entries);
  const burned = Math.round(day.burned || 0);
  const credit = Math.round((burned * state.settings.eatBack) / 100);
  const budget = state.settings.goal + credit;
  return {
    ...t,
    eaten: Math.round(t.kcal),
    burned,
    credit,
    budget,
    remaining: Math.round(budget - t.kcal),
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

// ---------- rendering: shared bits ----------

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
    ${unknown.length ? `<div class="hint">Don’t know “${esc(unknown[0].input)}”. Add the calories yourself, e.g. <b>${esc(unknown[0].input)} 250 kcal</b>, or save it under Me → My foods.</div>` : ''}`;
}

function recipeCard(r, { reasons = [], actions = '' } = {}) {
  return `<div class="card recipe">
    <div class="recipe-top"><div class="recipe-name">${esc(r.name)}</div><div class="recipe-kcal">${Math.round(r.kcal)} kcal</div></div>
    <div class="ingr">${esc(r.ingredients)}</div>
    ${macroLine(r)}
    ${reasons.length ? `<div class="reasons">${reasons.map((x) => `<span class="reason">${esc(x)}</span>`).join('')}</div>` : ''}
    ${actions ? `<div class="recipe-actions">${actions}</div>` : ''}
  </div>`;
}

// ---------- Today ----------

function renderToday() {
  const key = ui.date;
  const s = summary(key);
  const day = state.days[key] || { entries: [], burned: 0 };
  const isToday = key === dateKey();

  const r = 56;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(s.eaten / Math.max(s.budget, 1), 1);
  const over = s.remaining < 0;
  const pGoal = proteinGoal();
  const cGoal = Math.round((state.settings.goal * 0.45) / 4);
  const fGoal = Math.round((state.settings.goal * 0.3) / 9);
  const bar = (v, goal, color) => `<div class="bar"><i style="width:${Math.min((v / goal) * 100, 100)}%;background:${color}"></i></div>`;

  $('#topbar-extra').innerHTML = `<div class="datenav">
    <button class="icon-btn" data-action="date-prev" aria-label="Previous day">‹</button>
    <button class="icon-btn label" data-action="date-today" style="width:auto">${isToday ? 'Today' : esc(fmtDate(key, { weekday: 'short', day: 'numeric', month: 'short' }))}</button>
    <button class="icon-btn" data-action="date-next" aria-label="Next day">›</button>
  </div>`;

  const burnSource = day.burned
    ? `<span class="chip-src">${day.burnedSource === 'watch' ? '⌚ Synced from Apple Watch' : '✍️ Entered manually'}${day.burnedAt ? ` · ${new Date(day.burnedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</span>`
    : '';

  const mealCards = MEALS.map((meal) => {
    const entries = day.entries.filter((e) => e.meal === meal);
    const kcal = Math.round(entries.reduce((sum, e) => sum + e.kcal, 0));
    const open = ui.openAdd === meal;
    const draft = ui.drafts[meal] || '';
    const target = slotTarget(meal, { goal: state.settings.goal, remaining: s.remaining, loggedSlots: s.loggedSlots });
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
    goal: state.settings.goal, eaten: s.eaten, burned: s.burned, remaining: s.remaining,
    protein: s.protein, proteinGoal: pGoal, loggedSlots: s.loggedSlots, hour: new Date().getHours(),
  }) : [];

  $('#view-today').innerHTML = `
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
          <span>Goal</span><span class="v">${state.settings.goal}</span>
          <span>Food</span><span class="v">− ${s.eaten}</span>
          <span>Exercise ⌚${state.settings.eatBack < 100 ? ` <span class="muted small">(${state.settings.eatBack}%)</span>` : ''}</span><span class="v burnv">+ ${s.credit}</span>
          <span class="total">Remaining</span><span class="v total">${s.remaining}</span>
        </div>
      </div>
      <div class="macros">
        <div class="macro"><div class="name"><span>Protein</span><span>${Math.round(s.protein)}/${pGoal}g</span></div>${bar(s.protein, pGoal, 'var(--protein)')}</div>
        <div class="macro"><div class="name"><span>Carbs</span><span>${Math.round(s.carbs)}/${cGoal}g</span></div>${bar(s.carbs, cGoal, 'var(--carbs)')}</div>
        <div class="macro"><div class="name"><span>Fat</span><span>${Math.round(s.fat)}/${fGoal}g</span></div>${bar(s.fat, fGoal, 'var(--fat)')}</div>
      </div>
    </div>

    <div class="card burn-card">
      <div class="row"><span class="flame" aria-hidden="true">🔥</span>
        <div class="grow"><b>Calories burned</b><div class="small muted">Active calories from your Apple Watch (Activity → Move ring)</div></div></div>
      <div class="row" style="margin-top:10px">
        <input type="number" inputmode="numeric" min="0" max="10000" id="burn-input" placeholder="e.g. 450" value="${day.burned || ''}" aria-label="Active calories burned">
        <span class="muted">kcal</span>
        <button class="btn burn" data-action="burn-save">Save</button>
        <button class="btn secondary" data-action="burn-paste" title="Paste a number copied by the Apple Watch shortcut">📋</button>
      </div>
      <div class="row between wrap" style="margin-top:8px">${burnSource}<button class="btn ghost small" data-action="goto" data-view="me" data-anchor="watch">Sync automatically ›</button></div>
    </div>

    ${mealCards}

    ${tips.length ? `<div class="card"><h2>Tips</h2><ul class="tips">${tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
  `;

  if (ui.openAdd) {
    const ta = $(`#add-${ui.openAdd}`);
    if (ta && ui.focusAdd) {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
      ui.focusAdd = false;
    }
  }
}

// ---------- Plan ----------

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
  $('#topbar-extra').innerHTML = '';
  const keys = weekKeys();
  const today = dateKey();
  const goal = state.settings.goal;
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

  $('#view-plan').innerHTML = `
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
      <div class="row" style="margin-top:6px"><span class="small muted grow">Suggestions use your likes, diet and ${goal} kcal goal.</span>
        <button class="btn ghost small" data-action="clear-week">Clear week</button></div>
    </div>
    ${days}`;
}

function openSlotPicker(key, slot, query = '') {
  const current = state.plan[key]?.[slot];
  const target = Math.round(state.settings.goal * MEAL_SHARE[slot]);
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

// ---------- Ideas ----------

function renderIdeas() {
  $('#topbar-extra').innerHTML = '';
  const today = dateKey();
  const s = summary(today);
  const slot = ui.ideasSlot || suggestedSlot();
  const target = slotTarget(slot, { goal: state.settings.goal, remaining: s.remaining, loggedSlots: s.loggedSlots });
  const recs = recommend({ slot: ui.ideasQuery ? null : slot, target, prefs: state.settings, query: ui.ideasQuery, limit: 12 });
  const hasPrefs = state.settings.likes.length || state.settings.dislikes.length || state.settings.diet !== 'none';

  $('#view-ideas').innerHTML = `
    <div class="card">
      <h2>${s.remaining > 0 ? `You have <span style="color:var(--brand)">${s.remaining} kcal</span> left today` : `You're at your goal for today`}</h2>
      <div class="small muted">${s.burned ? `Includes ${s.credit} kcal from your Apple Watch. ` : ''}Suggestions for ${MEAL_LABELS[slot].toLowerCase()} aim for about ${target} kcal.</div>
      <div class="quick-ideas" style="margin-top:6px">${MEALS.map((m) => `<button class="pill ${m === slot && !ui.ideasQuery ? 'active' : ''}" data-action="ideas-slot" data-meal="${m}">${MEAL_LABELS[m]}</button>`).join('')}</div>
      <input type="search" id="ideas-search" placeholder="Craving something? (chicken, pasta, sweet…)" value="${esc(ui.ideasQuery)}" style="margin-top:8px">
      ${hasPrefs ? '' : `<div class="hint" style="margin-top:10px">Tell me what you like for better ideas → <a href="#" data-action="goto" data-view="me" data-anchor="prefs">Preferences</a></div>`}
    </div>
    ${recs.length ? recs.map(({ recipe, reasons }) => recipeCard(recipe, {
      reasons,
      actions: `<button class="btn small" data-action="quick-log" data-id="${recipe.id}" data-meal="${ui.ideasQuery ? recipe.meal : slot}">Log to today</button>
        <button class="btn secondary small" data-action="plan-recipe" data-id="${recipe.id}">Add to plan</button>
        <span class="spacer"></span>
        <button class="icon-btn" data-action="fav" data-id="${recipe.id}" aria-label="Favourite" title="I like this">${state.settings.favorites.includes(recipe.id) ? '❤️' : '🤍'}</button>
        <button class="icon-btn" data-action="hide" data-id="${recipe.id}" aria-label="Not for me" title="Not for me">👎</button>`,
    })).join('') : `<div class="card empty-state">No ideas match. Try another search or relax your preferences.</div>`}
    ${state.settings.hidden.length ? `<button class="btn ghost" data-action="unhide-all">Show ${state.settings.hidden.length} hidden idea${state.settings.hidden.length === 1 ? '' : 's'} again</button>` : ''}
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

// ---------- Me ----------

function chipList(list, kind) {
  return `<div class="chips">${state.settings[list].map((v) => `<span class="chip ${kind === 'bad' ? 'bad' : ''}">${esc(v)}<button data-action="remove-chip" data-list="${list}" data-value="${esc(v)}" aria-label="Remove ${esc(v)}">✕</button></span>`).join('') || '<span class="small muted">Nothing yet</span>'}</div>`;
}

const LIKE_SUGGESTIONS = ['chicken', 'salmon', 'eggs', 'pasta', 'rice', 'tofu', 'avocado', 'spicy', 'mexican', 'asian', 'italian', 'indian', 'sweet', 'quick', 'high-protein', 'low-carb'];

function syncUrl() {
  return `${location.origin}${location.pathname}?burned=`;
}

function renderMe() {
  $('#topbar-extra').innerHTML = '';
  const st = state.settings;
  const c = st.calc || { sex: 'female', age: 30, height: 170, weight: 70, activity: 1.2, aim: -500 };

  $('#view-me').innerHTML = `
    <div class="card" id="goal">
      <h2>Daily calorie goal</h2>
      <div class="row"><input type="number" inputmode="numeric" id="goal-input" min="1000" max="6000" value="${st.goal}" aria-label="Daily calorie goal"><span class="muted">kcal</span></div>
      <details style="margin-top:10px">
        <summary class="btn ghost small" style="padding-left:0">Help me calculate ›</summary>
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
            ${[[1.2, 'Mostly sitting (recommended if you log Apple Watch calories)'], [1.375, 'Lightly active job'], [1.55, 'On my feet most of the day']].map(([v, l]) => `<option value="${v}" ${Number(c.activity) === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select></label>
          <label class="field"><span>Goal</span><select id="calc-aim">
            ${[[-500, 'Lose ~0.5 kg / 1 lb per week'], [-250, 'Lose slowly'], [0, 'Maintain weight'], [300, 'Build muscle / gain']].map(([v, l]) => `<option value="${v}" ${Number(c.aim) === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select></label>
          <button class="btn secondary" data-action="calc-goal">Calculate & use</button>
          <div class="small muted">Uses the Mifflin-St Jeor formula. Your workouts come from the Apple Watch number on top of this, so they aren't counted twice.</div>
        </div>
      </details>
    </div>

    <div class="card" id="prefs">
      <h2>What do you like?</h2>
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
      <h2>⌚ Apple Watch calories</h2>
      <label class="field"><span>How much of your burned calories can you eat back?</span>
        <select id="eatback-select">${[[100, 'All of it (100%)'], [75, '75% — Apple Watch can overestimate'], [50, 'Half (50%)'], [0, "None — just track, don't add"]].map(([v, l]) => `<option value="${v}" ${st.eatBack === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>

      <h3>Sync automatically with a Shortcut</h3>
      <div class="small muted">Web apps can't read Apple Health directly, but a free iPhone Shortcut can send today's Active Energy here in one tap (or automatically every evening).</div>
      <ol class="steps">
        <li>Open the <b>Shortcuts</b> app → <b>+</b> new shortcut, name it “Sync calories”.</li>
        <li>Add <b>Find Health Samples</b>: Type is <i>Active Energy</i>, Start Date <i>is today</i>.</li>
        <li>Add <b>Calculate Statistics</b>: <i>Sum</i> of Health Samples.</li>
        <li>Add <b>Round Number</b> (Statistics Result).</li>
        <li>Add <b>Copy to Clipboard</b> (Rounded Number).</li>
        <li>Add <b>Text</b> containing this link, then insert the <i>Rounded Number</i> variable at the end:<br>
          <code id="sync-url">${esc(syncUrl())}</code> <button class="btn ghost small" data-action="copy-url">Copy link</button></li>
        <li>Add <b>Open URLs</b> (Text). Done! Optional: Automation tab → <i>Time of Day</i> 9 pm → run “Sync calories”.</li>
      </ol>
      <div class="small muted" style="margin-top:6px">Tip: if you use this app from your Home Screen, iPhone keeps its data separate from Safari. In that case open the app after running the shortcut and tap <b>📋</b> next to “Calories burned” to paste the number.</div>
    </div>

    <div class="card" id="myfoods">
      <h2>My foods</h2>
      <div class="small muted">Add things the app doesn't know (your protein bar, mum's lasagne…). Then just type their name.</div>
      <div class="row" style="margin-top:8px">
        <input type="text" id="cf-name" placeholder="Name" class="grow">
        <input type="number" inputmode="numeric" id="cf-kcal" placeholder="kcal" style="max-width:90px">
        <input type="number" inputmode="numeric" id="cf-protein" placeholder="protein g" style="max-width:100px">
      </div>
      <button class="btn secondary block" style="margin-top:8px" data-action="add-custom-food">Save food (per serving)</button>
      ${st.customFoods.length ? `<ul class="breakdown" style="margin-top:10px">${st.customFoods.map((f, i) => `<li><span>${esc(f.name)}</span><span>${f.kcal} kcal${f.protein ? ` · ${f.protein}g P` : ''} <button class="icon-btn" data-action="remove-custom-food" data-index="${i}" aria-label="Delete">🗑</button></span></li>`).join('')}</ul>` : ''}
    </div>

    <div class="card">
      <h2>Your data</h2>
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

// ---------- sheet & toast ----------

const sheet = $('#sheet');
function openSheet(title, html) {
  $('#sheet-title').textContent = title;
  $('#sheet-body').innerHTML = html;
  if (!sheet.open) sheet.showModal();
}
function closeSheet() { if (sheet.open) sheet.close(); }
$('#sheet-close').addEventListener('click', closeSheet);
sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ---------- navigation ----------

const TITLES = { today: 'Today', plan: 'Meal plan', ideas: 'Ideas', me: 'Me' };

function render() {
  for (const v of Object.keys(TITLES)) $(`#view-${v}`).hidden = v !== ui.view;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === ui.view));
  $('#view-title').textContent = TITLES[ui.view];
  ({ today: renderToday, plan: renderPlan, ideas: renderIdeas, me: renderMe })[ui.view]();
}

function go(view, anchor) {
  ui.view = view;
  render();
  if (anchor) $(`#${anchor}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else window.scrollTo(0, 0);
}

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => go(t.dataset.view)));

// ---------- actions ----------

function setBurned(key, value, source) {
  const day = getDay(key);
  day.burned = Math.max(0, Math.round(value));
  day.burnedSource = source;
  day.burnedAt = Date.now();
  persist();
}

function parseNumberLoose(text) {
  const m = String(text || '').replace(',', '.').match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function addChip(list, raw) {
  const values = raw.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
  for (const v of values) if (!state.settings[list].includes(v)) state.settings[list].push(v);
  persist();
}

const actions = {
  'date-prev': () => { ui.date = addDays(ui.date, -1); ui.openAdd = null; render(); },
  'date-next': () => { ui.date = addDays(ui.date, 1); ui.openAdd = null; render(); },
  'date-today': () => { ui.date = dateKey(); render(); },
  'toggle-add': ({ meal }) => { ui.openAdd = ui.openAdd === meal ? null : meal; ui.focusAdd = true; render(); },
  'add-entry': ({ meal }) => {
    const text = ui.drafts[meal] || '';
    const entry = addEntry(ui.date, meal, text);
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
    const key = ui.view === 'today' ? ui.date : dateKey();
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
  goto: ({ view, anchor }) => go(view, anchor),

  'week-prev': () => { ui.weekStart = addDays(ui.weekStart, -7); render(); },
  'week-next': () => { ui.weekStart = addDays(ui.weekStart, 7); render(); },
  'week-today': () => { ui.weekStart = mondayOf(dateKey()); render(); },
  autofill: () => {
    const keys = weekKeys();
    const generated = planDays(keys, state.settings, state.settings.goal);
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

  'add-chip': ({ list }) => {
    const input = $(list === 'likes' ? '#like-input' : '#dislike-input');
    if (!input.value.trim()) return;
    addChip(list, input.value);
    render();
    $(list === 'likes' ? '#like-input' : '#dislike-input').focus();
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
      aim: Number($('#calc-aim').value),
    };
    if (!calc.age || !calc.height || !calc.weight) { toast('Fill in age, height and weight'); return; }
    const bmr = 10 * calc.weight + 6.25 * calc.height - 5 * calc.age + (calc.sex === 'male' ? 5 : -161);
    const goal = Math.round((bmr * calc.activity + calc.aim) / 10) * 10;
    state.settings.calc = calc;
    state.settings.goal = Math.max(goal, calc.sex === 'male' ? 1500 : 1200);
    persist();
    render();
    toast(`Goal set to ${state.settings.goal} kcal`);
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
    a.download = `food-planner-backup-${dateKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  import: () => $('#import-file').click(),
  reset: () => {
    if (!confirm('Delete all your meals, plans and settings on this device?')) return;
    Object.assign(state, normalizeState({}));
    persist();
    render();
    toast('Everything reset');
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  fn({ ...el.dataset });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('.slot')) actions['pick-slot']({ ...e.target.dataset });
  if (e.key === 'Enter' && e.target.id === 'like-input') actions['add-chip']({ list: 'likes' });
  if (e.key === 'Enter' && e.target.id === 'dislike-input') actions['add-chip']({ list: 'dislikes' });
  if (e.key === 'Enter' && e.target.id === 'burn-input') actions['burn-save']();
  if (e.key === 'Enter' && !e.shiftKey && e.target.dataset.draft) {
    e.preventDefault();
    actions['add-entry']({ meal: e.target.dataset.draft });
  }
});

let searchTimer;
document.addEventListener('input', (e) => {
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
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'goal-input') {
    const v = Math.round(Number(t.value));
    if (v >= 800 && v <= 8000) { state.settings.goal = v; persist(); toast(`Goal set to ${v} kcal`); }
  } else if (t.id === 'diet-select') {
    state.settings.diet = t.value; persist();
  } else if (t.id === 'eatback-select') {
    state.settings.eatBack = Number(t.value); persist();
  } else if (t.dataset.shop) {
    const list = state.shopping[ui.weekStart] || [];
    state.shopping[ui.weekStart] = t.checked ? [...list, t.dataset.shop] : list.filter((x) => x !== t.dataset.shop);
    t.closest('li').classList.toggle('done', t.checked);
    persist();
  } else if (t.id === 'import-file' && t.files[0]) {
    t.files[0].text().then((txt) => {
      Object.assign(state, normalizeState(JSON.parse(txt)));
      persist();
      render();
      toast('Backup imported');
    }).catch(() => toast('That file is not a valid backup'));
  }
});

// ---------- Apple Watch sync via URL: ?burned=452&date=2026-09-28 ----------

function handleIncomingUrl() {
  const params = new URLSearchParams(location.search || location.hash.replace(/^#/, ''));
  if (!params.has('burned')) return;
  const v = parseNumberLoose(params.get('burned'));
  const key = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '') ? params.get('date') : dateKey();
  history.replaceState(null, '', location.pathname);
  if (v === null) return;
  setBurned(key, v, 'watch');
  ui.date = key;
  setTimeout(() => toast(`⌚ Synced ${Math.round(v)} kcal from Apple Watch`), 300);
}

handleIncomingUrl();
render();

// Re-render when the app comes back to the foreground on a new day.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ui.view === 'today' && !ui.openAdd) render();
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
