// @file: Contract tests for path-aware task authoring literals.
// @consumers: test runner
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  DEFERRED_TEST_OWNERSHIP_LITERAL,
  loadRuleRegistry,
  parseRuleRegistry,
  renderTaskAuthoringLiterals,
} from '../task-authoring-literals.ts';
import { parseTestCoverage } from '../bdd-coverage.ts';
import { parseMetaInfo, parsePhaseDetail } from '../ticket.ts';

describe('task authoring literals', () => {
  it('derives scope-ticket links without guessing or a double slash', () => {
    const text = renderTaskAuthoringLiterals(
      'specs/shop/shop.task.SHP-boot.md',
      'specs/shop/shop.spec.md',
      [{ id: 'testing-common', file: 'ai/directives/testing/common.xml' }]
    );
    assert.match(text, /owning-spec: \[Owning spec\]\(\.\/shop\.spec\.md\)/);
    assert.match(text, /contract-anchors:\n    - none \(owning spec has no typed/);
    assert.match(text, /\[testing-common\]\(\.\.\/\.\.\/ai\/directives\/testing\/common\.xml\)/);
    assert.doesNotMatch(text, /\/\//);
  });

  it('derives nested module-ticket links from the actual ticket directory', () => {
    const text = renderTaskAuthoringLiterals(
      'specs/shop/payments/cards/cards.task.PAY-add.md',
      'specs/shop/payments/cards/cards.spec.md',
      [{ id: 'typescript-rules', file: 'ai/directives/coding/typescript-rules.xml' }]
    );
    assert.match(text, /owning-spec: \[Owning spec\]\(\.\/cards\.spec\.md\)/);
    assert.match(text, /\.\.\/\.\.\/\.\.\/\.\.\/ai\/directives\/coding/);
  });

  it('emits typed contract headings as copy-ready canonical anchors, including details blocks', () => {
    const spec = [
      '<details>',
      '<summary>Contracts</summary>',
      '',
      '#### Port: `TodoStore`',
      'contract body',
      '</details>',
      '',
      '```md',
      '#### Service: FakeExample',
      '```',
    ].join('\n');
    const text = renderTaskAuthoringLiterals(
      'specs/todo/storage/storage.task.TDO-store.md',
      'specs/todo/storage/storage.spec.md',
      [],
      spec
    );
    assert.match(text, /\[Port: TodoStore\]\(\.\/storage\.spec\.md#port-todostore\)/);
    assert.doesNotMatch(text, /FakeExample/);
    assert.equal(text.match(/#port-todostore/g)?.length, 1);
  });

  it('fails closed when two typed contract headings resolve to the same slug', () => {
    assert.throws(
      () =>
        renderTaskAuthoringLiterals(
          'specs/todo/storage/storage.task.TDO-store.md',
          'specs/todo/storage/storage.spec.md',
          [],
          '#### Port: `TodoStore`\nA\n#### Port: TodoStore\nB'
        ),
      /duplicate contract heading slug '#port-todostore'/
    );
  });

  it('takes testing-common from the registry and never invents common', () => {
    const entries = parseRuleRegistry(
      '<Rules><Rule id="testing-common"><File>ai/directives/testing/common.xml</File></Rule></Rules>'
    );
    assert.deepStrictEqual(entries, [
      { id: 'testing-common', file: 'ai/directives/testing/common.xml' },
    ]);
    assert.equal(
      entries.some((entry) => entry.id === 'common'),
      false
    );
    assert.throws(() => parseRuleRegistry('<Rules></Rules>'), /no complete/);
  });

  it('prints a complete Deferred Test Ownership literal accepted by the parser', () => {
    const concrete = DEFERRED_TEST_OWNERSHIP_LITERAL.replace('<other-Task-ID>', 'PAY-e2e')
      .replace('<scenario name>', 'saved card checkout')
      .replace('<future-test-file>', 'checkout.e2e.test.ts')
      .replace('<canonical case name>', 'checks out with a saved card');
    const parsed = parseTestCoverage(concrete);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0]?.deferred, 'PAY-e2e');
  });

  it('prints Markdown literals accepted by ticket Meta and phase parsers', () => {
    const text = renderTaskAuthoringLiterals(
      'specs/shop/checkout/checkout.task.SHP-pay.md',
      'specs/shop/checkout/checkout.spec.md',
      [{ id: 'testing-common', file: 'ai/directives/testing/common.xml' }]
    );
    const owning = text.match(/owning-spec: (\[[^\n]+\]\([^\n]+\))/)?.[1] as string;
    const rule = text.match(/    - (\[testing-common\]\([^\n]+\))/)?.[1] as string;
    assert.equal(
      parseMetaInfo(`- **Spec References:**\n  - Constraints: ${owning}`).specRefs[0]?.anchor,
      './checkout.spec.md'
    );
    assert.deepStrictEqual(parsePhaseDetail(`- **Rules:**\n  - ${rule}`).rules, [
      '../../../ai/directives/testing/common.xml',
    ]);
  });

  it('prints one copy-ready empty Rules literal instead of making the author invent syntax', () => {
    const text = renderTaskAuthoringLiterals(
      'specs/shop/shop.task.SHP-boot.md',
      'specs/shop/shop.spec.md',
      []
    );
    assert.match(text, /empty-rule-set: - none/);
    assert.deepStrictEqual(parsePhaseDetail('- **Rules:**\n  - none').rules, ['none']);
  });

  it('resolves every real registry tuple from an actual ticket directory', () => {
    const ticket = 'specs/example/module/module.task.EXA-work.md';
    const rules = loadRuleRegistry(process.cwd());
    const text = renderTaskAuthoringLiterals(ticket, 'specs/example/module/module.spec.md', rules);
    const hrefs = [...text.matchAll(/^    - \[[^\]]+\]\(([^)]+)\)$/gm)].map(
      (match) => match[1] as string
    );
    assert.equal(hrefs.length, rules.length);
    for (const href of hrefs) {
      assert.equal(existsSync(resolve(dirname(ticket), href)), true, href);
    }
  });
});
