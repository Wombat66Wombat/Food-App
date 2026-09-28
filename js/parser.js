// Turns free text like "2 eggs, 1 slice toast with butter, 150g chicken" into
// individual food items with grams, calories and macros.

import { FOODS } from './foods.js';

const WORD_NUMBERS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, half: 0.5, quarter: 0.25, couple: 2, few: 3,
};

const UNICODE_FRACTIONS = { '½': ' 1/2', '¼': ' 1/4', '¾': ' 3/4', '⅓': ' 1/3', '⅔': ' 2/3' };

// Unit words -> how they turn into grams. `g` = fixed grams per unit.
const UNITS = {};
function unit(words, def) { for (const w of words) UNITS[w] = def; }
unit(['g', 'gr', 'gram', 'grams', 'gramm'], { g: 1, label: 'g' });
unit(['kg', 'kilo', 'kilos', 'kilogram', 'kilograms'], { g: 1000, label: 'kg' });
unit(['oz', 'ounce', 'ounces'], { g: 28.35, label: 'oz' });
unit(['lb', 'lbs', 'pound', 'pounds'], { g: 453.6, label: 'lb' });
unit(['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'], { g: 1, label: 'ml' });
unit(['cl'], { g: 10, label: 'cl' });
unit(['dl'], { g: 100, label: 'dl' });
unit(['l', 'liter', 'liters', 'litre', 'litres'], { g: 1000, label: 'l' });
unit(['cup', 'cups', 'mug', 'mugs'], { kind: 'cup', label: 'cup' });
unit(['tbsp', 'tbs', 'tbl', 'tablespoon', 'tablespoons'], { kind: 'tbsp', label: 'tbsp' });
unit(['tsp', 'teaspoon', 'teaspoons'], { kind: 'tsp', label: 'tsp' });
unit(['handful', 'handfuls'], { kind: 'named', name: 'handful', fallback: 30, label: 'handful' });
unit(['glass', 'glasses'], { kind: 'named', name: 'glass', fallback: 250, label: 'glass' });
unit(['can', 'cans', 'tin', 'tins'], { kind: 'named', name: 'can', fallback: 330, label: 'can' });
unit(['bottle', 'bottles'], { kind: 'named', name: 'bottle', fallback: 330, label: 'bottle' });
unit(['bowl', 'bowls'], { kind: 'bowl', label: 'bowl' });
unit([
  'slice', 'slices', 'piece', 'pieces', 'pc', 'pcs', 'serving', 'servings', 'portion', 'portions',
  'scoop', 'scoops', 'bar', 'bars', 'clove', 'cloves', 'fillet', 'fillets', 'filet', 'pot', 'pots',
  'square', 'squares', 'wedge', 'wedges', 'stalk', 'stalks', 'spear', 'spears', 'box', 'boxes',
  'bag', 'bags', 'pat', 'pats', 'rasher', 'rashers', 'whole', 'packet', 'packets',
], { kind: 'count', label: '' });

const SIZE_WORDS = { small: 0.75, medium: 1, large: 1.3, big: 1.3, huge: 1.6 };
const FILLER = new Set(['of', 'some', 'the', 'my', 'cooked', 'raw', 'fresh', 'plain', 'x']);

// Crude English singularizer. Applied to both the input and the food names, so it
// only needs to be consistent, not correct.
export function singular(word) {
  if (word.length <= 3) return word;
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (/(ches|shes|sses|xes|oes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1);
  return word;
}

function normalizeWords(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(singular);
}

function levenshtein(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

// Build a search index: every name/alias of every food, normalized.
function buildIndex(foods) {
  const index = [];
  for (const food of foods) {
    for (const alias of [food.name, ...food.aliases]) {
      const norm = normalizeWords(alias).join(' ');
      if (norm) index.push({ food, norm });
    }
  }
  return index;
}

const DEFAULT_INDEX = buildIndex(FOODS);
let cachedCustom = null;
let cachedIndex = DEFAULT_INDEX;

function indexFor(customFoods) {
  if (!customFoods || customFoods.length === 0) return DEFAULT_INDEX;
  if (customFoods !== cachedCustom) {
    // Custom foods go first so they win ties against built-ins.
    cachedIndex = [...buildIndex(customFoods), ...DEFAULT_INDEX];
    cachedCustom = customFoods;
  }
  return cachedIndex;
}

// Find the food a piece of text refers to. Longest exact (word-boundary) match wins;
// otherwise fall back to a small typo tolerance ("banan", "brocoli").
export function matchFood(text, customFoods) {
  const index = indexFor(customFoods);
  const words = normalizeWords(text);
  if (words.length === 0) return null;
  const haystack = ` ${words.join(' ')} `;

  let best = null;
  for (const entry of index) {
    if (haystack.includes(` ${entry.norm} `) && (!best || entry.norm.length > best.norm.length)) {
      best = entry;
    }
  }
  if (best) return best.food;

  const candidates = [...words];
  for (let i = 0; i < words.length - 1; i++) candidates.push(`${words[i]} ${words[i + 1]}`);
  let fuzzy = null;
  for (const entry of index) {
    if (entry.norm.length < 4) continue;
    const allowed = entry.norm.length >= 8 ? 2 : 1;
    for (const cand of candidates) {
      if (cand.length < 4) continue;
      const d = levenshtein(cand, entry.norm);
      if (d <= allowed && (!fuzzy || d < fuzzy.d || (d === fuzzy.d && entry.norm.length > fuzzy.norm.length))) {
        fuzzy = { d, norm: entry.norm, food: entry.food };
      }
    }
  }
  return fuzzy ? fuzzy.food : null;
}

function parseNumber(token) {
  if (/^\d+\/\d+$/.test(token)) {
    const [n, d] = token.split('/').map(Number);
    return d ? n / d : null;
  }
  if (/^\d+(\.\d+)?$/.test(token)) return Number(token);
  return null;
}

function gramsForUnit(unitDef, food) {
  if (unitDef.g) return unitDef.g;
  switch (unitDef.kind) {
    case 'cup': return food.unitName === 'cup' ? food.unit : food.cup ?? 240;
    case 'tbsp': return food.tbsp ?? 15;
    case 'tsp': return (food.tbsp ?? 15) / 3;
    case 'bowl': return food.unitName === 'bowl' ? food.unit : food.cup ? food.cup * 1.5 : 300;
    case 'named': return food.unitName === unitDef.name ? food.unit : unitDef.fallback;
    default: return food.unit; // slice, piece, serving...
  }
}

const round1 = (n) => Math.round(n * 10) / 10;

// Parse a single item like "2 slices of toast" or "chicken 150g".
export function parseItem(raw, customFoods, { addOn = false } = {}) {
  const text = raw.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, '');
  if (!text) return null;
  let s = text.toLowerCase();
  for (const [ch, rep] of Object.entries(UNICODE_FRACTIONS)) s = s.split(ch).join(rep);

  // Explicit calories always win: "pizza slice 285 kcal", "protein cookie 210cal".
  const explicit = s.match(/(\d+(?:\.\d+)?)\s*(kcal|kcals|cal|cals|calories|calorie)\b/);
  if (explicit) {
    const name = text.replace(new RegExp(explicit[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '')
      .replace(/[-–:()]+/g, ' ').replace(/\s+/g, ' ').trim();
    return {
      input: text,
      matched: true,
      custom: true,
      name: name || 'Custom item',
      label: name || 'Custom item',
      grams: null,
      kcal: Math.round(Number(explicit[1])),
      protein: 0, carbs: 0, fat: 0,
    };
  }

  s = s
    .replace(/(\d)([a-z])/g, '$1 $2') // 100g -> 100 g, 2x -> 2 x
    .replace(/\bx(\d)/g, 'x $1')
    .replace(/[^a-z0-9./\s-]/g, ' ');
  const tokens = s.split(/\s+/).filter(Boolean);

  let qty = null;
  let unitDef = null;
  let unitWord = '';
  let size = 1;
  const rest = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const num = parseNumber(tok);
    if (num !== null && qty === null) {
      qty = num;
      // mixed number: "1 1/2"
      if (/^\d+$/.test(tok) && tokens[i + 1] && /^\d+\/\d+$/.test(tokens[i + 1])) {
        qty += parseNumber(tokens[++i]);
      }
      if (tokens[i + 1] && UNITS[tokens[i + 1]] && !unitDef) { unitWord = tokens[++i]; unitDef = UNITS[unitWord]; }
      continue;
    }
    if (i === 0 && tok in WORD_NUMBERS && tokens.length > 1) {
      qty = WORD_NUMBERS[tok];
      // "half an avocado", "a couple of eggs"
      if (tok === 'half' && (tokens[i + 1] === 'a' || tokens[i + 1] === 'an')) i++;
      if ((tok === 'a' || tok === 'an') && tokens[i + 1] in WORD_NUMBERS && tokens[i + 1] !== 'a') {
        qty = WORD_NUMBERS[tokens[++i]];
      }
      if (tokens[i + 1] && UNITS[tokens[i + 1]] && !unitDef) { unitWord = tokens[++i]; unitDef = UNITS[unitWord]; }
      continue;
    }
    if (!unitDef && rest.length === 0 && UNITS[tok] && UNITS[tok].kind && tokens.length > 1) {
      // unit without a number: "cup of coffee", "slice of pizza"
      unitDef = UNITS[tok];
      unitWord = tok;
      continue;
    }
    if (tok in SIZE_WORDS) { size = SIZE_WORDS[tok]; continue; }
    if (FILLER.has(tok)) continue;
    rest.push(tok);
  }

  const foodText = rest.join(' ');
  const food = matchFood(foodText, customFoods);
  if (!food) {
    return { input: text, matched: false, name: foodText || text, label: text, kcal: 0, protein: 0, carbs: 0, fat: 0 };
  }

  const amount = qty ?? 1;
  let grams;
  let label;
  if (unitDef?.g) {
    grams = amount * unitDef.g;
    label = `${fmt(amount)}${unitDef.label} ${food.name}`;
  } else if (unitDef) {
    grams = amount * gramsForUnit(unitDef, food);
    if (unitDef.kind === 'count' || unitDef.kind === 'named') grams *= size;
    label = `${fmt(amount)} ${unitWord} ${food.name}`;
  } else if (addOn && qty === null && food.splash) {
    grams = food.splash;
    label = `splash of ${food.name}`;
  } else {
    grams = amount * food.unit * size;
    label = `${fmt(amount)} × ${food.name}`;
  }

  const factor = grams / 100;
  return {
    input: text,
    matched: true,
    name: food.name,
    label,
    grams: Math.round(grams),
    kcal: Math.round(food.kcal * factor),
    protein: round1(food.protein * factor),
    carbs: round1(food.carbs * factor),
    fat: round1(food.fat * factor),
    tags: food.tags,
  };
}

function fmt(n) {
  if (n === 0.5) return '½';
  if (n === 0.25) return '¼';
  if (n === 0.75) return '¾';
  return String(round1(n));
}

// Split "2 eggs, toast with butter and a coffee" into items and parse each one.
export function parseMeal(text, customFoods) {
  if (!text || !text.trim()) return [];
  let prepared = text.replace(/(\d),(\d)/g, '$1.$2');

  // Protect food names that contain a separator word, e.g. "fish and chips".
  const protectedNames = [];
  for (const food of [...(customFoods || []), ...FOODS]) {
    for (const alias of [food.name, ...food.aliases]) {
      if (/\s(and|with|&)\s/i.test(alias)) protectedNames.push(alias);
    }
  }
  for (const name of protectedNames) {
    prepared = prepared.replace(new RegExp(`\\b${name}\\b`, 'gi'), name.replace(/\s/g, '_'));
  }

  // Remember which parts came after "with" so "coffee with milk" means a splash of milk.
  const parts = prepared.split(/(\n|,|;|\+|&|\band\b|\bwith\b|\bplus\b)/i);
  const items = [];
  for (let i = 0; i < parts.length; i += 2) {
    const addOn = /^with$/i.test(parts[i - 1] || '');
    const item = parseItem(parts[i].replace(/_/g, ' '), customFoods, { addOn });
    if (item) items.push(item);
  }
  return items;
}

export function totals(items) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const item of items) {
    t.kcal += item.kcal || 0;
    t.protein += item.protein || 0;
    t.carbs += item.carbs || 0;
    t.fat += item.fat || 0;
  }
  t.protein = round1(t.protein);
  t.carbs = round1(t.carbs);
  t.fat = round1(t.fat);
  return t;
}
