import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPinyin, gradeCard, INTERVALS } from '../js/mandarin.js';
import { accentFromPixels, onColor } from '../js/theme.js';

test('tone numbers become tone marks', () => {
  assert.equal(toPinyin('ni3 hao3'), 'nǐ hǎo');
  assert.equal(toPinyin('xie4xie5'), 'xièxie');
  assert.equal(toPinyin('lv4'), 'lǜ');
  assert.equal(toPinyin('nu:3 ren2'), 'nǚ rén');
  assert.equal(toPinyin('zhong1 guo2'), 'zhōng guó');
  assert.equal(toPinyin('dou1'), 'dōu');
  assert.equal(toPinyin('gui4'), 'guì');
  assert.equal(toPinyin('Bei3jing1'), 'Běijīng');
  assert.equal(toPinyin('nǐ hǎo'), 'nǐ hǎo');
});

test('spaced repetition moves cards between boxes', () => {
  const card = { box: 0 };
  gradeCard(card, true, '2026-09-29');
  assert.equal(card.box, 1);
  assert.equal(card.due, '2026-09-30');
  gradeCard(card, true, '2026-09-30');
  assert.equal(card.due, '2026-10-02');
  gradeCard(card, false, '2026-10-02');
  assert.equal(card.box, 0);
  assert.equal(card.due, '2026-10-02');
  for (let i = 0; i < 20; i++) gradeCard(card, true, '2026-10-02');
  assert.equal(card.box, INTERVALS.length - 1);
});

test('wallpaper accent picks the dominant colorful tone', () => {
  // 90% blue pixels, 10% grey
  const px = [];
  for (let i = 0; i < 100; i++) px.push(...(i < 90 ? [30, 90, 220, 255] : [128, 128, 128, 255]));
  const { light, dark } = accentFromPixels(new Uint8ClampedArray(px));
  const [r, , b] = [1, 3, 5].map((i) => parseInt(light.slice(i, i + 2), 16));
  assert.ok(b > r, `expected blue, got ${light}`);
  assert.notEqual(light, dark);
});

test('text on accent stays readable', () => {
  assert.equal(onColor('#16a34a'), '#ffffff');
  assert.equal(onColor('#cbd5e1'), '#0b1210');
});
