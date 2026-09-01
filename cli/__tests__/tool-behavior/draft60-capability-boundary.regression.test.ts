// @file: Black-box draft.60 regression: impossible Node bootstrap boundary must be rejected before execute.
// @consumers: sdd-task, sdd-verify, sdd-check --scaffold-feasibility
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
    action?: 'dependency-install';
    provides?: string[];
    requires?: string[];
    adapter?: 'node' | 'typescript';
    providesCapabilities?: string[];
    requiresCapabilities?: string[];
  }>;
}): string {
  const dependencies = options.dependencies ?? [];
  return [
    `# Task: ${options.id}`,
    '<!--SECTION:META-->',
    '## Meta',
    `- **Task-ID:** ${options.id}`,
    '- **Status:** [ ] TODO',
    '- **Purpose:** materialize one ordered Node capability boundary',
    '- **Scope:** infra',
    '- **Module:** N/A',
    '- **Structural Owner:** infrastructure-flat',
    '- **Owning Spec:** [Owning spec](./infra.spec.md)',
    `- **Dependencies:** ${dependencies.join(', ') || 'None'}`,
    '- **Spec References:**',
    '  - Contract: [Node capability](./infra.spec.md#service-node-capability)',
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
      ...(phase.adapter ? [`- **Capability Adapter:** ${phase.adapter}`] : []),
      ...(phase.action ? [`- **Bootstrap Action:** ${phase.action}`] : []),
      ...(phase.provides ? [`- **Provides Packages:** ${phase.provides.join(', ')}`] : []),
      ...(phase.requires ? [`- **Requires Packages:** ${phase.requires.join(', ')}`] : []),
      ...(phase.providesCapabilities
        ? [`- **Provides Capabilities:** ${phase.providesCapabilities.join(', ')}`]
        : []),
      ...(phase.requiresCapabilities
        ? [`- **Requires Capabilities:** ${phase.requiresCapabilities.join(', ')}`]
        : []),
      '- **Rules:**',
      ...(phase.rules?.length
        ? phase.rules.map((rule) => `  - [nodejs-npm-setup](../../${rule})`)
        : ['  - none']),
      '- **Target Files:**',
      ...phase.targets.map((target) => `  - ${target}`),
      '- **Deleted Files:**',
      '  - none',
      '- **Inputs:** prior phase handoff',
      '- **Exit:** the declared capability exists',
      `<!--/SECTION:PHASE_${phase.id}-->`,
    ]),
    '<!--SECTION:BDD-->',
    '## Acceptance Criteria (BDD)',
    '**Scenario:** preserves capability order [`contract`] `[INF-REQ-1]`',
    '- **Given** an empty project baseline',
    '- **When** the capability DAG is evaluated',
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
    '- preserves capability order → `test/capability-order.test.ts` :: `preserves capability order`',
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
      adapter: 'node',
      action: 'dependency-install',
      provides: ['typescript'],
      providesCapabilities: ['node.dependencies'],
      targets: ['package.json', 'package-lock.json', '.npmrc'],
    },
    {
      id: 'P2',
      kind: 'config',
      deps: ['P1'],
      objective: 'create the TypeScript compiler configuration',
      adapter: 'typescript',
      requires: ['typescript'],
      providesCapabilities: ['typescript.compiler'],
      requiresCapabilities: ['node.dependencies'],
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
      adapter: 'node',
      rules: [NODE_RULE],
      providesCapabilities: ['node.runtime-version'],
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

function relevantCodes(output: string): string[] {
  return [
    'SDD_SCAFFOLD_PHASE_GATE_PREREQUISITE_FUTURE',
    'SDD_SCAFFOLD_CAPABILITY_ARTIFACT_ORDER',
    'SDD_SCAFFOLD_PLATFORM_RULE_CASCADE_MISSING',
  ].filter((code) => output.includes(code));
}

describe('draft.60 Node capability boundary', { concurrency: true }, () => {
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

  it('feasibility rejects platform artifacts owned only after dependency install', () => {
    const { root } = draft60Repo();
    try {
      const result = runCli(['sdd-check', '--scaffold-feasibility'], root);
      const output = `${result.stdout}${result.stderr}`;
      assert.deepStrictEqual(
        {
          exitCode: result.exitCode,
          codePresent: output.includes('SDD_SCAFFOLD_CAPABILITY_ARTIFACT_ORDER'),
          phasePresent: /IB-boot\/P1/.test(output),
        },
        {
          exitCode: 1,
          codePresent: true,
          phasePresent: true,
        }
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('feasibility allows the setup phase future type-check prerequisite', () => {
    const { root } = draft60Repo();
    try {
      const result = runCli(['sdd-check', '--scaffold-feasibility'], root);
      const output = `${result.stdout}${result.stderr}`;
      assert.deepStrictEqual(
        relevantCodes(output).filter((code) => code.includes('PHASE_GATE')),
        []
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('feasibility stops a required code phase whose compiler provider is downstream', () => {
    const requiredTicket = task({
      id: 'APP-required-gate',
      phases: [
        {
          id: 'P1',
          kind: 'impl',
          objective: 'implement code that must be type-checked',
          targets: ['src/app.ts'],
        },
        {
          id: 'P2',
          kind: 'config',
          deps: ['P1'],
          objective: 'create the compiler only after code',
          adapter: 'typescript',
          providesCapabilities: ['typescript.compiler'],
          requiresCapabilities: ['node.dependencies'],
          targets: ['tsconfig.json'],
        },
      ],
    });
    const { root } = buildRepoFixture({
      files: {
        'specs/infra/infra.task.APP-required-gate.md': requiredTicket,
        'specs/infra/infra.spec.md': '# Infra\n',
        'src/app.ts': 'export const app = true;\n',
      },
      scripts: { 'type-check': 'node --check src/app.ts' },
    });
    try {
      const result = runCli(['sdd-check', '--scaffold-feasibility'], root);
      const output = `${result.stdout}${result.stderr}`;
      assert.strictEqual(result.exitCode, 1, output);
      assert.match(output, /SDD_SCAFFOLD_PHASE_GATE_PREREQUISITE_FUTURE/);
      assert.match(output, /APP-required-gate\/P1.*typescript\.compiler/s);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('feasibility reports that dependency-install P1 did not activate the Node platform rule', () => {
    const { root } = draft60Repo();
    try {
      const result = runCli(['sdd-check', '--scaffold-feasibility'], root);
      const output = `${result.stdout}${result.stderr}`;
      assert.deepStrictEqual(
        {
          codePresent: output.includes('SDD_SCAFFOLD_PLATFORM_RULE_CASCADE_MISSING'),
          phasePresent: /IB-boot\/P1/.test(output),
          rulePresent: output.includes(NODE_RULE),
        },
        { codePresent: true, phasePresent: true, rulePresent: true }
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
