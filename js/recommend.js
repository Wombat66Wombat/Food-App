// Recommendations: picks meals that fit your remaining calories and your preferences.

import { RECIPES } from './recipes.js';
import { parseMeal, totals, singular } from './parser.js';

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
export const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };
// Rough split of a day's calories across meals.
export const MEAL_SHARE = { breakfast: 0.25, lunch: 0.35, dinner: 0.3, snack: 0.1 };

export const DIETS = {
  none: { label: 'No restrictions', excludes: [] },
  vegetarian: { label: 'Vegetarian', excludes: ['meat', 'fish'] },
  pescatarian: { label: 'Pescatarian', excludes: ['meat'] },
  vegan: { label: 'Vegan', excludes: ['meat', 'fish', 'dairy', 'egg', 'honey'] },
};

export const ALLERGIES = {
  gluten: 'Gluten',
  dairy: 'Dairy',
  nuts: 'Nuts',
  egg: 'Eggs',
  fish: 'Fish & shellfish',
};

const normalize = (text) =>
  ` ${text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean).map(singular).join(' ')} `;

let recipeCache = null;

// All recipes with their calories/macros worked out by the parser.
export function allRecipes() {
  if (!recipeCache) {
    recipeCache = RECIPES.map((recipe) => {
      const items = parseMeal(recipe.ingredients);
      const foodTags = new Set(items.flatMap((i) => i.tags || []));
      return {
        ...recipe,
        items,
        ...totals(items),
        foodTags,
        searchText: normalize(`${recipe.name} ${recipe.ingredients} ${recipe.tags.join(' ')} ${items.map((i) => i.name).join(' ')}`),
      };
    });
  }
  return recipeCache;
}

export function getRecipe(id) {
  return allRecipes().find((r) => r.id === id);
}

export function matchesKeyword(recipe, keyword) {
  const kw = normalize(keyword).trim();
  return kw.length > 0 && recipe.searchText.includes(` ${kw} `);
}

export function isAllowed(recipe, prefs) {
  const excluded = [...(DIETS[prefs.diet]?.excludes || []), ...(prefs.allergies || [])];
  if (excluded.some((tag) => recipe.foodTags.has(tag))) return false;
  if ((prefs.dislikes || []).some((kw) => matchesKeyword(recipe, kw))) return false;
  if ((prefs.hidden || []).includes(recipe.id)) return false;
  return true;
}

// How many calories the next meal in `slot` should roughly have.
export function slotTarget(slot, { goal, remaining, loggedSlots = [] }) {
  const open = MEALS.filter((m) => m === slot || !loggedSlots.includes(m));
  const shareSum = open.reduce((sum, m) => sum + MEAL_SHARE[m], 0);
  const fromRemaining = remaining * (MEAL_SHARE[slot] / shareSum);
  const target = remaining > 0 ? fromRemaining : 0;
  return Math.round(Math.max(Math.min(target, goal * MEAL_SHARE[slot] * 1.6), 80));
}

// Rank recipes for a meal slot. Returns [{recipe, score, reasons}].
export function recommend({ slot, target, prefs, avoid = [], query = '', limit = 6, jitter = 0 }) {
  const likes = prefs.likes || [];
  const favorites = prefs.favorites || [];
  const results = [];

  for (const recipe of allRecipes()) {
    if (slot && recipe.meal !== slot) continue;
    if (!isAllowed(recipe, prefs)) continue;
    if (query && !query.split(/[\s,]+/).filter(Boolean).every((q) => matchesKeyword(recipe, q) || recipe.name.toLowerCase().includes(q.toLowerCase()))) continue;

    const reasons = [];
    let score = 0;

    if (target) {
      const diff = Math.abs(recipe.kcal - target) / target;
      score += 1 - Math.min(diff, 1.5);
      if (diff <= 0.2) reasons.push(`Fits your ~${target} kcal budget`);
      else if (recipe.kcal < target) reasons.push(`Lighter option, leaves ${target - recipe.kcal} kcal spare`);
      else if (recipe.kcal > target * 1.25) score -= 0.4;
    }

    const liked = likes.filter((kw) => matchesKeyword(recipe, kw));
    if (liked.length) {
      score += 0.45 * Math.min(liked.length, 2);
      reasons.push(`You like ${liked.slice(0, 3).join(' & ')}`);
    }
    if (favorites.includes(recipe.id)) {
      score += 0.6;
      reasons.push('One of your favourites');
    }

    const proteinShare = (recipe.protein * 4) / Math.max(recipe.kcal, 1);
    score += proteinShare * 0.6;
    if (proteinShare >= 0.25 && recipe.protein >= 15) reasons.push(`High protein (${Math.round(recipe.protein)} g)`);

    if (avoid.includes(recipe.id)) score -= 0.8;
    if (jitter) score += Math.random() * jitter;

    results.push({ recipe, score, reasons });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

// Build a varied week plan. Returns {dateKey: {slot: {recipeId}}}.
export function planDays(dateKeys, prefs, goal) {
  const plan = {};
  const used = [];
  for (const key of dateKeys) {
    plan[key] = {};
    for (const slot of MEALS) {
      const target = Math.round(goal * MEAL_SHARE[slot]);
      const [pick] = recommend({ slot, target, prefs, avoid: used.slice(-20), limit: 1, jitter: 0.5 });
      if (pick) {
        plan[key][slot] = { recipeId: pick.recipe.id };
        used.push(pick.recipe.id);
      }
    }
  }
  return plan;
}

// Short, friendly tips for the day.
export function dailyTips({ goal, eaten, burned, remaining, protein, proteinGoal, loggedSlots, hour }) {
  const tips = [];
  if (burned > 0) {
    tips.push(`🔥 You burned ${burned} kcal today — nice work! That's already counted in your budget.`);
  }
  if (remaining < -150) {
    const walk = Math.round(-remaining / 5); // ~5 kcal per minute brisk walking
    tips.push(`You're ${-remaining} kcal over. No stress — a ${walk}-minute walk would roughly even it out, or go lighter tomorrow.`);
  } else if (remaining >= -150 && remaining <= 150 && eaten > 0) {
    tips.push('🎯 Right on target for today.');
  }
  if (eaten > 0 && protein < proteinGoal * 0.5 && hour >= 15) {
    tips.push(`💪 Protein is low so far (${Math.round(protein)} of ~${proteinGoal} g). Try a high-protein option for your next meal.`);
  }
  if (!loggedSlots.includes('breakfast') && hour >= 11 && hour < 15 && eaten === 0) {
    tips.push('Skipped breakfast? Your remaining calories are spread over lunch, dinner and a snack.');
  }
  if (remaining > goal * 0.6 && hour >= 19) {
    tips.push(`You still have ${remaining} kcal left. Eating well under your needs for long periods can backfire — a balanced dinner is fine.`);
  }
  return tips;
}
