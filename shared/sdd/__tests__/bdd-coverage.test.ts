// @file: Unit tests for bdd-coverage — BDD_COVERAGE canonical case-name check.
// @consumers: check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkBddCoverage,
  checkUnparsedCoverageRows,
  extractTestCaseNames,
  findUnparsedCoverageRows,
  parseTestCoverage,
} from '../bdd-coverage.ts';

describe('parseTestCoverage', () => {
  it('парсит обычную строку с одним кейсом', () => {
    const body =
      '- park/resume → `session-lifecycle.test.ts` :: `should resume within TTL, returning true`';
    const rows = parseTestCoverage(body);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0]?.scenario, 'park/resume');
    assert.strictEqual(rows[0]?.testFile, 'session-lifecycle.test.ts');
    assert.deepStrictEqual(rows[0]?.caseNames, ['should resume within TTL, returning true']);
    assert.strictEqual(rows[0]?.deferred, null);
  });

  it('парсит строку с несколькими кейсами и тегом', () => {
    const body =
      '- градация по порогу (per-row) → `decision-journal.test.ts` :: `remains proposal at n=19`, `graduates to auto at n=20`';
    const rows = parseTestCoverage(body);
    assert.strictEqual(rows.length, 1);
    assert.deepStrictEqual(rows[0]?.caseNames, [
      'remains proposal at n=19',
      'graduates to auto at n=20',
    ]);
  });

  it('строка тега [tag] вырезается из имени сценария', () => {
    const body =
      '- executor `[simulation-backed]` → `review-task-executor.integration.test.ts` :: `case name`';
    const rows = parseTestCoverage(body);
    assert.strictEqual(rows[0]?.scenario, 'executor');
  });

  it('Deferred Test Ownership → deferred=Task-ID, не флагуется дальше', () => {
    const body =
      '- Deferred Test Ownership: TSK-183 `[e2e-required]` → `agent-inbox.task-executor.spec.ts` :: `full e2e coverage`.';
    const rows = parseTestCoverage(body);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0]?.deferred, 'TSK-183');
    assert.strictEqual(rows[0]?.testFile, 'agent-inbox.task-executor.spec.ts');
  });

  it('строка без стрелки/кейса игнорируется', () => {
    assert.deepStrictEqual(parseTestCoverage('some unrelated prose'), []);
  });
});

describe('extractTestCaseNames', () => {
  it('находит it() и test() с любыми кавычками', () => {
    const src = `
      describe('suite', () => {
        it('does the thing', () => {});
        test("does another thing", () => {});
        it.skip('skipped case', () => {});
      });
    `;
    assert.deepStrictEqual(extractTestCaseNames(src), [
      'does the thing',
      'does another thing',
      'skipped case',
    ]);
  });

  it('файл без тестов → пустой список', () => {
    assert.deepStrictEqual(extractTestCaseNames('export const x = 1;'), []);
  });
});

describe('checkBddCoverage', () => {
  it('кейс найден в тест-файле → без findings', () => {
    const entries = parseTestCoverage('- scenario → `f.test.ts` :: `does the thing`');
    const map = new Map([['f.test.ts', ['does the thing']]]);
    assert.deepStrictEqual(checkBddCoverage('t.md', entries, map), []);
  });

  it('кейс не найден, flowVersion не передан (дефолт v1) → warn', () => {
    const entries = parseTestCoverage('- scenario → `f.test.ts` :: `missing case`');
    const map = new Map([['f.test.ts', ['does the thing']]]);
    const findings = checkBddCoverage('t.md', entries, map);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_BDD_SCENARIO_UNTESTED');
    assert.strictEqual(findings[0]?.severity, 'warn');
    assert.match(findings[0]?.message ?? '', /missing case/);
  });

  it('кейс не найден, flowVersion=v1 → warn (легаси-тикет, правило появилось позже)', () => {
    const entries = parseTestCoverage('- scenario → `f.test.ts` :: `missing case`');
    const map = new Map([['f.test.ts', ['does the thing']]]);
    const findings = checkBddCoverage('t.md', entries, map, 'v1');
    assert.strictEqual(findings[0]?.severity, 'warn');
  });

  it('кейс не найден, flowVersion=v2 → error (строгость включена вместе с миграцией)', () => {
    const entries = parseTestCoverage('- scenario → `f.test.ts` :: `missing case`');
    const map = new Map([['f.test.ts', ['does the thing']]]);
    const findings = checkBddCoverage('t.md', entries, map, 'v2');
    assert.strictEqual(findings[0]?.severity, 'error');
  });

  it('deferred-строка не проверяется, даже если файл отсутствует', () => {
    const entries = parseTestCoverage(
      '- Deferred Test Ownership: TSK-1 scenario → `future.test.ts` :: `not yet`'
    );
    assert.deepStrictEqual(checkBddCoverage('t.md', entries, new Map(), 'v2'), []);
  });

  it('тест без сценария не флагуется (проверка только в одну сторону)', () => {
    const entries = parseTestCoverage('- scenario → `f.test.ts` :: `does the thing`');
    const map = new Map([['f.test.ts', ['does the thing', 'extra untested-by-ticket case']]]);
    assert.deepStrictEqual(checkBddCoverage('t.md', entries, map, 'v2'), []);
  });

  it('deferred на чужой Task-ID → без findings (реальное делегирование)', () => {
    const entries = parseTestCoverage(
      '- Deferred Test Ownership: TSK-2 scenario → `future.test.ts` :: `not yet`'
    );
    assert.deepStrictEqual(checkBddCoverage('t.md', entries, new Map(), 'v1', 'TSK-1'), []);
  });

  it('checkExistence=false → не проверяет существование кейса, даже если карта пуста', () => {
    const entries = parseTestCoverage('- scenario → `f.test.ts` :: `missing case`');
    const findings = checkBddCoverage('t.md', entries, new Map(), 'v2', null, false);
    assert.deepStrictEqual(findings, []);
  });

  it('checkExistence=false всё равно ловит deferred-на-себя (self-deferral не зависит от existence)', () => {
    const rows = parseTestCoverage(
      '- Deferred Test Ownership: TSK-1 scenario → `future.test.ts` :: `not yet`'
    );
    const findings = checkBddCoverage('t.md', rows, new Map(), 'v1', 'TSK-1', false);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_BDD_DEFERRED_TO_SELF');
  });

  it('deferred на собственный Task-ID → SDD_BDD_DEFERRED_TO_SELF (error), независимо от flowVersion', () => {
    const rows = parseTestCoverage(
      '- Deferred Test Ownership: TSK-1 scenario → `future.test.ts` :: `not yet`'
    );
    const findings = checkBddCoverage('t.md', rows, new Map(), 'v1', 'TSK-1');
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_BDD_DEFERRED_TO_SELF');
    assert.strictEqual(findings[0]?.severity, 'error');
    assert.match(findings[0]?.message ?? '', /TSK-1/);
  });

  it('deferred-to-self severity стабильно error и на v2 (не градуируется по flowVersion)', () => {
    const rows = parseTestCoverage(
      '- Deferred Test Ownership: TSK-1 scenario → `future.test.ts` :: `not yet`'
    );
    const findings = checkBddCoverage('t.md', rows, new Map(), 'v2', 'TSK-1');
    assert.strictEqual(findings[0]?.severity, 'error');
  });

  it('selfTaskId не передан (null) → deferred-строка не флагуется как self-deferral', () => {
    const rows = parseTestCoverage(
      '- Deferred Test Ownership: TSK-1 scenario → `future.test.ts` :: `not yet`'
    );
    assert.deepStrictEqual(checkBddCoverage('t.md', rows, new Map(), 'v1', null), []);
  });
});

describe('findUnparsedCoverageRows / checkUnparsedCoverageRows', () => {
  it('строка-«похожая на ряд» без стрелки/кейса и без Deferred считается unparsed', () => {
    const body = '- All scenarios → Deferred Test Ownership: TSK-34';
    const rows = findUnparsedCoverageRows(body);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0], body.trim());
  });

  it('корректная строка (arrow+case или валидный Deferred) не считается unparsed', () => {
    const body = [
      '- scenario → `f.test.ts` :: `does the thing`',
      '- Deferred Test Ownership: TSK-1 scenario → `future.test.ts` :: `not yet`',
    ].join('\n');
    assert.deepStrictEqual(findUnparsedCoverageRows(body), []);
  });

  it('обычная прозаическая строка без дефиса не считается unparsed-рядом', () => {
    assert.deepStrictEqual(findUnparsedCoverageRows('some unrelated prose'), []);
  });

  it('checkUnparsedCoverageRows возвращает warn SDD_BDD_COVERAGE_ROW_UNPARSED на каждую нераспарсенную строку', () => {
    const body = '- All scenarios → Deferred Test Ownership: TSK-34';
    const findings = checkUnparsedCoverageRows('t.md', body);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_BDD_COVERAGE_ROW_UNPARSED');
    assert.strictEqual(findings[0]?.severity, 'warn');
  });

  it('checkUnparsedCoverageRows на чистой секции → []', () => {
    const body = '- scenario → `f.test.ts` :: `does the thing`';
    assert.deepStrictEqual(checkUnparsedCoverageRows('t.md', body), []);
  });
});
