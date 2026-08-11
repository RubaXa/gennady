// @file: Unit tests for rules-cascade — RULES_CASCADE_CLOSURE transitive-closure check.
// @consumers: check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkRulesCascadeClosure,
  normalizeRulePath,
  parseRuleDependsOn,
} from '../rules-cascade.ts';

describe('parseRuleDependsOn', () => {
  it('парсит bullet-список путей из <DependsOn>', () => {
    const xml = `
      <DependsOn>
        - ai/directives/coding/typescript-rules.xml
        - ai/directives/testing/vitest-rules.xml
      </DependsOn>
    `;
    assert.deepStrictEqual(parseRuleDependsOn(xml), [
      'ai/directives/coding/typescript-rules.xml',
      'ai/directives/testing/vitest-rules.xml',
    ]);
  });

  it('нет <DependsOn> → пустой список', () => {
    assert.deepStrictEqual(parseRuleDependsOn('<Mission>text</Mission>'), []);
  });
});

describe('normalizeRulePath', () => {
  it('приводит относительную ссылку тикета к пути от корня репо', () => {
    const result = normalizeRulePath(
      '/repo/tasks/agent-inbox/agent-inbox.task-160.md',
      '/repo',
      '../../ai/directives/coding/typescript-rules.xml'
    );
    assert.strictEqual(result, 'ai/directives/coding/typescript-rules.xml');
  });
});

describe('checkRulesCascadeClosure', () => {
  it('замыкание полное → без findings', () => {
    const deps = new Map([
      [
        'ai/directives/testing/svelte-testing.xml',
        ['ai/directives/testing/vitest-rules.xml', 'ai/directives/coding/svelte5-runes.xml'],
      ],
      ['ai/directives/testing/vitest-rules.xml', []],
      ['ai/directives/coding/svelte5-runes.xml', ['ai/directives/coding/typescript-rules.xml']],
      ['ai/directives/coding/typescript-rules.xml', []],
    ]);
    const rules = [
      'ai/directives/testing/svelte-testing.xml',
      'ai/directives/testing/vitest-rules.xml',
      'ai/directives/coding/svelte5-runes.xml',
      'ai/directives/coding/typescript-rules.xml',
    ];
    assert.deepStrictEqual(checkRulesCascadeClosure('t.md', 'P1', rules, deps), []);
  });

  it('пропущена прямая зависимость → SDD_RULES_CASCADE_UNRESOLVED', () => {
    const deps = new Map([
      ['ai/directives/testing/svelte-testing.xml', ['ai/directives/coding/svelte5-runes.xml']],
      ['ai/directives/coding/svelte5-runes.xml', []],
    ]);
    const rules = ['ai/directives/testing/svelte-testing.xml'];
    const findings = checkRulesCascadeClosure('t.md', 'P1', rules, deps);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_RULES_CASCADE_UNRESOLVED');
    assert.strictEqual(findings[0]?.severity, 'error');
    assert.match(findings[0]?.message ?? '', /svelte5-runes\.xml/);
  });

  it('пропущена транзитивная (второй уровень) зависимость → находка', () => {
    const deps = new Map([
      ['ai/directives/testing/svelte-testing.xml', ['ai/directives/coding/svelte5-runes.xml']],
      ['ai/directives/coding/svelte5-runes.xml', ['ai/directives/coding/typescript-rules.xml']],
      ['ai/directives/coding/typescript-rules.xml', []],
    ]);
    const rules = [
      'ai/directives/testing/svelte-testing.xml',
      'ai/directives/coding/svelte5-runes.xml',
    ];
    const findings = checkRulesCascadeClosure('t.md', 'P2', rules, deps);
    assert.strictEqual(findings.length, 1);
    assert.match(findings[0]?.message ?? '', /typescript-rules\.xml/);
  });

  it('пустой список правил → без findings', () => {
    assert.deepStrictEqual(checkRulesCascadeClosure('t.md', 'P1', [], new Map()), []);
  });
});
