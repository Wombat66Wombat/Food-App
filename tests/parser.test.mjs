import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMeal, parseItem, totals } from '../js/parser.js';

const one = (text) => parseItem(text);

test('counts, units and grams', () => {
  assert.equal(one('2 eggs').grams, 100);
  assert.equal(one('150g chicken breast').kcal, 248);
  assert.equal(one('chicken 150g').grams, 150);
  assert.equal(one('1 tbsp peanut butter').grams, 16);
  assert.equal(one('250ml almond milk').name, 'almond milk');
  assert.equal(parseMeal('1,5 kg potatoes')[0].grams, 1500);
});

test('word numbers and fractions', () => {
  assert.equal(one('half an avocado').grams, 75);
  assert.equal(one('½ avocado').grams, 75);
  assert.equal(one('a banana').grams, 118);
  assert.equal(one('1 1/2 cups oat milk').grams, 360);
  assert.equal(one('two glasses of wine').grams, 300);
});

test('longest name wins and plurals match', () => {
  assert.equal(one('sweet potato').name, 'sweet potato');
  assert.equal(one('peanut butter').name, 'peanut butter');
  assert.equal(one('3 pancakes').name, 'pancake');
  assert.equal(one('2 rice cakes').name, 'rice cake');
  assert.equal(one('green beans').name, 'green beans');
});

test('typos are tolerated', () => {
  assert.equal(one('brocoli').name, 'broccoli');
  assert.equal(one('banan').name, 'banana');
});

test('explicit calories override the database', () => {
  const item = one('pizza slice from work 285 kcal');
  assert.equal(item.kcal, 285);
  assert.equal(item.name, 'pizza slice from work');
});

test('unknown food is flagged, not guessed', () => {
  assert.equal(one('mystery stew').matched, false);
});

test('splitting a meal into items', () => {
  const items = parseMeal('2 eggs, 1 slice toast with butter and a coffee');
  assert.deepEqual(items.map((i) => i.name), ['egg', 'bread', 'butter', 'coffee']);
  assert.ok(totals(items).kcal > 250);
});

test('"with milk" is a splash, not a glass', () => {
  const [, milk] = parseMeal('coffee with milk');
  assert.equal(milk.grams, 30);
});

test('names containing "and" are not split', () => {
  assert.deepEqual(parseMeal('fish and chips').map((i) => i.name), ['fish and chips']);
});

test('custom foods are recognised', () => {
  const custom = [{ name: 'mums lasagne', kcal: 650, protein: 30, carbs: 0, fat: 0, unit: 100, unitName: 'serving', aliases: [], tags: [] }];
  assert.equal(parseItem('mums lasagne', custom).kcal, 650);
});
