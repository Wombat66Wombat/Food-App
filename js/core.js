// Shared app state and UI helpers used by every section.

import { loadState, saveState } from './store.js';

export const state = loadState();

export const ui = {
  view: 'food',
};

export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const uid = () => Math.random().toString(36).slice(2, 10);

export function persist() {
  if (!saveState(state)) toast('Storage is full — export a backup and remove the wallpaper');
}

let renderFn = () => {};
export function setRenderer(fn) { renderFn = fn; }
export function render() { renderFn(); }

// Action registry: elements with data-action="name" call actions[name](dataset).
export const actions = {};
export const inputHandlers = [];
export const changeHandlers = [];
export const keyHandlers = [];

let toastTimer;
export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

let onSheetClose = null;
export function openSheet(title, html, { onClose } = {}) {
  const sheet = $('#sheet');
  $('#sheet-title').textContent = title;
  $('#sheet-body').innerHTML = html;
  onSheetClose = onClose || null;
  if (!sheet.open) sheet.showModal();
}
export function closeSheet() {
  const sheet = $('#sheet');
  if (sheet.open) sheet.close();
}
export function sheetClosed() {
  const fn = onSheetClose;
  onSheetClose = null;
  if (fn) fn();
}
export const sheetIsOpen = () => $('#sheet').open;

export function setTopbarExtra(html) {
  $('#topbar-extra').innerHTML = html;
}
