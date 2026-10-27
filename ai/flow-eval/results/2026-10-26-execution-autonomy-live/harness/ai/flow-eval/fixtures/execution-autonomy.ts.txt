// @file: Small execution-autonomy runtime fixture with real Node checks and independent scenario files.
// @spec: AI-SKILLS
// @consumers: execution-autonomy viability tests and finite live qualification

/** @purpose Canonical fixture ticket path shared by runtime controls and future scenario patches. */
export const EXECUTION_AUTONOMY_TICKET = 'specs/autonomy/autonomy.task.AUT-delay.md';

/**
 * @purpose Materialize input bytes for the runtime context/replan control, without sessions or dependencies.
 * @invariant Reference implementation is a host viability control, not a model-generated success;
 *   independent behavioral assertions are supplied separately by the host test.
 * @returns Repo-relative source, scenario, preset and ticket bytes; caller owns provisioning/cleanup.
 */
export function executionAutonomyFixtureFiles(): Readonly<Record<string, string>> {
  const phase = (id: string, targets: readonly string[], rule: string, inputs: string) => [
    `<!--SECTION:PHASE_${id}-->`,
    `### ${id}`,
    '- **Objective:** Preserve finite bounded delays and reject invalid input',
    '- **Rules:**',
    `  - [selected](${rule})`,
    '  - [helper](../../rules/helper.xml)',
    '- **Target Files:**',
    ...targets.map((path) => `  - \`${path}\``),
    `- **Inputs:** ${inputs}`,
    '- **Exit:** The declared behavioral checks pass without weakening the scenario contract',
    `<!--/SECTION:PHASE_${id}-->`,
  ];
  return {
    '.gitignore': 'node_modules\ncoverage\n',
    'package.json': JSON.stringify({
      name: 'execution-autonomy-fixture',
      private: true,
      type: 'module',
      scripts: {
        unit: 'node --experimental-strip-types --test --test-reporter=tap src/delay.test.ts src/delay.invalid.test.ts',
      },
    }),
    'gennady.yaml': [
      'verify:',
      '  sdd:',
      '    mapping:',
      '      CodeWork: autonomy-code',
      '      UnitWork: autonomy-test',
      '  presets:',
      '    node:',
      '      phases:',
      '        autonomy-code: { include: [autonomy-syntax] }',
      '        autonomy-test: { include: [autonomy-unit] }',
      '      steps:',
      '        syntax:',
      '          tags: [autonomy-syntax]',
      '          needs: []',
      '          executor: local',
      '          effect: observe',
      '          command:',
      '            argv: [node, --experimental-strip-types, --check, src/delay.ts]',
      '            cwd: .',
      '          timeout: 10s',
      '          onFailure: stop-phase',
      '        scenarios:',
      '          tags: [autonomy-unit]',
      '          needs: []',
      '          executor: local',
      '          effect: observe',
      '          command:',
      '            argv: [npm, run, unit]',
      '            cwd: .',
      '          timeout: 10s',
      '          onFailure: stop-phase',
      '          testStats: { policy: required, protocol: node-test-summary-v1, runner: node:test }',
      '',
    ].join('\n'),
    'src/delay.ts': [
      '// @spec: AUT',
      'export function boundedDelay(value: number, limit: number): number {',
      '  if (!Number.isFinite(value) || !Number.isFinite(limit) || value < 0 || limit < 0) throw new RangeError("finite nonnegative delays required");',
      '  return Math.min(value, limit);',
      '}',
      '',
    ].join('\n'),
    'src/delay.test.ts': [
      '// @spec: AUT',
      'import assert from "node:assert/strict";',
      'import { test } from "node:test";',
      'import { boundedDelay } from "./delay.ts";',
      'test("caps a finite delay", () => { assert.equal(boundedDelay(200, 50), 50); assert.equal(boundedDelay(5, 50), 5); });',
      '',
    ].join('\n'),
    'src/delay.invalid.test.ts': [
      '// @spec: AUT',
      'import assert from "node:assert/strict";',
      'import { test } from "node:test";',
      'import { boundedDelay } from "./delay.ts";',
      'test("rejects invalid delays", () => { for (const value of [NaN, Infinity, -1]) assert.throws(() => boundedDelay(value, 50), RangeError); });',
      '',
    ].join('\n'),
    'rules/helper.xml':
      '<HelperRule rule-id="delay-helper" rule-schema="1" type="required" ver="1">\n<Meta>\n<When pattern="src/delay.guard.ts"/>\n</Meta>\nPreserve rejection of non-finite and negative delays.\n</HelperRule>\n',
    'specs/autonomy/autonomy.spec.md':
      '# AUT\nFinite nonnegative delays are capped; invalid inputs are rejected without a side effect.\n',
    [EXECUTION_AUTONOMY_TICKET]: [
      '# Task: AUT-delay',
      '<!--SECTION:META-->',
      '- **Task-ID:** AUT-delay',
      '- **Status:** [~] IN_PROGRESS',
      '- **Scope:** autonomy',
      '- **Purpose:** Preserve finite bounded delay behavior',
      '- **Dependencies:** none',
      '<!--/SECTION:META-->',
      '<!--SECTION:PHASES_OVERVIEW-->',
      '| ID | Kind | Deps | Status |',
      '|---|---|---|---|',
      '| P1 | CodeWork | — | [ ] |',
      '| P2 | UnitWork | P1 | [ ] |',
      '<!--/SECTION:PHASES_OVERVIEW-->',
      ...phase('P1', ['src/delay.ts'], 'ai/directives/coding/typescript-rules.xml', 'none'),
      ...phase(
        'P2',
        ['src/delay.test.ts', 'src/delay.invalid.test.ts'],
        'ai/directives/testing/node-test.xml',
        'P1 handoff'
      ),
      '<!--SECTION:BDD-->',
      '**Scenario:** cap [`unit`] `[AUT-REQ-1]`',
      '- **Then** a delay never exceeds its finite nonnegative limit',
      '**Scenario:** invalid [`unit`] `[AUT-REQ-1]`',
      '- **Then** non-finite and negative values are rejected',
      '<!--/SECTION:BDD-->',
      '<!--SECTION:VERIFICATION-->',
      '<!--PHASE_RECEIPTS:v1-->',
      '<!--COVERAGE_POLICY:v1-->',
      '- **Coverage Policy:** not-applicable',
      '- **Coverage Reason:** Context transition fixture has no project coverage threshold; real node:test scenarios are mandatory',
      '| Command | Required by | Role |',
      '|---|---|---|',
      '<!--/SECTION:VERIFICATION-->',
      '<!--SECTION:TEST_COVERAGE-->',
      '- Scenario cap → `src/delay.test.ts` :: `caps a finite delay`',
      '- Scenario invalid → `src/delay.invalid.test.ts` :: `rejects invalid delays`',
      '<!--/SECTION:TEST_COVERAGE-->',
      '<!--SECTION:EXECUTION_LOG-->',
      '### Round 1 — 2026-10-26, initial',
      ...['P1', 'P2'].flatMap((id) => [
        `#### ${id}`,
        '- [ ] `<ts>` DONE',
        '**Handoff →** artifacts: [...]; decisions: [...]; open: [...]; deviations: [...]',
      ]),
      '#### Round close',
      '- [ ] `<ts>` DONE',
      '<!--/SECTION:EXECUTION_LOG-->',
      '<!--SECTION:DECISION_LOG-->',
      '<!--/SECTION:DECISION_LOG-->',
      '',
    ].join('\n'),
  };
}
