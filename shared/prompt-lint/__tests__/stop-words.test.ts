// @file: Tests for the shared stop-word finder.
// @consumers: node:test runner
// @tasks: TSK-105

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findStopWords } from '../stop-words.ts';

describe('findStopWords', () => {
  it('flags a banned bookish word with position and replacement', () => {
    const hits = findStopWords('Это просто проза, а не текст.');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].word.toLowerCase(), 'проза');
    assert.equal(hits[0].line, 1);
    assert.equal(hits[0].use, 'текст');
  });

  it('flags jargon and calques (докрутить, реифицировать)', () => {
    const hits = findStopWords('Надо докрутить и реифицировать узел.');
    const words = hits.map((h) => h.word.toLowerCase());
    assert.ok(words.some((w) => w.startsWith('докрут')));
    assert.ok(words.some((w) => w.startsWith('реифиц')));
  });

  it('clean plain text → no hits', () => {
    assert.deepEqual(findStopWords('Обычный текст: добавили новое хранилище, есть тесты.'), []);
  });

  it('mention inside inline `code` is skipped (token, not usage)', () => {
    assert.deepEqual(findStopWords('Слово `проза` тут в бэктиках — это упоминание.'), []);
  });

  it('mention inside a ```fenced``` block is skipped', () => {
    const text = ['начало', '```', 'проза внутри кода', '```', 'конец'].join('\n');
    assert.deepEqual(findStopWords(text), []);
  });

  it('mention inside an HTML comment is skipped (guidance, not output)', () => {
    assert.deepEqual(findStopWords('<!-- не проза, а диаграмма -->'), []);
  });

  it('`<!-- stop-ok -->` line opt-out is honored', () => {
    assert.deepEqual(findStopWords('проза здесь допустима <!-- stop-ok -->'), []);
  });

  it('reports correct 1-based line for a hit on a later line', () => {
    const hits = findStopWords('первая строка\nвторая\nтут проза\n');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].line, 3);
  });
});
