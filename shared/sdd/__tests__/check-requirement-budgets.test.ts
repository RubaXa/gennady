// @file: Unit tests for lazy requirement-list review and atomic entry size budgets.
// @consumers: SddCheckCommand
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkRequirementBudgetsAgainstBaseline,
  REQUIREMENT_ENTRY_MAX_LINES,
} from '../requirement-budget.ts';

const DEFAULT_BUDGET = 20;

const spec = (entries: string[], approval = ''): string =>
  [
    '<!--SECTION:REQUIREMENTS_AND_CONSTRAINTS-->',
    '## Requirements & Constraints',
    approval,
    ...entries,
    '<!--/SECTION:REQUIREMENTS_AND_CONSTRAINTS-->',
  ].join('\n');

const moduleSpec = (entries: string[], approval = ''): string =>
  [
    '<!--SECTION:MODULE_REQUIREMENTS-->',
    '## Module Requirements',
    approval,
    ...entries,
    '<!--/SECTION:MODULE_REQUIREMENTS-->',
  ].join('\n');

const requirement = (n: number, body: string[] = ['**Когда** X, **сервис должен** Y.']): string =>
  [`### DEM-REQ-${n} [должен]`, ...body].join('\n');

const checkNewRequirementBudgets = (file: string, content: string) =>
  checkRequirementBudgetsAgainstBaseline(file, content, null);

describe('checkRequirementBudgetsAgainstBaseline', () => {
  it('stays silent at the default list budget', () => {
    const entries = Array.from({ length: DEFAULT_BUDGET }, (_, i) => requirement(i + 1));
    assert.deepStrictEqual(
      checkNewRequirementBudgets('specs/demo/demo.spec.md', spec(entries)),
      []
    );
  });

  it('asks for compression or an exact operator approval only after the list exceeds the budget', () => {
    const entries = Array.from({ length: DEFAULT_BUDGET + 1 }, (_, i) => requirement(i + 1));
    const findings = checkNewRequirementBudgets('specs/demo/demo.spec.md', spec(entries));
    assert.deepStrictEqual(
      findings.map((f) => f.code),
      ['SDD_REQUIREMENTS_BUDGET_EXCEEDED']
    );
    assert.match(findings[0]?.message ?? '', /review the list for duplicates/);
    assert.match(findings[0]?.message ?? '', /operator-approved/);
  });

  it('accepts an exact persisted operator-approved increase', () => {
    const entries = Array.from({ length: DEFAULT_BUDGET + 1 }, (_, i) => requirement(i + 1));
    const content = spec(
      entries,
      `**Requirements budget:** ${entries.length} · operator-approved: 2026-08-27`
    );
    assert.deepStrictEqual(checkNewRequirementBudgets('specs/demo/demo.spec.md', content), []);
  });

  it('applies the same list and entry budgets to module Requirements', () => {
    const entries = Array.from({ length: DEFAULT_BUDGET + 1 }, (_, i) => requirement(i + 1));
    assert.deepStrictEqual(
      checkNewRequirementBudgets('specs/demo/module.spec.md', moduleSpec(entries)).map(
        (finding) => finding.code
      ),
      ['SDD_REQUIREMENTS_BUDGET_EXCEEDED']
    );
  });

  it('does not let an approval marker lower the default budget', () => {
    const entries = Array.from({ length: 15 }, (_, i) => requirement(i + 1));
    const content = spec([
      '**Requirements budget:** 10 · operator-approved: 2026-08-27',
      ...entries,
    ]);
    assert.deepStrictEqual(
      checkNewRequirementBudgets('specs/demo/demo.spec.md', content).map((finding) => finding.code),
      ['SDD_REQUIREMENTS_BUDGET_APPROVAL_INVALID']
    );
  });

  it('rejects duplicate approvals even when both authorize the same cap', () => {
    const entries = Array.from({ length: DEFAULT_BUDGET + 1 }, (_, i) => requirement(i + 1));
    const marker = `**Requirements budget:** ${entries.length} · operator-approved: 2026-08-27`;
    const findings = checkNewRequirementBudgets(
      'specs/demo/demo.spec.md',
      spec(entries, `${marker}\n${marker}`)
    );
    assert.deepStrictEqual(
      findings.map((finding) => finding.code),
      ['SDD_REQUIREMENTS_BUDGET_APPROVAL_INVALID', 'SDD_REQUIREMENTS_BUDGET_EXCEEDED']
    );
  });

  it('rejects conflicting structured approvals and points at the second absolute line', () => {
    const content = [
      '# Demo',
      'intro',
      '<!--SECTION:REQUIREMENTS_AND_CONSTRAINTS-->',
      '## Requirements & Constraints',
      '**Requirements budget:** 21 · operator-approved: 2026-08-27',
      '**Requirements budget:** 22 · operator-approved: 2026-08-28',
      '<!--/SECTION:REQUIREMENTS_AND_CONSTRAINTS-->',
    ].join('\n');
    const finding = checkNewRequirementBudgets('specs/demo/demo.spec.md', content)[0];
    assert.strictEqual(finding?.code, 'SDD_REQUIREMENTS_BUDGET_APPROVAL_INVALID');
    assert.strictEqual(finding?.line, 6);
  });

  it('does not treat ordinary prose beside valid evidence as a conflicting approval', () => {
    const entries = Array.from({ length: DEFAULT_BUDGET + 1 }, (_, i) => requirement(i + 1));
    const content = spec(
      entries,
      `**Requirements budget:** ${entries.length} · operator-approved: 2026-08-27\nRequirements budget approved by operator`
    );
    assert.deepStrictEqual(checkNewRequirementBudgets('specs/demo/demo.spec.md', content), []);
  });

  it('rejects malformed evidence and impossible calendar dates', () => {
    const malformed = spec([], '**Requirements budget:** 21 operator-approved: 2026-08-27');
    const impossible = spec([], '**Requirements budget:** 21 · operator-approved: 2026-02-31');
    assert.deepStrictEqual(
      checkNewRequirementBudgets('specs/demo/demo.spec.md', malformed).map((f) => f.code),
      ['SDD_REQUIREMENTS_BUDGET_APPROVAL_INVALID']
    );
    assert.deepStrictEqual(
      checkNewRequirementBudgets('specs/demo/demo.spec.md', impossible).map((f) => f.code),
      ['SDD_REQUIREMENTS_BUDGET_APPROVAL_INVALID']
    );
  });

  it('accepts canonical approval evidence with leading whitespace', () => {
    const entries = Array.from({ length: DEFAULT_BUDGET + 1 }, (_, i) => requirement(i + 1));
    const content = spec(
      entries,
      `  **Requirements budget:** ${entries.length} · operator-approved: 2026-08-27`
    );
    assert.deepStrictEqual(checkNewRequirementBudgets('specs/demo/demo.spec.md', content), []);
  });

  it('reports the absolute file line of malformed structured approval evidence', () => {
    const content = [
      '# Demo',
      'intro',
      '<!--SECTION:REQUIREMENTS_AND_CONSTRAINTS-->',
      '## Requirements & Constraints',
      'context',
      '  **Requirements budget:** 21 operator-approved: 2026-08-27',
      '<!--/SECTION:REQUIREMENTS_AND_CONSTRAINTS-->',
    ].join('\n');
    const finding = checkNewRequirementBudgets('specs/demo/demo.spec.md', content)[0];
    assert.strictEqual(finding?.code, 'SDD_REQUIREMENTS_BUDGET_APPROVAL_INVALID');
    assert.strictEqual(finding?.line, 6);
  });

  it('does not allow an approval to lower a previously authorized cap', () => {
    const entries = Array.from({ length: 22 }, (_, i) => requirement(i + 1));
    const baseline = spec(entries, '**Requirements budget:** 24 · operator-approved: 2026-08-26');
    const changed = spec(entries, '**Requirements budget:** 22 · operator-approved: 2026-08-27');
    assert.deepStrictEqual(
      checkRequirementBudgetsAgainstBaseline('specs/demo/demo.spec.md', changed, baseline).map(
        (finding) => finding.code
      ),
      ['SDD_REQUIREMENTS_BUDGET_APPROVAL_INVALID', 'SDD_REQUIREMENTS_BUDGET_EXCEEDED']
    );
  });

  it('does not silently retain a removed approval from HEAD', () => {
    const entries = Array.from({ length: 22 }, (_, i) => requirement(i + 1));
    const baseline = spec(entries, '**Requirements budget:** 22 · operator-approved: 2026-08-26');
    assert.deepStrictEqual(
      checkRequirementBudgetsAgainstBaseline(
        'specs/demo/demo.spec.md',
        spec(entries),
        baseline
      ).map((finding) => finding.code),
      ['SDD_REQUIREMENTS_BUDGET_EXCEEDED']
    );
  });

  it('rejects one narrative requirement past the atomic non-empty-line budget', () => {
    const body = Array.from(
      { length: REQUIREMENT_ENTRY_MAX_LINES + 1 },
      (_, i) => `detail ${i + 1}`
    );
    const findings = checkNewRequirementBudgets(
      'specs/demo/demo.spec.md',
      spec([requirement(1, body)])
    );
    assert.deepStrictEqual(
      findings.map((f) => f.code),
      ['SDD_REQUIREMENT_ENTRY_TOO_LONG']
    );
    assert.match(findings[0]?.message ?? '', /move implementation\/contract detail/);
  });

  it('accepts exactly 10 non-empty body lines and rejects 11', () => {
    const atLimit = Array.from({ length: 10 }, (_, i) => `detail ${i + 1}`);
    const overLimit = [...atLimit, 'detail 11'];
    assert.deepStrictEqual(
      checkNewRequirementBudgets('specs/demo/demo.spec.md', spec([requirement(1, atLimit)])),
      []
    );
    assert.deepStrictEqual(
      checkNewRequirementBudgets('specs/demo/demo.spec.md', spec([requirement(1, overLimit)])).map(
        (finding) => finding.code
      ),
      ['SDD_REQUIREMENT_ENTRY_TOO_LONG']
    );
  });

  it('counts ordinary prose, headings, links, and fenced examples containing Requirements budget', () => {
    const body = [
      '#### Requirements budget notes',
      '[Requirements budget](#requirements-budget)',
      '```md',
      '**Requirements budget:** 99 · operator-approved: 2026-08-27',
      '```',
      ...Array.from({ length: 6 }, (_, i) => `detail ${i + 1}`),
    ];
    const findings = checkNewRequirementBudgets(
      'specs/demo/demo.spec.md',
      spec([requirement(1, body)])
    );
    assert.deepStrictEqual(
      findings.map((finding) => finding.code),
      ['SDD_REQUIREMENT_ENTRY_TOO_LONG']
    );
    assert.doesNotMatch(findings[0]?.message ?? '', /approval/i);
  });

  it('does not let a nested ### heading terminate the requirement entry', () => {
    const body = [
      ...Array.from({ length: 5 }, (_, i) => `before ${i + 1}`),
      '### Details',
      ...Array.from({ length: 5 }, (_, i) => `after ${i + 1}`),
    ];
    assert.deepStrictEqual(
      checkNewRequirementBudgets('specs/demo/demo.spec.md', spec([requirement(1, body)])).map(
        (finding) => finding.code
      ),
      ['SDD_REQUIREMENT_ENTRY_TOO_LONG']
    );
  });

  it('does not let a fenced canonical-looking heading split or hide the entry body', () => {
    const body = [
      ...Array.from({ length: 4 }, (_, i) => `before ${i + 1}`),
      '```md',
      '### DEM-REQ-2 [должен]',
      ...Array.from({ length: 4 }, (_, i) => `example ${i + 1}`),
      '```',
    ];
    assert.deepStrictEqual(
      checkNewRequirementBudgets('specs/demo/demo.spec.md', spec([requirement(1, body)])).map(
        (finding) => finding.code
      ),
      ['SDD_REQUIREMENT_ENTRY_TOO_LONG']
    );
  });

  it('counts tables and worked examples as body without splitting the entry', () => {
    const body = [
      '| Case | Result |',
      '| --- | --- |',
      '| A | B |',
      '#### Worked example',
      ...Array.from({ length: 7 }, (_, i) => `example ${i + 1}`),
    ];
    assert.deepStrictEqual(
      checkNewRequirementBudgets('specs/demo/demo.spec.md', spec([requirement(1, body)])).map(
        (finding) => finding.code
      ),
      ['SDD_REQUIREMENT_ENTRY_TOO_LONG']
    );
  });

  it('reports the real file-relative heading line', () => {
    const content = [
      '# Demo',
      'intro',
      '<!--SECTION:REQUIREMENTS_AND_CONSTRAINTS-->',
      '## Requirements & Constraints',
      '',
      requirement(
        1,
        Array.from({ length: 11 }, (_, i) => `detail ${i + 1}`)
      ),
      '<!--/SECTION:REQUIREMENTS_AND_CONSTRAINTS-->',
    ].join('\n');
    const finding = checkNewRequirementBudgets('specs/demo/demo.spec.md', content)[0];
    assert.strictEqual(finding?.line, 6);
  });

  it('reports the real first-entry line for a list-budget finding', () => {
    const entries = Array.from({ length: DEFAULT_BUDGET + 1 }, (_, i) => requirement(i + 1));
    const content = ['# Demo', 'intro', '', spec(entries)].join('\n');
    const finding = checkNewRequirementBudgets('specs/demo/demo.spec.md', content)[0];
    assert.strictEqual(finding?.line, 7);
  });

  it('ignores blank lines when measuring one requirement body', () => {
    const body = Array.from(
      { length: REQUIREMENT_ENTRY_MAX_LINES },
      (_, i) => `detail ${i + 1}`
    ).flatMap((line) => [line, '']);
    assert.deepStrictEqual(
      checkNewRequirementBudgets('specs/demo/demo.spec.md', spec([requirement(1, body)])),
      []
    );
  });

  it('stays dormant for a legacy split Requirements section', () => {
    const content = spec(['### Functional Requirements', ...Array(30).fill('- legacy')]);
    assert.deepStrictEqual(checkNewRequirementBudgets('specs/demo/demo.spec.md', content), []);
  });

  it('does not retroactively reject unchanged legacy security/observability tables', () => {
    const content = spec([
      '### Security',
      '| Boundary | Rule |',
      '| --- | --- |',
      '| HTTP | validate |',
      '### Observability',
      '| Signal | Threshold |',
      '| --- | --- |',
      '| Errors | 1% |',
    ]);
    assert.deepStrictEqual(
      checkRequirementBudgetsAgainstBaseline('specs/demo/demo.spec.md', content, content),
      []
    );
  });

  it('does not let a legacy topic heading hide body lines after a flat requirement starts', () => {
    const body = [
      '**Когда** X, **сервис должен** Y.',
      '### Security',
      ...Array.from({ length: REQUIREMENT_ENTRY_MAX_LINES }, (_, i) => `security detail ${i + 1}`),
    ];
    assert.deepStrictEqual(
      checkNewRequirementBudgets('specs/demo/demo.spec.md', spec([requirement(1, body)])).map(
        (finding) => finding.code
      ),
      ['SDD_REQUIREMENT_ENTRY_TOO_LONG']
    );
  });

  it('grandfathers an unchanged oversized HEAD entry and list', () => {
    const entries = Array.from({ length: DEFAULT_BUDGET + 1 }, (_, i) =>
      requirement(
        i + 1,
        i === 0 ? Array.from({ length: 11 }, (_, line) => `detail ${line + 1}`) : undefined
      )
    );
    const content = spec(entries);
    assert.deepStrictEqual(
      checkRequirementBudgetsAgainstBaseline('specs/demo/demo.spec.md', content, content),
      []
    );
  });

  it('keeps ordinary Requirements budget prose in baseline-lazy body identity', () => {
    const baseline = spec([
      requirement(1, [
        ...Array.from({ length: 10 }, (_, line) => `detail ${line + 1}`),
        'Requirements budget is a planning concept, not approval evidence.',
      ]),
    ]);
    assert.deepStrictEqual(
      checkRequirementBudgetsAgainstBaseline('specs/demo/demo.spec.md', baseline, baseline),
      []
    );

    const changed = baseline.replace(
      'Requirements budget is a planning concept, not approval evidence.',
      'Requirements budget wording changed and must remain part of body identity.'
    );
    assert.deepStrictEqual(
      checkRequirementBudgetsAgainstBaseline('specs/demo/demo.spec.md', changed, baseline).map(
        (finding) => finding.code
      ),
      ['SDD_REQUIREMENT_ENTRY_TOO_LONG']
    );
  });

  it('checks an edited oversized HEAD entry and an edited over-budget list', () => {
    const baselineEntries = Array.from({ length: DEFAULT_BUDGET + 1 }, (_, i) =>
      requirement(
        i + 1,
        i === 0 ? Array.from({ length: 11 }, (_, line) => `detail ${line + 1}`) : undefined
      )
    );
    const baseline = spec(baselineEntries);
    const changed = spec([
      requirement(1, [
        ...Array.from({ length: 10 }, (_, line) => `detail ${line + 1}`),
        'changed detail',
      ]),
      ...baselineEntries.slice(1),
    ]);
    assert.deepStrictEqual(
      checkRequirementBudgetsAgainstBaseline('specs/demo/demo.spec.md', changed, baseline).map(
        (finding) => finding.code
      ),
      ['SDD_REQUIREMENTS_BUDGET_EXCEEDED', 'SDD_REQUIREMENT_ENTRY_TOO_LONG']
    );
  });

  it('checks a new oversized entry when no HEAD baseline exists', () => {
    const content = spec([
      requirement(
        1,
        Array.from({ length: 11 }, (_, line) => `detail ${line + 1}`)
      ),
    ]);
    assert.deepStrictEqual(
      checkRequirementBudgetsAgainstBaseline('specs/demo/demo.spec.md', content, null).map(
        (finding) => finding.code
      ),
      ['SDD_REQUIREMENT_ENTRY_TOO_LONG']
    );
  });

  it('ignores an operator approval marker inside a fenced example', () => {
    const entries = Array.from({ length: DEFAULT_BUDGET + 1 }, (_, i) => requirement(i + 1));
    const content = spec(
      entries,
      [
        '```md',
        `**Requirements budget:** ${entries.length} · operator-approved: 2026-08-27`,
        '```',
      ].join('\n')
    );
    assert.deepStrictEqual(
      checkNewRequirementBudgets('specs/demo/demo.spec.md', content).map((finding) => finding.code),
      ['SDD_REQUIREMENTS_BUDGET_EXCEEDED']
    );
  });

  it('keeps a tilde fence open across shorter and different-marker pseudo-closers', () => {
    const entries = Array.from({ length: DEFAULT_BUDGET + 1 }, (_, i) => requirement(i + 1));
    const content = spec(
      entries,
      [
        '~~~~md',
        '~~~',
        '```',
        `**Requirements budget:** ${entries.length} · operator-approved: 2026-08-27`,
        '~~~~',
      ].join('\n')
    );
    assert.deepStrictEqual(
      checkNewRequirementBudgets('specs/demo/demo.spec.md', content).map((finding) => finding.code),
      ['SDD_REQUIREMENTS_BUDGET_EXCEEDED']
    );
  });
});
