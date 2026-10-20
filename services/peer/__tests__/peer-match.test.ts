// @file: Tests for fuzzy peer title matching and Codex title extraction.
// @spec: PEER
// @consumers: N/A

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queryStems, fuzzyTitleScore, bestFuzzyMatch } from '../peer-match.ts';

test('queryStems keeps long words and truncates to five chars', () => {
  assert.deepEqual(queryStems('Проверить растения для гостиной'), [
    'прове',
    'расте',
    'для',
    'гости',
  ]);
});

test('fuzzyTitleScore counts matching stems', () => {
  const title = 'Просмотреть подборку растений Topplant для гостиной Шарики';
  assert.equal(fuzzyTitleScore(title, 'Проверить растения для гостиной'), 3);
});

test('bestFuzzyMatch picks the closest title above threshold', () => {
  const items = [
    { id: '1', title: 'Совсем другая тема' },
    { id: '2', title: 'Просмотреть подборку растений Topplant для гостиной Шарики' },
    { id: '3', title: 'Ревью MR 381' },
  ];
  assert.equal(bestFuzzyMatch(items, 'Проверить растения для гостиной')?.id, '2');
  assert.equal(bestFuzzyMatch(items, 'полностью нерелевантный запрос')?.id, undefined);
});
