// @file: Black-box draft.60 regression: a real gate must wait for its declared readiness owner.
// @consumers: sdd-task, sdd-verify
// @tasks: N/A

import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { describe, it } from 'node:test';
import { buildRepoFixture } from './fixture.ts';
import { runCli } from './run-cli.ts';

const INSTALL_TICKET = 'specs/infra/infra.task.IB-boot.md';
const LATE_RUNTIME_TICKET = 'specs/infra/infra.task.TA-deps.md';
const NODE_RULE = 'ai/directives/infra/nodejs-npm-setup.xml';

function task(options: {
  id: string;
  dependencies?: string[];
  phases: Array<{
    id: string;
    kind: 'config' | 'impl';
    deps?: string[];
    objective: string;
    rules?: string[];
    targets: string[];
    readinessGates?: string[];
  }>;
}): string {
  const dependencies = options.dependencies ?? [];
  return [
    `# Task: ${options.id}`,
    '<!--SECTION:META-->',
    '## Meta',
    `- **Task-ID:** ${options.id}`,
    '- **Status:** [ ] TODO',
    '- **Purpose:** materialize one ordered Node infrastructure boundary',
    '- **Scope:** infra',
    '- **Module:** N/A',
    '- **Structural Owner:** infrastructure-flat',
    '- **Owning Spec:** [Owning spec](./infra.spec.md)',
    `- **Dependencies:** ${dependencies.join(', ') || 'None'}`,
    '- **Spec References:**',
    '  - Contract: [Node infrastructure](./infra.spec.md#service-node-capability)',
    '- **Runtime Backing:** not-implemented',
    '- **Verification Levels:** contract',
    '- **Deferred Runtime Scope:** None',
    '<!--/SECTION:META-->',
    '<!--SECTION:PHASES_OVERVIEW-->',
    '## Phases Overview',
    '| ID | Kind | Deps | Status |',
    '|---|---|---|---|',
    ...options.phases.map(
      (phase) => `| ${phase.id} | ${phase.kind} | ${phase.deps?.join(', ') || '—'} | [ ] |`
    ),
    '<!--/SECTION:PHASES_OVERVIEW-->',
    ...options.phases.flatMap((phase) => [
      `<!--SECTION:PHASE_${phase.id}-->`,
      `### ${phase.id} — ${phase.kind}`,
      `- **Objective:** ${phase.objective}`,
      '- **Rules:**',
      ...(phase.rules?.length
        ? phase.rules.map((rule) => `  - [nodejs-npm-setup](../../${rule})`)
        : ['  - none']),
      '- **Target Files:**',
      ...phase.targets.map((target) => `  - ${target}`),
      '- **Deleted Files:**',
      '  - none',
      ...(phase.readinessGates
        ? ['- **Readiness Gates:**', ...phase.readinessGates.map((gate) => `  - ${gate}`)]
        : []),
      '- **Inputs:** prior phase handoff',
      '- **Exit:** the declared capability exists',
      `<!--/SECTION:PHASE_${phase.id}-->`,
    ]),
    '<!--SECTION:BDD-->',
    '## Acceptance Criteria (BDD)',
    '**Scenario:** preserves infrastructure order [`contract`] `[INF-REQ-1]`',
    '- **Given** an empty project baseline',
    '- **When** the phase dependency order is reviewed',
    '- **Then** runtime and package configuration precede dependency installation',
    '<!--/SECTION:BDD-->',
    '<!--SECTION:VERIFICATION-->',
    '## Verification',
    '| Command | Required by | Role |',
    '|---|---|---|',
    `| \`npm run type-check\` | ${NODE_RULE} | extra |`,
    '<!--/SECTION:VERIFICATION-->',
    '<!--SECTION:TEST_COVERAGE-->',
    '## Test Scenario Coverage',
    '- preserves infrastructure order → `test/infrastructure-order.test.ts` :: `[INF-REQ-1] preserves infrastructure order`',
    '<!--/SECTION:TEST_COVERAGE-->',
    '<!--SECTION:EXECUTION_LOG-->',
    '## Execution Log',
    '- pending',
    '<!--/SECTION:EXECUTION_LOG-->',
  ].join('\n');
}

const IB_BOOT = task({
  id: 'IB-boot',
  phases: [
    {
      id: 'P1',
      kind: 'config',
      objective: 'install Node, TypeScript, test, and app dependencies',
      targets: ['package.json', 'package-lock.json', '.npmrc'],
    },
    {
      id: 'P2',
      kind: 'config',
      deps: ['P1'],
      objective: 'create the TypeScript compiler configuration',
      readinessGates: ['type-check'],
      targets: ['tsconfig.json'],
    },
  ],
});

const TA_DEPS = task({
  id: 'TA-deps',
  dependencies: ['IB-boot'],
  phases: [
    {
      id: 'P1',
      kind: 'config',
      objective: 'select the Node runtime after dependency installation',
      rules: [NODE_RULE],
      targets: ['.nvmrc'],
    },
  ],
});

function draft60Repo(): { root: string } {
  return buildRepoFixture({
    files: {
      [INSTALL_TICKET]: IB_BOOT,
      [LATE_RUNTIME_TICKET]: TA_DEPS,
      'specs/infra/infra.spec.md': [
        '# Infra',
        '<!--SECTION:SCOPE_TYPE-->',
        'infrastructure',
        '<!--/SECTION:SCOPE_TYPE-->',
        '#### Service: `NodeCapability`',
        'Owns the ordered Node bootstrap contract.',
      ].join('\n'),
      [NODE_RULE]: '<Rule id="nodejs-npm-setup"></Rule>\n',
      '.npmrc': 'fund=false\n',
      'package-lock.json': '{"lockfileVersion":3}\n',
      'scripts/type-check.mjs': [
        "console.error('DRAFT60_TYPECHECK_RAN');",
        "console.error('TS_CONFIG_PREREQUISITE_MISSING');",
        'process.exit(1);',
      ].join('\n'),
      'package.json': JSON.stringify(
        {
          name: 'draft60-boundary',
          private: true,
          type: 'module',
          scripts: { 'type-check': 'node scripts/type-check.mjs' },
        },
        null,
        2
      ),
    },
  });
}

describe('draft.60 Node infrastructure boundary', { concurrency: true }, () => {
  it('does not call a future-config typecheck after sdd-task declared no P1 gate', () => {
    const { root } = draft60Repo();
    try {
      const phase = runCli(['sdd-task', INSTALL_TICKET, '--phase', 'P1'], root);
      const verify = runCli(['sdd-verify', '--task', INSTALL_TICKET, '--phase', 'P1'], root);
      const verifyOutput = `${verify.stdout}${verify.stderr}`;
      const taskStateLine = phase.stdout.match(/^\s*gate-state: type-check .+$/m)?.[0]?.trim();
      const verifyStateLine = verifyOutput.match(/^\s*gate-state: type-check .+$/m)?.[0]?.trim();
      assert.deepStrictEqual(
        {
          phaseExitCode: phase.exitCode,
          taskGateState: /none required by this phase's rules/.test(phase.stdout)
            ? 'NONE'
            : phase.stdout.includes('PREREQUISITE_PENDING')
              ? 'PREREQUISITE_PENDING'
              : 'OTHER',
          verifyTypeCheckStarted: verifyOutput.includes('DRAFT60_TYPECHECK_RAN'),
          verifyPrerequisiteState: verifyStateLine?.includes('PREREQUISITE_PENDING')
            ? 'PREREQUISITE_PENDING'
            : 'ORDINARY_GATE_RESULT',
          sharedStateLine: taskStateLine === verifyStateLine,
          structuralReceipt: verifyOutput.includes('receipt recorded:'),
        },
        {
          phaseExitCode: 0,
          taskGateState: 'PREREQUISITE_PENDING',
          verifyTypeCheckStarted: false,
          verifyPrerequisiteState: 'PREREQUISITE_PENDING',
          sharedStateLine: true,
          structuralReceipt: true,
        }
      );
      assert.ok(taskStateLine);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
