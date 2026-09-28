// Everything is stored on this device (localStorage). Nothing is sent anywhere.

const KEY = 'food-planner.v1';

export const DEFAULT_SETTINGS = {
  goal: 2000,
  diet: 'none',
  allergies: [],
  likes: [],
  dislikes: [],
  favorites: [],
  hidden: [],
  eatBack: 100, // % of Apple Watch calories added back to the budget
  customFoods: [], // [{ name, kcal, protein }] per serving
  calc: null, // last inputs of the goal calculator
};

export function normalizeState(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) },
    days: s.days || {}, // { 'YYYY-MM-DD': { entries: [], burned, burnedSource, burnedAt } }
    plan: s.plan || {}, // { 'YYYY-MM-DD': { breakfast: { recipeId } | { text }, ... } }
    shopping: s.shopping || {}, // { weekStartKey: [checked item names] }
  };
}

export function loadState() {
  try {
    return normalizeState(JSON.parse(localStorage.getItem(KEY) || '{}'));
  } catch {
    return normalizeState({});
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage full or unavailable (private mode) – the app still works for this session
  }
}

const pad = (n) => String(n).padStart(2, '0');
export const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}
export function mondayOf(key) {
  const d = fromKey(key);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dateKey(d);
}
