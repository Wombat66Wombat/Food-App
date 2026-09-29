// Mandarin flashcards you write yourself: a daily goal of new cards + spaced repetition.

import { dateKey, addDays } from './store.js';
import { state, ui, $, esc, uid, persist, render, actions, inputHandlers, keyHandlers, openSheet, closeSheet, toast, setTopbarExtra } from './core.js';

// Days until a card comes back, per box. Box goes up when you know it, back to 0 when you don't.
export const INTERVALS = [0, 1, 2, 4, 7, 14, 30, 60];

const TONE_MARKS = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', ü: 'ǖǘǚǜ' };

function markSyllable(syl, tone) {
  if (tone === 5 || tone === 0) return syl;
  const lower = syl.toLowerCase();
  let idx = lower.indexOf('a');
  if (idx < 0) idx = lower.indexOf('e');
  if (idx < 0 && lower.includes('ou')) idx = lower.indexOf('o');
  if (idx < 0) {
    for (let i = lower.length - 1; i >= 0; i--) {
      if ('iouü'.includes(lower[i])) { idx = i; break; }
    }
  }
  if (idx < 0) return syl;
  const mark = TONE_MARKS[lower[idx]][tone - 1];
  const out = syl[idx] === syl[idx].toUpperCase() ? mark.toUpperCase() : mark;
  return syl.slice(0, idx) + out + syl.slice(idx + 1);
}

// "ni3 hao3" -> "nǐ hǎo", "lv4" -> "lǜ". Text that's already marked is left alone.
export function toPinyin(input) {
  return String(input || '')
    .replace(/u:/g, 'ü').replace(/U:/g, 'Ü')
    .replace(/v(?=[a-z]*[1-5])/g, 'ü').replace(/V(?=[a-z]*[1-5])/g, 'Ü')
    .replace(/([a-zA-ZüÜ]+)([0-5])/g, (_, syl, tone) => markSyllable(syl, Number(tone)));
}

// Grade a card: known -> next box, unknown -> back to box 0 (due today).
export function gradeCard(card, known, today = dateKey()) {
  card.reviews = (card.reviews || 0) + 1;
  if (known) {
    card.correct = (card.correct || 0) + 1;
    card.box = Math.min((card.box || 0) + 1, INTERVALS.length - 1);
  } else {
    card.box = 0;
  }
  card.due = addDays(today, INTERVALS[card.box]);
  return card;
}

Object.assign(ui, { mdSearch: '', mdDir: 'hanzi', session: null, mdPinyinDraft: '' });

const todayLog = () => {
  const k = dateKey();
  state.mandarin.log[k] = state.mandarin.log[k] || { added: 0, reviewed: 0 };
  return state.mandarin.log[k];
};

function addedOn(key) {
  return state.cards.filter((c) => c.created === key).length;
}

function streak() {
  const goal = state.settings.mandarinDaily;
  let key = dateKey();
  if (addedOn(key) < goal) key = addDays(key, -1); // today still in progress
  let n = 0;
  while (addedOn(key) >= goal) { n++; key = addDays(key, -1); }
  return n;
}

const dueCards = () => state.cards.filter((c) => (c.due || c.created) <= dateKey());

function speak(text) {
  if (!('speechSynthesis' in window) || !text) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  const voice = speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('zh'));
  if (voice) u.voice = voice;
  u.rate = 0.85;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

function boxDots(box = 0) {
  return `<span class="box-dots" title="Level ${box}">${INTERVALS.slice(1).map((_, i) => `<i class="${i < box ? 'on' : ''}"></i>`).join('')}</span>`;
}

function cardRow(c) {
  return `<li class="fc-row">
    <span class="fc-hanzi" lang="zh">${esc(c.hanzi)}</span>
    <span class="grow"><span class="fc-pinyin">${esc(c.pinyin)}</span><br><span class="small muted">${esc(c.meaning)}</span></span>
    ${boxDots(c.box)}
    <button class="icon-btn" data-action="md-speak" data-text="${esc(c.hanzi)}" aria-label="Listen">🔊</button>
    <button class="icon-btn" data-action="md-edit" data-id="${c.id}" aria-label="Edit">✎</button>
  </li>`;
}

function renderMandarin(el) {
  setTopbarExtra('');
  const goal = state.settings.mandarinDaily;
  const today = dateKey();
  const todays = state.cards.filter((c) => c.created === today);
  const due = dueCards();
  const st = streak();
  const pct = Math.min(todays.length / goal, 1);
  const q = ui.mdSearch.toLowerCase();
  const all = state.cards
    .filter((c) => !q || `${c.hanzi} ${c.pinyin} ${c.meaning}`.toLowerCase().includes(q))
    .sort((a, b) => (b.created || '').localeCompare(a.created || ''));

  el.innerHTML = `
    <div class="card">
      <div class="row between">
        <div><h2 style="margin:0" lang="zh">今天 · Today</h2>
          <div class="small muted">${todays.length >= goal ? 'Daily goal done — 很好! 🎉' : `Write ${goal - todays.length} more card${goal - todays.length === 1 ? '' : 's'} today`}</div></div>
        <div class="streak" title="Days in a row you hit your goal">🔥 ${st}</div>
      </div>
      <div class="goal-dots">${Array.from({ length: goal }, (_, i) => `<i class="${i < todays.length ? 'on' : ''}"></i>`).join('')}</div>
      <div class="bar" style="margin-top:8px"><i style="width:${pct * 100}%;background:var(--brand)"></i></div>
      <div class="row wrap" style="margin-top:12px">
        <button class="btn grow" data-action="md-practice" data-set="due" ${due.length ? '' : 'disabled'}>Review due (${due.length})</button>
        <button class="btn secondary grow" data-action="md-practice" data-set="today" ${todays.length ? '' : 'disabled'}>Practise today's (${todays.length})</button>
      </div>
    </div>

    <div class="card">
      <h2>✍️ New card</h2>
      <div class="stack">
        <input type="text" id="md-hanzi" lang="zh" class="hanzi-input" placeholder="汉字" autocomplete="off">
        <input type="text" id="md-pinyin" placeholder="Pinyin — type ni3 hao3 for nǐ hǎo" autocomplete="off" autocapitalize="off" spellcheck="false">
        <div class="small muted" id="md-pinyin-preview">${esc(toPinyin(ui.mdPinyinDraft))}</div>
        <input type="text" id="md-meaning" placeholder="Meaning (e.g. hello)">
        <input type="text" id="md-example" placeholder="Example sentence (optional)">
        <button class="btn" data-action="md-add">Save card</button>
      </div>
      ${todays.length ? `<h3>Today's cards</h3><ul class="fc-list">${todays.map(cardRow).join('')}</ul>` : ''}
    </div>

    <div class="card">
      <div class="row between"><h2 style="margin:0">All cards (${state.cards.length})</h2></div>
      ${state.cards.length ? `<input type="search" id="md-search" placeholder="Search" value="${esc(ui.mdSearch)}" style="margin-top:8px">
        <ul class="fc-list">${all.map(cardRow).join('') || '<li class="small muted">No match</li>'}</ul>`
        : '<div class="empty-state">Your cards will show up here. Aim for 4–5 new words every day.</div>'}
    </div>`;
}

// ---------- practice session ----------

function startSession(set) {
  const today = dateKey();
  const cards = set === 'today' ? state.cards.filter((c) => c.created === today) : dueCards();
  if (!cards.length) return;
  const queue = cards.map((c) => c.id).sort(() => Math.random() - 0.5);
  ui.session = { queue, index: 0, revealed: false, known: 0, requeued: {}, writes: 0 };
  renderSession();
}

function renderSession() {
  const s = ui.session;
  if (!s) return;
  if (s.index >= s.queue.length) {
    openSheet('Session done 🎉', `
      <div class="empty-state" style="font-size:1rem"><div style="font-size:2.4rem" lang="zh">好!</div>
        You reviewed ${new Set(s.queue).size} card${new Set(s.queue).size === 1 ? '' : 's'}.</div>
      <button class="btn" data-action="md-close">Done</button>`, { onClose: endSession });
    return;
  }
  const card = state.cards.find((c) => c.id === s.queue[s.index]);
  if (!card) { s.index++; renderSession(); return; }
  // Keep what you drew when the sheet re-renders for the same card (e.g. "Show answer").
  const oldCanvas = $('#pad-canvas');
  const keep = oldCanvas && padDrawn && s.padCard === s.index ? oldCanvas.toDataURL() : null;
  s.padCard = s.index;
  const front = ui.mdDir === 'hanzi'
    ? `<div class="fc-big" lang="zh">${esc(card.hanzi)}</div>`
    : `<div class="fc-meaning">${esc(card.meaning)}</div>`;
  const back = `
    <div class="fc-answer">
      ${ui.mdDir === 'hanzi' ? '' : `<div class="fc-big" lang="zh">${esc(card.hanzi)}</div>`}
      <div class="fc-pinyin big">${esc(card.pinyin)} <button class="icon-btn" data-action="md-speak" data-text="${esc(card.hanzi)}" aria-label="Listen">🔊</button></div>
      ${ui.mdDir === 'hanzi' ? `<div class="fc-meaning">${esc(card.meaning)}</div>` : ''}
      ${card.example ? `<div class="small muted" lang="zh">${esc(card.example)}</div>` : ''}
    </div>`;

  openSheet(`Card ${s.index + 1} of ${s.queue.length}`, `
    <div class="segmented small">
      <button aria-selected="${ui.mdDir === 'hanzi'}" data-action="md-dir" data-dir="hanzi">汉字 → meaning</button>
      <button aria-selected="${ui.mdDir === 'meaning'}" data-action="md-dir" data-dir="meaning">meaning → 汉字</button>
    </div>
    <div class="fc-card">${front}${s.revealed ? back : ''}</div>
    <div class="pad-wrap">
      <div class="pad" id="pad">
        <span class="pad-ghost ${s.revealed || s.trace ? 'show' : ''}" lang="zh" style="font-size:calc(min(240px, 70vw) * ${(0.75 / Math.max(1, [...card.hanzi].length)).toFixed(3)})">${esc(card.hanzi)}</span>
        <canvas id="pad-canvas"></canvas>
      </div>
      <div class="row between small">
        <span class="muted">✍️ Write it here · ${s.writes}× </span>
        <span class="row"><button class="btn ghost small" data-action="md-trace">${s.trace ? 'Hide' : 'Trace'}</button>
        <button class="btn ghost small" data-action="md-clear">Clear</button></span>
      </div>
    </div>
    ${s.revealed
      ? `<div class="row"><button class="btn danger grow" data-action="md-grade" data-known="0">Again</button><button class="btn grow" data-action="md-grade" data-known="1">Got it ✓</button></div>`
      : `<button class="btn" data-action="md-reveal">Show answer</button>`}
  `, { onClose: endSession });
  setupPad(keep);
}

function endSession() {
  ui.session = null;
  render();
}

let padDrawn = false;
function setupPad(restore) {
  const canvas = $('#pad-canvas');
  if (!canvas) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(rect.width / 32, 5);
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#000';
  padDrawn = false;
  if (restore) {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
    img.src = restore;
    padDrawn = true;
  }
  let drawing = false;
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  canvas.addEventListener('pointerdown', (e) => {
    drawing = true;
    padDrawn = true;
    canvas.setPointerCapture(e.pointerId);
    ctx.beginPath();
    ctx.moveTo(...pos(e));
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    ctx.lineTo(...pos(e));
    ctx.stroke();
  });
  const stop = () => { drawing = false; };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
}

function clearPad() {
  const canvas = $('#pad-canvas');
  if (!canvas) return;
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  if (padDrawn && ui.session) {
    ui.session.writes++;
    const label = document.querySelector('.pad-wrap .muted');
    if (label) label.textContent = `✍️ Write it here · ${ui.session.writes}× `;
  }
  padDrawn = false;
}

function openCardEditor(card) {
  openSheet('Edit card', `
    <input type="text" id="mde-hanzi" lang="zh" class="hanzi-input" value="${esc(card.hanzi)}">
    <input type="text" id="mde-pinyin" value="${esc(card.pinyin)}" autocapitalize="off" spellcheck="false">
    <input type="text" id="mde-meaning" value="${esc(card.meaning)}">
    <input type="text" id="mde-example" value="${esc(card.example || '')}" placeholder="Example sentence (optional)">
    <button class="btn" data-action="md-save" data-id="${card.id}">Save</button>
    <button class="btn danger" data-action="md-delete" data-id="${card.id}">Delete card</button>
  `);
}

export const views = {
  mandarin: { title: 'Mandarin', render: renderMandarin },
};

Object.assign(actions, {
  'md-add': () => {
    const hanzi = $('#md-hanzi').value.trim();
    const pinyin = toPinyin($('#md-pinyin').value.trim());
    const meaning = $('#md-meaning').value.trim();
    const example = $('#md-example').value.trim();
    if (!hanzi || !meaning) { toast('Add the characters and a meaning'); return; }
    if (state.cards.some((c) => c.hanzi === hanzi)) { toast(`You already have ${hanzi}`); return; }
    const today = dateKey();
    state.cards.push({ id: uid(), hanzi, pinyin, meaning, example, created: today, box: 0, due: today, reviews: 0, correct: 0 });
    todayLog().added++;
    ui.mdPinyinDraft = '';
    persist();
    render();
    const left = state.settings.mandarinDaily - addedOn(today);
    toast(left > 0 ? `Saved ${hanzi} · ${left} to go today` : `Saved ${hanzi} · daily goal done 🎉`);
    $('#md-hanzi').focus();
  },
  'md-edit': ({ id }) => openCardEditor(state.cards.find((c) => c.id === id)),
  'md-save': ({ id }) => {
    const card = state.cards.find((c) => c.id === id);
    card.hanzi = $('#mde-hanzi').value.trim() || card.hanzi;
    card.pinyin = toPinyin($('#mde-pinyin').value.trim());
    card.meaning = $('#mde-meaning').value.trim() || card.meaning;
    card.example = $('#mde-example').value.trim();
    persist();
    closeSheet();
    render();
  },
  'md-delete': ({ id }) => {
    if (!confirm('Delete this card?')) return;
    state.cards = state.cards.filter((c) => c.id !== id);
    persist();
    closeSheet();
    render();
  },
  'md-speak': ({ text }) => speak(text),
  'md-practice': ({ set }) => startSession(set),
  'md-dir': ({ dir }) => { ui.mdDir = dir; renderSession(); },
  'md-reveal': () => {
    ui.session.revealed = true;
    renderSession();
    speak(state.cards.find((c) => c.id === ui.session.queue[ui.session.index])?.hanzi);
  },
  'md-trace': () => { ui.session.trace = !ui.session.trace; $('.pad-ghost')?.classList.toggle('show', ui.session.trace || ui.session.revealed); $('[data-action="md-trace"]').textContent = ui.session.trace ? 'Hide' : 'Trace'; },
  'md-clear': () => clearPad(),
  'md-grade': ({ known }) => {
    const s = ui.session;
    const id = s.queue[s.index];
    const card = state.cards.find((c) => c.id === id);
    const isKnown = known === '1';
    const firstTime = !s.requeued[id];
    if (firstTime) todayLog().reviewed++;
    gradeCard(card, isKnown);
    if (!isKnown && (s.requeued[id] || 0) < 2) {
      s.queue.push(id); // see it again at the end of this session
      s.requeued[id] = (s.requeued[id] || 0) + 1;
    }
    s.index++;
    s.revealed = false;
    s.writes = 0;
    persist();
    renderSession();
  },
  'md-close': () => closeSheet(),
});

inputHandlers.push((e) => {
  const t = e.target;
  if (t.id === 'md-pinyin') {
    ui.mdPinyinDraft = t.value;
    $('#md-pinyin-preview').textContent = toPinyin(t.value);
    return true;
  }
  if (t.id === 'md-search') {
    ui.mdSearch = t.value;
    const pos = t.selectionStart;
    render();
    const input = $('#md-search');
    input.focus();
    input.setSelectionRange(pos, pos);
    return true;
  }
  return false;
});

keyHandlers.push((e) => {
  if (e.key !== 'Enter') return false;
  const order = ['md-hanzi', 'md-pinyin', 'md-meaning', 'md-example'];
  const i = order.indexOf(e.target.id);
  if (i < 0) return false;
  e.preventDefault();
  if (i < order.length - 1) $(`#${order[i + 1]}`).focus();
  else actions['md-add']();
  return true;
});
