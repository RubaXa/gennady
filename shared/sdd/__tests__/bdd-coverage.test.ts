// @file: Unit tests for bdd-coverage — BDD_COVERAGE canonical case-name check.
// @spec: SHARED
// @consumers: check

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkBddCoverage,
  checkBddRequirementTraceability,
  checkUnparsedCoverageRows,
  extractTestCaseNames,
  findUnparsedCoverageRows,
  parseTestCoverage,
} from '../bdd-coverage.ts';

describe('checkBddRequirementTraceability', () => {
  const bdd = [
    '**Scenario:** rejects an expired token [`integration`] `[PAY-REQ-17]`',
    '- **Given** an expired token',
    '- **When** payment starts',
    '- **Then** it rejects the request',
  ].join('\n');

  it('Requirement-ID in canonical case name closes the BDD → coverage link', () => {
    const coverage =
      '- rejects an expired token → `payment.test.ts` :: `[PAY-REQ-17] rejects an expired token`';
    assert.deepStrictEqual(checkBddRequirementTraceability('t.md', bdd, coverage), []);
  });

  it('generalized fixture: an arbitrary uncovered Requirement-ID is an error', () => {
    const coverage = '- rejects an expired token → `payment.test.ts` :: `rejects an expired token`';
    const findings = checkBddRequirementTraceability('t.md', bdd, coverage);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_BDD_REQUIREMENT_UNTRACED');
    assert.strictEqual(findings[0]?.severity, 'error');
    assert.match(findings[0]?.message ?? '', /PAY-REQ-17/);
  });

  it('each ID in a multi-requirement scenario needs its own explicit trace', () => {
    const multi = bdd.replace('`[PAY-REQ-17]`', '`[PAY-REQ-17]` `[PAY-REQ-23]`');
    const coverage =
      '- rejects an expired token → `payment.test.ts` :: `[PAY-REQ-17] rejects an expired token`';
    const findings = checkBddRequirementTraceability('t.md', multi, coverage);
    assert.deepStrictEqual(
      findings.map((finding) => finding.message.match(/PAY-REQ-[0-9]+/)?.[0]),
      ['PAY-REQ-23']
    );
  });

  it('missing coverage row cannot silently drop a Requirement-ID', () => {
    const findings = checkBddRequirementTraceability('t.md', bdd, '');
    assert.strictEqual(findings[0]?.code, 'SDD_BDD_REQUIREMENT_UNTRACED');
  });
});

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
      '- Deferred Test Ownership: IE-realeval `[e2e-required]` → `agent-inbox.task-executor.spec.ts` :: `full e2e coverage`.';
    const rows = parseTestCoverage(body);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0]?.deferred, 'IE-realeval');
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
      });
    `;
    assert.deepStrictEqual(extractTestCaseNames(src), ['does the thing', 'does another thing']);
  });

  it('файл без тестов → пустой список', () => {
    assert.deepStrictEqual(extractTestCaseNames('export const x = 1;'), []);
  });

  // B2-22: a .skip/.todo/inactive test proves nothing — it must not be counted as observed, or a
  // scenario claiming that exact case name would be falsely closed by a test that never runs.
  it('B2-22: it.skip(...) не считается observed — не попадает в извлечённые имена', () => {
    const src = `it.skip('skipped case', () => {});\nit('active case', () => {});`;
    assert.deepStrictEqual(extractTestCaseNames(src), ['active case']);
  });

  it('B2-22: test.skip(...) не считается observed', () => {
    const src = `test.skip('skipped via test()', () => {});`;
    assert.deepStrictEqual(extractTestCaseNames(src), []);
  });

  it('B2-22: it.todo(...) не считается observed', () => {
    const src = `it.todo('not yet written');`;
    assert.deepStrictEqual(extractTestCaseNames(src), []);
  });

  it('B2-22: test.todo(...) не считается observed', () => {
    const src = `test.todo('not yet written either');`;
    assert.deepStrictEqual(extractTestCaseNames(src), []);
  });

  it('B2-22: skip anywhere in a modifier chain excludes the case (e.g. .skip.each)', () => {
    const src = `it.skip.each([1, 2])('case %i', () => {});`;
    assert.deepStrictEqual(extractTestCaseNames(src), []);
  });

  it('supported subset: active modifiers other than skip/todo (.only, .concurrent) still count as observed', () => {
    const src = `it.only('focused case', () => {});\ntest.concurrent('parallel case', () => {});`;
    assert.deepStrictEqual(extractTestCaseNames(src), ['focused case', 'parallel case']);
  });

  // B2-24 (V-BATCH-16 B-2): a container modifier (`describe.skip`/`describe.todo`/`suite.skip`) is
  // the same class of inactivity as a leaf `it.skip` — every `it`/`test` nested inside it, at any
  // depth and regardless of its OWN modifiers, must not be "observed" either. Before this fix the
  // extractor only read modifiers on `it`/`test` themselves, so a `describe.skip(...)` block's case
  // names were extracted as if the tests had run.
  it('B2-24: describe.skip(...) — nested it() names are NOT observed even though `it` itself has no modifier', () => {
    const src = `
      describe.skip('DbcContractCheck', () => {
        it('should return no errors for valid content', () => {});
        it('should mutate file on disk when autofix is true', () => {});
      });
    `;
    assert.deepStrictEqual(extractTestCaseNames(src), []);
  });

  it('B2-24: describe.todo(...) — same exclusion as describe.skip', () => {
    const src = `describe.todo('not written yet', () => { it('placeholder case', () => {}); });`;
    assert.deepStrictEqual(extractTestCaseNames(src), []);
  });

  it('B2-24: suite.skip(...) — the mocha-style alias is recognized too', () => {
    const src = `suite.skip('legacy suite', () => { test('legacy case', () => {}); });`;
    assert.deepStrictEqual(extractTestCaseNames(src), []);
  });

  it('B2-24: a sibling describe() (no skip) is unaffected by an unrelated describe.skip() block', () => {
    const src = `
      describe.skip('Skipped', () => { it('skipped case', () => {}); });
      describe('Active', () => { it('active case', () => {}); });
    `;
    assert.deepStrictEqual(extractTestCaseNames(src), ['active case']);
  });

  it('B2-24 both-way: live fixture cli/cmd/lint/__tests__/dbc-contract.check.test.ts — 4 case names, 0 ran', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const path = fileURLToPath(
      new URL('../../../cli/cmd/lint/__tests__/dbc-contract.check.test.ts', import.meta.url)
    );
    const src = readFileSync(path, 'utf-8');
    // Old regex (pre-B2-24, leaf-only modifiers) would report all 4 names as observed — a false
    // closure, since `# tests 0 / # pass 0` is what this file actually runs (it's all describe.skip).
    assert.deepStrictEqual(extractTestCaseNames(src), []);
  });
});

describe('checkBddCoverage', () => {
  it('exact real test name may carry the Requirement-ID contract', () => {
    const entries = parseTestCoverage(
      '- scenario → `f.test.ts` :: `[GAT-REQ-9] rejects invalid input`'
    );
    const map = new Map([['f.test.ts', ['[GAT-REQ-9] rejects invalid input']]]);
    assert.deepStrictEqual(checkBddCoverage('t.md', entries, map, 'v2'), []);
  });
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

  // B2-22 negative fixtures: a scenario claiming a case name that is ONLY a .skip/.todo test in the
  // real file must NOT be closed — extractTestCaseNames already excludes it from caseNamesByFile
  // (see extractTestCaseNames tests above), so checkBddCoverage sees an "absent" case and fails closed.
  describe('B2-22: .skip/.todo test does not close the scenario it is claimed for', () => {
    it('case only exists as it.skip(...) in the test file → SDD_BDD_SCENARIO_UNTESTED (not silently closed)', () => {
      const entries = parseTestCoverage('- scenario → `f.test.ts` :: `only run when fixed`');
      // extractTestCaseNames on a file containing `it.skip('only run when fixed', ...)` yields [] —
      // simulated directly here, since checkBddCoverage takes the already-extracted map.
      const map = new Map([
        ['f.test.ts', extractTestCaseNames("it.skip('only run when fixed', () => {});")],
      ]);
      const findings = checkBddCoverage('t.md', entries, map, 'v1');
      assert.strictEqual(findings.length, 1);
      assert.strictEqual(findings[0]?.code, 'SDD_BDD_SCENARIO_UNTESTED');
      assert.match(findings[0]?.message ?? '', /only run when fixed/);
    });

    it('case only exists as it.todo(...) in the test file → SDD_BDD_SCENARIO_UNTESTED', () => {
      const entries = parseTestCoverage('- scenario → `f.test.ts` :: `write me later`');
      const map = new Map([['f.test.ts', extractTestCaseNames("it.todo('write me later');")]]);
      const findings = checkBddCoverage('t.md', entries, map, 'v2');
      assert.strictEqual(findings.length, 1);
      assert.strictEqual(findings[0]?.code, 'SDD_BDD_SCENARIO_UNTESTED');
      assert.strictEqual(findings[0]?.severity, 'error');
    });

    // Regression guard (NOT an unsatisfiability/Swift test — renamed per V-BATCH-16 B-3/Q1, which
    // found the old name "unsatisfiability guard" misleading: this only proves B2-22's fail-closed
    // tightening doesn't regress an already-satisfied .ts scenario into an unclosable one. The real
    // Swift-unsatisfiability case (`getTestFileIndex` never indexes `.swift` files at all) is locked,
    // honestly labeled, by an integration test in
    // `cli/cmd/sdd-check/__tests__/sdd-check.cmd.test.ts` ("B2-25 lock") — fixing the index itself is
    // out of this batch's zone (board item B2-25).
    it('a correct row naming a real ACTIVE .ts test still closes with zero findings (regression guard, not a Swift test)', () => {
      const entries = parseTestCoverage('- scenario → `f.test.ts` :: `does the real thing`');
      const map = new Map([
        ['f.test.ts', extractTestCaseNames("it('does the real thing', () => {});")],
      ]);
      assert.deepStrictEqual(checkBddCoverage('t.md', entries, map, 'v2'), []);
    });
  });
});

describe('findUnparsedCoverageRows / checkUnparsedCoverageRows', () => {
  it('строка-«похожая на ряд» без стрелки/кейса и без Deferred считается unparsed', () => {
    const body = '- All scenarios → Deferred Test Ownership: UC-tests';
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
    const body = '- All scenarios → Deferred Test Ownership: UC-tests';
    const findings = checkUnparsedCoverageRows('t.md', body);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_BDD_COVERAGE_ROW_UNPARSED');
    assert.strictEqual(findings[0]?.severity, 'warn');
    assert.match(
      findings[0]?.message ?? '',
      /Replace the whole row with either "- <scenario name>.*or "- Deferred Test Ownership: <other-Task-ID> <scenario name>/
    );
  });

  it('checkUnparsedCoverageRows на чистой секции → []', () => {
    const body = '- scenario → `f.test.ts` :: `does the thing`';
    assert.deepStrictEqual(checkUnparsedCoverageRows('t.md', body), []);
  });

  // B2-22: unparseable row → unknown/unverified, graded by flowVersion like checkBddCoverage —
  // NOT a flat warn forever. v1 (today's whole corpus, incl. the 140-row baseline) stays warn, so
  // this introduces zero new errors; v2 (once a scope migrates) fails closed with error.
  it('B2-22: flowVersion не передан (дефолт v1) → warn (совместимо с существующим baseline 140 строк)', () => {
    const findings = checkUnparsedCoverageRows(
      't.md',
      '- All scenarios → Deferred Test Ownership: UC-tests'
    );
    assert.strictEqual(findings[0]?.severity, 'warn');
  });

  it('B2-22: flowVersion=v1 явно → warn (легаси-тикет)', () => {
    const findings = checkUnparsedCoverageRows(
      't.md',
      '- All scenarios → Deferred Test Ownership: UC-tests',
      'v1'
    );
    assert.strictEqual(findings[0]?.severity, 'warn');
  });

  it('B2-22: flowVersion=v2 → error (fail-closed once the scope has migrated — unknown/unverified is not silently accepted)', () => {
    const findings = checkUnparsedCoverageRows(
      't.md',
      '- All scenarios → Deferred Test Ownership: UC-tests',
      'v2'
    );
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_BDD_COVERAGE_ROW_UNPARSED');
    assert.strictEqual(findings[0]?.severity, 'error');
  });
});
