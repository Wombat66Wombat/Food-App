import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state, ui } from '../js/core.js';
import { weekType, eventsFor } from '../js/timetable.js';

test('A/B weeks are off by default', () => {
  assert.equal(weekType('2026-09-29'), null);
});

test('weeks alternate from the anchor Monday, in both directions', () => {
  state.settings.abWeeks = { enabled: true, anchor: '2026-09-28' };
  assert.equal(weekType('2026-09-28'), 'A');
  assert.equal(weekType('2026-10-04'), 'A'); // Sunday of the same week
  assert.equal(weekType('2026-10-05'), 'B');
  assert.equal(weekType('2026-10-12'), 'A');
  assert.equal(weekType('2026-09-21'), 'B');
  assert.equal(weekType('2026-10-26'), 'A'); // 4 weeks later, across the end of daylight saving time
  assert.equal(weekType('2026-11-02'), 'B');
  assert.equal(weekType('2027-03-29'), 'A'); // 26 weeks later, across the start of daylight saving time
});

test('lessons show only in their week', () => {
  state.timetable = [
    { id: '1', day: 0, start: '08:00', end: '09:00', title: 'Maths', weeks: 'A' },
    { id: '2', day: 0, start: '09:00', end: '10:00', title: 'Art', weeks: 'B' },
    { id: '3', day: 0, start: '10:00', end: '11:00', title: 'English', weeks: 'both' },
    { id: '4', day: 0, start: '11:00', end: '12:00', title: 'Old entry' }, // created before A/B existed
  ];
  ui.ttWeek = null;
  assert.deepEqual(eventsFor(0, 'A').map((e) => e.title), ['Maths', 'English', 'Old entry']);
  assert.deepEqual(eventsFor(0, 'B').map((e) => e.title), ['Art', 'English', 'Old entry']);
  assert.equal(eventsFor(0, null).length, 4);
});
