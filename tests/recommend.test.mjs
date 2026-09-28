import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allRecipes, recommend, isAllowed, slotTarget, planDays } from '../js/recommend.js';

const prefs = (p = {}) => ({ diet: 'none', allergies: [], likes: [], dislikes: [], favorites: [], hidden: [], ...p });

test('every recipe ingredient is understood by the parser', () => {
  for (const r of allRecipes()) {
    const unknown = r.items.filter((i) => !i.matched).map((i) => i.input);
    assert.deepEqual(unknown, [], `${r.name} has unknown ingredients`);
  }
});

test('diets and allergies filter recipes', () => {
  for (const r of allRecipes().filter((x) => isAllowed(x, prefs({ diet: 'vegan' })))) {
    for (const tag of ['meat', 'fish', 'dairy', 'egg', 'honey']) assert.ok(!r.foodTags.has(tag), `${r.name} is not vegan`);
  }
  for (const r of allRecipes().filter((x) => isAllowed(x, prefs({ allergies: ['nuts'] })))) {
    assert.ok(!r.foodTags.has('nuts'), `${r.name} contains nuts`);
  }
});

test('dislikes are never suggested', () => {
  const recs = recommend({ slot: 'dinner', target: 600, prefs: prefs({ dislikes: ['mushrooms', 'salmon'] }), limit: 50 });
  assert.ok(recs.length > 0);
  assert.ok(recs.every(({ recipe }) => !/mushroom|salmon/i.test(recipe.ingredients)));
});

test('likes are ranked first', () => {
  const [top] = recommend({ slot: 'dinner', target: 600, prefs: prefs({ likes: ['pasta'] }) });
  assert.match(top.recipe.searchText, / pasta /);
  assert.ok(top.reasons.some((r) => r.includes('pasta')));
});

test('slot target follows remaining calories', () => {
  assert.ok(slotTarget('dinner', { goal: 2000, remaining: 600, loggedSlots: ['breakfast', 'lunch', 'snack'] }) === 600);
  assert.ok(slotTarget('snack', { goal: 2000, remaining: 2000, loggedSlots: [] }) < 300);
});

test('week plan fills every slot', () => {
  const keys = ['2026-09-28', '2026-09-29', '2026-09-30'];
  const plan = planDays(keys, prefs(), 2000);
  for (const k of keys) assert.equal(Object.keys(plan[k]).length, 4);
});
