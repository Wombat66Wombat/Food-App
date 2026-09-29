// Everything is stored on this device (localStorage). Nothing is sent anywhere.

const KEY = 'food-planner.v1';

export const DEFAULT_THEME = {
  mode: 'system', // system | light | dark
  palette: 'green', // key of PALETTES, or 'wallpaper'
  wallpaper: null, // small data: URL of the user's wallpaper
  wallpaperBg: false, // show the wallpaper behind the app
  wallAccent: null, // { light, dark } accent colors picked from the wallpaper
};

export const DEFAULT_SETTINGS = {
  goal: 2000, // maintenance calories (what you burn on a normal day without workouts)
  deficitPct: 20, // % below maintenance you want to eat
  diet: 'none',
  allergies: [],
  likes: [],
  dislikes: [],
  favorites: [],
  hidden: [],
  customFoods: [], // [{ name, kcal, protein }] per serving
  calc: null, // last inputs of the goal calculator
  mandarinDaily: 5, // new flashcards to write per day
  abWeeks: { enabled: false, anchor: null }, // school Week A / Week B; anchor = a Monday that is Week A
  theme: DEFAULT_THEME,
};

export function normalizeState(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
  settings.theme = { ...DEFAULT_THEME, ...(s.settings?.theme || {}) };
  settings.abWeeks = { ...DEFAULT_SETTINGS.abWeeks, ...(s.settings?.abWeeks || {}) };
  return {
    settings,
    days: s.days || {}, // { 'YYYY-MM-DD': { entries: [], burned, burnedSource, burnedAt } }
    plan: s.plan || {}, // { 'YYYY-MM-DD': { breakfast: { recipeId } | { text }, ... } }
    shopping: s.shopping || {}, // { weekStartKey: [checked item names] }
    timetable: s.timetable || [], // [{ id, day (0 = Mon), start 'HH:MM', end, title, place, color, weeks: 'both' | 'A' | 'B' }]
    cards: s.cards || [], // [{ id, hanzi, pinyin, meaning, example, created, box, due, reviews, correct }]
    mandarin: { log: {}, ...(s.mandarin || {}) }, // log: { date: { added, reviewed } }
    focus: { steps: [], checklist: {}, stats: {}, timer: null, ...(s.focus || {}) },
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
    return true;
  } catch {
    return false; // storage full or unavailable (private mode)
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
// 0 = Monday … 6 = Sunday
export const weekdayIndex = (key = dateKey()) => (fromKey(key).getDay() + 6) % 7;
