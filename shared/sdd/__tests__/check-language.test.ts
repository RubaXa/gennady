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
    const md = 'Нужен аппрув оператора. После аппрува можно фиксить и дропнуть старый модуль.';
    const findings = checkSpecLanguage('s.md', md);
    const codes = findings.map((f) => f.code);
    assert.ok(codes.every((c) => c === 'SDD_LANGUAGE_CALQUE'));
    assert.strictEqual(findings.length, 3); // аппрув(×2 → одно) + фиксить + дропнуть
    assert.ok(findings.every((f) => f.severity === 'warn'));
    const first = findings.find((f) => f.message.includes('аппрув'));
    assert.ok(first);
    assert.match(first.message, /×2/);
    assert.match(first.message, /подтверждение/);
  });

  it('устоявшиеся заимствования-существительные («пайплайн», «джоба») не задеваются', () => {
    const md = 'CI-пайплайн запускает джобу, которая собирает артефакт.';
    assert.deepStrictEqual(checkSpecLanguage('s.md', md), []);
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
    // «джоба» перестала быть калькой — устоявшееся заимствование, engineers say it aloud.
    assert.ok(!findings.some((f) => f.message.toLowerCase().includes('джоб')));
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

  it('канцелярит ловится: осуществляется / посредством / производится / имеет место быть', () => {
    const md =
      'Валидация токена осуществляется посредством внешнего провайдера. ' +
      'Сборка артефакта производится в фоне. Иногда имеет место быть повторный запуск.';
    const findings = checkSpecLanguage('s.md', md);
    const codes = findings.map((f) => f.code);
    assert.ok(codes.every((c) => c === 'SDD_LANGUAGE_CALQUE'));
    assert.ok(findings.every((f) => f.message.includes('канцелярит')));
    const words = ['осуществля', 'посредством', 'производ', 'имеет'];
    for (const w of words) {
      assert.ok(
        findings.some((f) => f.message.toLowerCase().includes(w)),
        `expected a finding mentioning "${w}", got: ${JSON.stringify(findings.map((f) => f.message))}`
      );
    }
  });

  it('«является» и «в рамках» не задеваются — слишком частотны в легитимных употреблениях', () => {
    const md = 'Порт является абстракцией. Решение принято в рамках текущей архитектуры.';
    assert.deepStrictEqual(checkSpecLanguage('s.md', md), []);
  });

  it('«производится»-калька не задевает «воспроизводится» (баг воспроизводится стабильно)', () => {
    const md = 'Баг воспроизводится стабильно на втором запуске.';
    assert.deepStrictEqual(checkSpecLanguage('s.md', md), []);
  });
});
