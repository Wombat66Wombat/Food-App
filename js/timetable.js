// Timetable: a repeating weekly schedule (classes, work, training…).

import { dateKey, fromKey, addDays, mondayOf, weekdayIndex } from './store.js';
import { state, ui, $, esc, uid, persist, render, actions, openSheet, closeSheet, toast, setTopbarExtra } from './core.js';

export const EVENT_COLORS = ['#16a34a', '#0284c7', '#7c3aed', '#ea580c', '#e11d48', '#0d9488', '#ca8a04', '#64748b'];

Object.assign(ui, { ttDay: weekdayIndex(), ttMode: 'day', ttWeek: null });

// 'A' or 'B' for the week containing `key`, or null when A/B weeks are off.
export function weekType(key = dateKey()) {
  const ab = state.settings.abWeeks;
  if (!ab?.enabled || !ab.anchor) return null;
  const weeks = Math.round((fromKey(mondayOf(key)) - fromKey(ab.anchor)) / (7 * 864e5));
  return weeks % 2 === 0 ? 'A' : 'B';
}

// Which week the timetable is showing right now.
const viewedWeek = () => ui.ttWeek || weekType();
const isCurrentWeek = () => viewedWeek() === weekType();

const dayName = (i, style = 'short') =>
  new Date(`${addDays(mondayOf(dateKey()), i)}T12:00`).toLocaleDateString(undefined, { weekday: style });

const toMin = (hhmm) => {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return h * 60 + (m || 0);
};

export function eventsFor(day, week = viewedWeek()) {
  return state.timetable
    .filter((e) => e.day === day && (!week || !e.weeks || e.weeks === 'both' || e.weeks === week))
    .sort((a, b) => toMin(a.start) - toMin(b.start));
}

function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function eventRow(e, badge = '') {
  return `<button class="tt-event" data-action="tt-edit" data-id="${e.id}" style="--ev:${esc(e.color || EVENT_COLORS[0])}">
    <span class="tt-time">${esc(e.start)}<br><span class="muted">${esc(e.end)}</span></span>
    <span class="tt-body"><b>${esc(e.title)}${weekType() && e.weeks && e.weeks !== 'both' ? ` <span class="ab-tag">${e.weeks}</span>` : ''}</b>${e.place ? `<span class="small muted">📍 ${esc(e.place)}</span>` : ''}</span>
    ${badge}
  </button>`;
}

function renderDay() {
  const events = eventsFor(ui.ttDay);
  const isToday = ui.ttDay === weekdayIndex() && isCurrentWeek();
  const now = nowMinutes();
  let nextMarked = false;

  let nowNext = '';
  if (isToday && events.length) {
    const current = events.find((e) => toMin(e.start) <= now && now < toMin(e.end));
    const next = events.find((e) => toMin(e.start) > now);
    if (current || next) {
      nowNext = `<div class="card now-next">
        ${current ? `<div><span class="badge now">Now</span> <b>${esc(current.title)}</b> <span class="muted">until ${esc(current.end)}</span></div>` : ''}
        ${next ? `<div><span class="badge next">Next</span> <b>${esc(next.title)}</b> <span class="muted">at ${esc(next.start)}${next.place ? ` · ${esc(next.place)}` : ''} · in ${formatIn(toMin(next.start) - now)}</span></div>` : ''}
      </div>`;
    }
  }

  return `${nowNext}
    <div class="card">
      ${events.length ? `<div class="tt-list">${events.map((e) => {
        let badge = '';
        if (isToday && toMin(e.start) <= now && now < toMin(e.end)) badge = '<span class="badge now">Now</span>';
        else if (isToday && !nextMarked && toMin(e.start) > now) { badge = '<span class="badge next">Next</span>'; nextMarked = true; }
        else if (isToday && toMin(e.end) <= now) badge = '<span class="badge done">✓</span>';
        return eventRow(e, badge);
      }).join('')}</div>` : `<div class="empty-state">Nothing on ${esc(dayName(ui.ttDay, 'long'))}. 🎉</div>`}
      <button class="btn block" style="margin-top:10px" data-action="tt-add">+ Add to ${esc(dayName(ui.ttDay, 'long'))}</button>
    </div>`;
}

function formatIn(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function renderWeek() {
  const today = isCurrentWeek() ? weekdayIndex() : -1;
  return Array.from({ length: 7 }, (_, d) => {
    const events = eventsFor(d);
    if (!events.length && d > 4) return '';
    return `<div class="card ${d === today ? 'today-card' : ''}">
      <div class="row between"><h2 style="margin:0">${esc(dayName(d, 'long'))}${d === today ? ' · Today' : ''}</h2>
        <button class="btn ghost small" data-action="tt-add" data-day="${d}">+ Add</button></div>
      ${events.length ? `<div class="tt-list">${events.map((e) => eventRow(e)).join('')}</div>` : '<div class="small muted">Free</div>'}
    </div>`;
  }).join('');
}

function weekSwitcher() {
  const current = weekType();
  if (!current) return '';
  const other = current === 'A' ? 'B' : 'A';
  const shown = viewedWeek();
  return `<div class="row">
    <div class="segmented grow" role="tablist" aria-label="Week A or B">
      <button role="tab" aria-selected="${shown === current}" data-action="tt-week" data-week="${current}">Week ${current} · this week</button>
      <button role="tab" aria-selected="${shown === other}" data-action="tt-week" data-week="${other}">Week ${other} · next week</button>
    </div>
    <button class="icon-btn" data-action="tt-ab-setup" aria-label="A/B week settings" title="A/B week settings">⇄</button>
  </div>`;
}

function renderTimetable(el) {
  setTopbarExtra(weekType() ? `<span class="ab-badge" data-action="tt-ab-setup" role="button" tabindex="0">Week ${weekType()}</span>` : '');
  el.innerHTML = `
    ${weekSwitcher()}
    <div class="segmented" role="tablist">
      <button role="tab" aria-selected="${ui.ttMode === 'day'}" data-action="tt-mode" data-mode="day">Day</button>
      <button role="tab" aria-selected="${ui.ttMode === 'week'}" data-action="tt-mode" data-mode="week">Week</button>
    </div>
    ${ui.ttMode === 'day' ? `<div class="day-chips">${Array.from({ length: 7 }, (_, i) => `<button class="pill ${i === ui.ttDay ? 'active' : ''} ${i === weekdayIndex() ? 'is-today' : ''}" data-action="tt-day" data-day="${i}">${esc(dayName(i))}</button>`).join('')}</div>
      ${renderDay()}` : renderWeek()}
    ${state.timetable.length === 0 ? '<div class="small muted" style="text-align:center">Add your classes, work shifts or training once — they repeat every week.</div>' : ''}
    ${weekType() ? '' : '<button class="btn ghost small" style="align-self:center" data-action="tt-ab-setup">School has Week A / Week B? Set it up ›</button>'}
  `;
}

function openEditor(event, defaultDay) {
  const isNew = !event;
  const e = event || { title: '', place: '', start: '08:00', end: '09:00', color: EVENT_COLORS[0], day: defaultDay, weeks: viewedWeek() || 'both' };
  const weeks = e.weeks || 'both';
  openSheet(isNew ? 'Add to timetable' : 'Edit', `
    <label class="field"><span>What</span><input type="text" id="tt-title" value="${esc(e.title)}" placeholder="e.g. Maths, Gym, Work"></label>
    <div class="field"><span>${isNew ? 'Days (repeats weekly)' : 'Day'}</span>
      <div class="chips" id="tt-days">${Array.from({ length: 7 }, (_, i) => `<button class="toggle-chip brand" data-action="tt-toggle-day" data-day="${i}" aria-pressed="${i === e.day}">${esc(dayName(i))}</button>`).join('')}</div></div>
    ${weekType() ? `<div class="field"><span>Which weeks?</span>
      <div class="segmented" id="tt-weeks">${[['both', 'Every week'], ['A', 'Only Week A'], ['B', 'Only Week B']].map(([k, l]) => `<button aria-selected="${weeks === k}" data-action="tt-weeks" data-weeks="${k}">${l}</button>`).join('')}</div></div>` : ''}
    <div class="row">
      <label class="field grow"><span>Start</span><input type="time" id="tt-start" value="${esc(e.start)}"></label>
      <label class="field grow"><span>End</span><input type="time" id="tt-end" value="${esc(e.end)}"></label>
    </div>
    <label class="field"><span>Where (optional)</span><input type="text" id="tt-place" value="${esc(e.place)}" placeholder="e.g. Room 12"></label>
    <div class="field"><span>Color</span><div class="swatches">${EVENT_COLORS.map((c) => `<button class="swatch" data-action="tt-color" data-color="${c}" style="background:${c}" aria-pressed="${c === e.color}" aria-label="Color ${c}"></button>`).join('')}</div></div>
    <button class="btn" data-action="tt-save" data-id="${isNew ? '' : e.id}">${isNew ? 'Add' : 'Save'}</button>
    ${isNew ? '' : `<button class="btn danger" data-action="tt-delete" data-id="${e.id}">Delete</button>`}
  `);
  ui.ttEditColor = e.color;
  ui.ttEditWeeks = weeks;
  ui.ttEditSingle = !isNew;
}

export const views = {
  timetable: { title: 'Timetable', render: renderTimetable },
};

Object.assign(actions, {
  'tt-mode': ({ mode }) => { ui.ttMode = mode; render(); },
  'tt-week': ({ week }) => { ui.ttWeek = week === weekType() ? null : week; render(); },
  'tt-weeks': ({ weeks }) => {
    ui.ttEditWeeks = weeks;
    document.querySelectorAll('#tt-weeks button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.weeks === weeks)));
  },
  'tt-ab-setup': () => {
    const current = weekType();
    openSheet('Week A / Week B', `
      <div class="small muted">Lessons can be set to every week, only Week A or only Week B. The app alternates A and B every Monday.</div>
      <div class="field"><span>This week (${esc(fromKey(mondayOf(dateKey())).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))}) is…</span>
        <div class="row">
          <button class="btn grow ${current === 'A' ? '' : 'secondary'}" data-action="tt-ab-set" data-week="A">Week A</button>
          <button class="btn grow ${current === 'B' ? '' : 'secondary'}" data-action="tt-ab-set" data-week="B">Week B</button>
        </div></div>
      <div class="small muted">After holidays the rhythm sometimes changes — just come back here and pick the right week.</div>
      ${current ? '<button class="btn danger" data-action="tt-ab-off">Turn off A/B weeks</button>' : ''}
    `);
  },
  'tt-ab-set': ({ week }) => {
    const monday = mondayOf(dateKey());
    state.settings.abWeeks = { enabled: true, anchor: week === 'A' ? monday : addDays(monday, -7) };
    ui.ttWeek = null;
    persist();
    closeSheet();
    render();
    toast(`This week is Week ${week}`);
  },
  'tt-ab-off': () => {
    state.settings.abWeeks = { enabled: false, anchor: null };
    ui.ttWeek = null;
    persist();
    closeSheet();
    render();
  },
  'tt-day': ({ day }) => { ui.ttDay = Number(day); render(); },
  'tt-add': ({ day }) => openEditor(null, day !== undefined ? Number(day) : ui.ttDay),
  'tt-edit': ({ id }) => openEditor(state.timetable.find((e) => e.id === id)),
  'tt-toggle-day': ({ day }) => {
    const btn = $(`#tt-days [data-day="${day}"]`);
    if (ui.ttEditSingle) {
      document.querySelectorAll('#tt-days .toggle-chip').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
    } else {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('aria-pressed') !== 'true'));
    }
  },
  'tt-color': ({ color }) => {
    ui.ttEditColor = color;
    document.querySelectorAll('.swatches .swatch').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.color === color)));
  },
  'tt-save': ({ id }) => {
    const title = $('#tt-title').value.trim();
    const start = $('#tt-start').value;
    const end = $('#tt-end').value;
    const place = $('#tt-place').value.trim();
    const days = [...document.querySelectorAll('#tt-days [aria-pressed="true"]')].map((b) => Number(b.dataset.day));
    if (!title) { toast('Give it a name'); return; }
    if (!days.length) { toast('Pick at least one day'); return; }
    if (!start || !end || toMin(end) <= toMin(start)) { toast('End time must be after the start'); return; }
    const data = { title, start, end, place, color: ui.ttEditColor, weeks: weekType() ? ui.ttEditWeeks : 'both' };
    if (id) {
      const ev = state.timetable.find((e) => e.id === id);
      Object.assign(ev, data, { day: days[0] });
    } else {
      for (const day of days) state.timetable.push({ id: uid(), day, ...data });
    }
    persist();
    closeSheet();
    render();
    toast(id ? 'Saved' : `Added to ${days.length} day${days.length === 1 ? '' : 's'}`);
  },
  'tt-delete': ({ id }) => {
    state.timetable = state.timetable.filter((e) => e.id !== id);
    persist();
    closeSheet();
    render();
  },
});
