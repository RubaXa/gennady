// @file: Unit tests for checkSpecLanguage — deterministic anglicism-calque lint (warn-only).
// @consumers: check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkSpecLanguage } from '../check.ts';

describe('checkSpecLanguage', () => {
  it('чистый технический русский → без findings', () => {
    const md = '## Vision\nМодуль проверяет конфиг перед запуском и возвращает подтверждение.';
    assert.deepStrictEqual(checkSpecLanguage('s.md', md), []);
  });

  it('калька ловится: warn с подсказкой, одно finding на слово', () => {
    const md = 'Нужен аппрув оператора. После аппрува можно фиксить и дропнуть старый пайплайн.';
    const findings = checkSpecLanguage('s.md', md);
    const codes = findings.map((f) => f.code);
    assert.ok(codes.every((c) => c === 'SDD_LANGUAGE_CALQUE'));
    assert.strictEqual(findings.length, 4); // аппрув(×2 → одно) + фиксить + дропнуть + пайплайн
    assert.ok(findings.every((f) => f.severity === 'warn'));
    const first = findings.find((f) => f.message.includes('аппрув'));
    assert.ok(first);
    assert.match(first.message, /×2/);
    assert.match(first.message, /подтверждение/);
  });

  it('английские токены/код не задевает', () => {
    const md = 'Status token `[x] DONE`, pipeline in CI (English), `approve()` call.';
    assert.deepStrictEqual(checkSpecLanguage('s.md', md), []);
  });

  it('расширенный список калек (messenger blob 0): гибриды и идиомы ловятся', () => {
    const md =
      'Обработчик фанаутит событие подписчикам, если один зафейлится — не засабмитить остальные. ' +
      'Модуль линкует записи по id, затем мёржит результат. Джоба берёт тулу из соседнего пакета. ' +
      'Логика спрятана под капотом — сначала нужно поднять сервис, ответ сервера лежит на проводе.';
    const findings = checkSpecLanguage('s.md', md);
    const codes = findings.map((f) => f.code);
    assert.ok(codes.every((c) => c === 'SDD_LANGUAGE_CALQUE'));
    const words = [
      'фанаут',
      'зафейл',
      'засабмит',
      'линку',
      'мёрж',
      'джоб',
      'тул',
      'капот',
      'сервис',
      'проводе',
    ];
    for (const w of words) {
      assert.ok(
        findings.some((f) => f.message.toLowerCase().includes(w)),
        `expected a finding mentioning "${w}", got: ${JSON.stringify(findings.map((f) => f.message))}`
      );
    }
  });

  it('прижившиеся англицизмы не задеваются', () => {
    const md =
      'Значение резолвится через промис, чанк уходит в фолбэк, событие эмитит и диспатчит стор.';
    assert.deepStrictEqual(checkSpecLanguage('s.md', md), []);
  });

  it('«тула»-калька не задевает обычные русские слова со схожей подстрокой', () => {
    const md = 'Пользователь встал со стула и поставил чашку на стол.';
    assert.deepStrictEqual(checkSpecLanguage('s.md', md), []);
  });
});
