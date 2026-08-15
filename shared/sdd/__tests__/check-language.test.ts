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

  it('калька ловится: warn с подсказкой, одно finding на вхождение (не на слово)', () => {
    const md = 'Нужен аппрув оператора. После аппрува можно фиксить и дропнуть старый модуль.';
    const findings = checkSpecLanguage('s.md', md);
    const codes = findings.map((f) => f.code);
    assert.ok(codes.every((c) => c === 'SDD_LANGUAGE_CALQUE'));
    // аппрув × 2 (по одному finding на каждое вхождение) + фиксить + дропнуть
    assert.strictEqual(findings.length, 4);
    assert.ok(findings.every((f) => f.severity === 'warn'));
    const approves = findings.filter((f) => /^«аппрув/.test(f.message));
    assert.strictEqual(approves.length, 2);
    assert.match(approves[0].message, /подтверждение/);
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
    assert.ok(!findings.some((f) => /^«[^»]*джоб/i.test(f.message)));
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

  describe('location: line + enclosing-sentence quote', () => {
    it('обычный текст — line указывает на строку вхождения, цитата — на целое предложение', () => {
      const md = [
        '## Vision',
        '',
        'Модуль стабилен. Нужно дропнуть старый конфиг перед релизом. Дальше всё чисто.',
      ].join('\n');
      const findings = checkSpecLanguage('s.md', md);
      const drop = findings.find((f) => f.message.includes('дроп'));
      assert.ok(drop);
      assert.strictEqual(drop.line, 3);
      assert.match(drop.message, /предложение: «Нужно дропнуть старый конфиг перед релизом\.»/);
      // соседние предложения на той же строке не просочились в цитату
      assert.ok(!drop.message.includes('Модуль стабилен'));
      assert.ok(!drop.message.includes('Дальше всё чисто'));
    });

    it('таблица — цитата ограничена ячейкой (между `|`), не всей строкой', () => {
      const md = '| Task-ID | Note |\n|---|---|\n| t-1 | нужно дропнуть старое поле | ok |';
      const findings = checkSpecLanguage('s.md', md);
      const drop = findings.find((f) => f.message.includes('дроп'));
      assert.ok(drop);
      assert.strictEqual(drop.line, 3);
      assert.match(drop.message, /предложение: «нужно дропнуть старое поле»/);
      assert.ok(!drop.message.includes('Task-ID'));
      assert.ok(!drop.message.includes('ok'));
    });

    it('многострочный документ — цитата не пересекает границу строки, даже без точки в конце', () => {
      const md = [
        'Первая строка без калек тут длинная и без точки в конце',
        'Нужно зафиксить баг',
        'Третья строка тоже без калек и без точки',
      ].join('\n');
      const findings = checkSpecLanguage('s.md', md);
      const fix = findings.find((f) => f.message.includes('фиксить'));
      assert.ok(fix);
      assert.strictEqual(fix.line, 2);
      assert.match(fix.message, /предложение: «Нужно зафиксить баг»/);
      assert.ok(!fix.message.includes('Первая строка'));
      assert.ok(!fix.message.includes('Третья строка'));
    });

    it('формат строки находки: file:line: warn: SDD_LANGUAGE_CALQUE «калька» → подсказка | предложение: «цитата»', () => {
      const md = 'Нужен аппрув оператора.';
      const findings = checkSpecLanguage('s.md', md);
      const [f] = findings;
      const line = `${f.file}:${f.line}: ${f.severity}: ${f.code}  ${f.message}`;
      assert.strictEqual(
        line,
        's.md:1: warn: SDD_LANGUAGE_CALQUE  «аппрув» → подтверждение | предложение: «Нужен аппрув оператора.»'
      );
    });
  });
});
