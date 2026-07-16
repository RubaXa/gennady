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
});
