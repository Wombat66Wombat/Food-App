import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../js/core.js';
import { summary, eatingTarget } from '../js/food.js';

test('eating target is maintenance minus the deficit, burned calories do not raise it', () => {
  state.settings.goal = 2000;
  state.settings.deficitPct = 20;
  assert.equal(eatingTarget(), 1600);
  state.days['2026-09-28'] = { entries: [{ kcal: 1500, protein: 0, carbs: 0, fat: 0, meal: 'lunch' }], burned: 500 };
  const s = summary('2026-09-28');
  assert.equal(s.remaining, 100);
  assert.equal(s.deficit, 2000 + 500 - 1500);
  assert.equal(s.deficitGoal, 400);
  assert.equal(s.met, true);
});

test('eating over maintenance misses the goal even with a workout', () => {
  state.days['2026-09-27'] = { entries: [{ kcal: 2600, protein: 0, carbs: 0, fat: 0, meal: 'dinner' }], burned: 300 };
  const s = summary('2026-09-27');
  assert.equal(s.deficit, -300);
  assert.equal(s.met, false);
});

test('a day with no food is not counted as met', () => {
  assert.equal(summary('2026-01-01').met, false);
});

test('training days come from settings or from sports in the timetable', async () => {
  const { isTrainingDay, snackBudget } = await import('../js/food.js');
  state.settings.evening = { sportDays: [0], autoTimetable: true, homeTime: '19:00', snackBudget: null };
  state.timetable = [{ id: 'x', day: 2, start: '17:00', end: '18:30', title: 'Fußball Training', weeks: 'both' }];
  assert.equal(isTrainingDay('2026-09-28'), true); // Monday, set in settings
  assert.equal(isTrainingDay('2026-09-29'), false); // Tuesday
  assert.equal(isTrainingDay('2026-09-30'), true); // Wednesday, "Fußball" in timetable
  assert.ok(snackBudget('2026-09-30') > snackBudget('2026-09-29'));
  state.settings.evening.autoTimetable = false;
  assert.equal(isTrainingDay('2026-09-30'), false);
});
