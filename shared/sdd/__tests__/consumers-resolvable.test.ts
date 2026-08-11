// @file: Unit tests for consumers-resolvable — CONSUMERS_RESOLVABLE classification + resolution check.
// @consumers: check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyConsumerEntry,
  checkConsumersResolvable,
  parseConsumersHeader,
  splitConsumerEntries,
} from '../consumers-resolvable.ts';

describe('splitConsumerEntries', () => {
  it('делит по запятым верхнего уровня, не трогая запятые в скобках', () => {
    const out = splitConsumerEntries(
      'cli/cmd/inbox (debug directive dump, D-124/AI-46), inbox-eval eval-driver.ts'
    );
    assert.deepStrictEqual(out, [
      'cli/cmd/inbox (debug directive dump, D-124/AI-46)',
      'inbox-eval eval-driver.ts',
    ]);
  });
});

describe('classifyConsumerEntry', () => {
  it('простой идентификатор → identifier', () => {
    assert.deepStrictEqual(classifyConsumerEntry('git-core'), {
      raw: 'git-core',
      name: 'git-core',
      external: false,
    });
  });

  it('идентификатор с пояснением в скобках → head без скобок', () => {
    const e = classifyConsumerEntry('compile.ts (buildNodePrompt)');
    assert.strictEqual(e.name, 'compile.ts');
    assert.strictEqual(e.external, false);
  });

  it('описание из нескольких слов → external', () => {
    assert.strictEqual(classifyConsumerEntry('CLI commands').external, true);
  });

  it('литеральное "external" в тексте → external', () => {
    assert.strictEqual(classifyConsumerEntry('external consumers').external, true);
  });

  it('"node:test runner" → external (описание, не идентификатор)', () => {
    assert.strictEqual(classifyConsumerEntry('node:test runner').external, true);
  });
});

describe('parseConsumersHeader', () => {
  it('парсит заголовок целиком', () => {
    assert.deepStrictEqual(parseConsumersHeader('// @consumers: git-core, CLI commands'), [
      'git-core',
      'CLI commands',
    ]);
  });
});

describe('checkConsumersResolvable', () => {
  it('внешние записи никогда не флагуются', () => {
    const entries = [classifyConsumerEntry('node:test runner')];
    assert.deepStrictEqual(checkConsumersResolvable('f.ts', entries, new Set()), []);
  });

  it('идентификатор найден в коде → без findings', () => {
    const entries = [classifyConsumerEntry('git-core')];
    assert.deepStrictEqual(checkConsumersResolvable('f.ts', entries, new Set(['git-core'])), []);
  });

  it('идентификатор не найден → SDD_CONSUMERS_UNRESOLVED (warn)', () => {
    const entries = [classifyConsumerEntry('ghost-consumer')];
    const findings = checkConsumersResolvable('f.ts', entries, new Set());
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_CONSUMERS_UNRESOLVED');
    assert.strictEqual(findings[0]?.severity, 'warn');
    assert.match(findings[0]?.message ?? '', /ghost-consumer/);
  });
});
