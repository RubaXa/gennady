// @file: Real-CLI regression for scaffold's deterministic clean-HEAD feasibility gate.
// @consumers: sdd-scaffold, sdd-check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRepoFixture } from './fixture.ts';
import { runCli } from './run-cli.ts';

type TicketShape = {
  id: string;
  dependencies: string;
  targetFiles: string[];
  bootstrapAction?: string;
  capabilityAdapter?: string;
  providesCapabilities?: string[];
  requiresCapabilities?: string[];
  rules?: string[];
  providesPackages?: string[];
  requiresPackages?: string[];
  commandScenario?: { command: string; probe?: string };
  commandTestPhase?: boolean;
};

const PACKAGES = ['typescript', 'eslint', 'vitest', '@playwright/test', 'eslint-config-prettier'];

function ticket(shape: TicketShape): string {
  const scenario = shape.commandScenario;
  const testTarget = 'scripts/gates-smoke.test.ts';
  const productionTargets = shape.targetFiles.filter((path) => path !== testTarget);
  const hasCommandTestPhase = Boolean(scenario && shape.commandTestPhase !== false);
  return [
    `# Task: ${shape.id}`,
    '<!--SECTION:META-->',
    `- **Task-ID:** ${shape.id}`,
    '- **Status:** [ ] TODO',
    '- **Purpose:** scaffold feasibility fixture',
    '- **Scope:** infra',
    '- **Module:** N/A',
    `- **Dependencies:** ${shape.dependencies}`,
    '<!--/SECTION:META-->',
    '<!--SECTION:PHASES_OVERVIEW-->',
    '| ID | Kind | Deps | Status |',
    '|---|---|---|---|',
    '| P1 | config | — | [ ] |',
    ...(hasCommandTestPhase ? ['| P2 | test | P1 | [ ] |'] : []),
    '<!--/SECTION:PHASES_OVERVIEW-->',
    '<!--SECTION:PHASE_P1-->',
    '### P1 — config',
    `- **Objective:** ${shape.bootstrapAction === 'dependency-install' ? 'install declared toolchain dependencies' : 'configure declared tooling'}`,
    ...(shape.capabilityAdapter ? [`- **Capability Adapter:** ${shape.capabilityAdapter}`] : []),
    ...(shape.bootstrapAction ? [`- **Bootstrap Action:** ${shape.bootstrapAction}`] : []),
    ...(shape.providesPackages
      ? [`- **Provides Packages:** ${shape.providesPackages.join(', ')}`]
      : []),
    ...(shape.requiresPackages
      ? [`- **Requires Packages:** ${shape.requiresPackages.join(', ')}`]
      : []),
    ...(shape.providesCapabilities
      ? [`- **Provides Capabilities:** ${shape.providesCapabilities.join(', ')}`]
      : []),
    ...(shape.requiresCapabilities
      ? [`- **Requires Capabilities:** ${shape.requiresCapabilities.join(', ')}`]
      : []),
    '- **Rules:**',
    ...(shape.rules?.length ? shape.rules.map((rule) => `  - [rule](${rule})`) : ['  - none']),
    '- **Target Files:**',
    ...productionTargets.map((path) => `  - ${path}`),
    '- **Deleted Files:**',
    '  - none',
    '- **Inputs:** none',
    '- **Exit:** declared artifacts exist',
    '<!--/SECTION:PHASE_P1-->',
    ...(hasCommandTestPhase
      ? [
          '<!--SECTION:PHASE_P2-->',
          '### P2 — test',
          '- **Objective:** prove the exact command behavior',
          '- **Rules:**',
          '  - none',
          '- **Target Files:**',
          `  - ${testTarget}`,
          '- **Deleted Files:**',
          '  - none',
          '- **Inputs:** P1 handoff',
          '- **Exit:** the smoke test and exact command probe pass',
          '<!--/SECTION:PHASE_P2-->',
        ]
      : []),
    '<!--SECTION:BDD-->',
    '## Acceptance Criteria (BDD)',
    ...(scenario
      ? [
          '**Scenario:** type-check command [`integration`] `[IB-REQ-1]`',
          '- **Given** the toolchain is configured',
          `- **When** \`${scenario.command}\` runs`,
          '- **Then** it exits successfully',
        ]
      : [
          '**Scenario:** config exists [`unit`] `[IB-REQ-2]`',
          '- **Given** the clean repository',
          '- **When** config bootstrap completes',
          '- **Then** the exact config exists',
        ]),
    '<!--/SECTION:BDD-->',
    '<!--SECTION:VERIFICATION-->',
    '| Command | Required by | Role |',
    '|---|---|---|',
    ...(scenario
      ? [`| \`${scenario.probe ?? 'node scripts/config-smoke.mjs'}\` | IB-REQ-1 | probe |`]
      : ['| — | — | extra |']),
    '<!--/SECTION:VERIFICATION-->',
    '<!--SECTION:TEST_COVERAGE-->',
    ...(scenario
      ? [
          `- type-check command → \`scripts/gates-smoke.test.ts\` :: \`type-check works\`${scenario.probe ? ` :: command \`${scenario.probe}\`` : ''}`,
        ]
      : ['- config exists → `scripts/config-smoke.test.ts` :: `config exists`']),
    '<!--/SECTION:TEST_COVERAGE-->',
    '<!--SECTION:EXECUTION_LOG-->',
    '<!--/SECTION:EXECUTION_LOG-->',
  ].join('\n');
}

function fixture(corrected: boolean): string {
  const nodeCapabilities = [
    'node.runtime-version',
    'node.manifest-engine',
    'node.manifest-module-kind',
    'node.registry-config',
    'node.dependencies',
    'node.runtime',
    'node.package-manager',
  ];
  const nodeArtifacts = ['package.json', 'package-lock.json', '.nvmrc', '.npmrc'];
  const nodeRule = 'ai/directives/infra/nodejs-npm-setup.xml';
  const files: Record<string, string> = corrected
    ? {
        'specs/infra/infra.task.IB-toolchain.md': ticket({
          id: 'IB-toolchain',
          dependencies: 'None',
          targetFiles: nodeArtifacts,
          capabilityAdapter: 'node',
          bootstrapAction: 'dependency-install',
          providesCapabilities: nodeCapabilities,
          requiresCapabilities: ['node.runtime'],
          rules: [nodeRule],
          providesPackages: PACKAGES,
        }),
        'specs/infra/infra.task.IB-configs.md': ticket({
          id: 'IB-configs',
          dependencies: 'IB-toolchain',
          targetFiles: ['tsconfig.json', 'eslint.config.mjs', 'vitest.config.ts'],
          capabilityAdapter: 'typescript',
          providesCapabilities: ['typescript.compiler'],
          requiresCapabilities: ['node.package-manager', 'node.dependencies'],
          requiresPackages: PACKAGES,
        }),
        'specs/infra/infra.task.IB-gates.md': ticket({
          id: 'IB-gates',
          dependencies: 'IB-toolchain, IB-configs',
          targetFiles: ['scripts/gates-smoke.mjs', 'scripts/gates-smoke.test.ts'],
          requiresPackages: PACKAGES,
          commandScenario: { command: 'npm run type-check', probe: 'npm run type-check' },
          commandTestPhase: true,
        }),
        'specs/app/app.task.APP-product.md': ticket({
          id: 'APP-product',
          dependencies: 'IB-configs, IB-gates',
          targetFiles: ['src/app.ts'],
        }),
      }
    : {
        'specs/infra/infra.task.IB-configs.md': ticket({
          id: 'IB-configs',
          dependencies: 'None',
          targetFiles: ['tsconfig.json', 'eslint.config.mjs', 'vitest.config.ts'],
          requiresPackages: PACKAGES,
        }),
        'specs/infra/infra.task.IB-gates.md': ticket({
          id: 'IB-gates',
          dependencies: 'None',
          targetFiles: ['package.json', 'scripts/gates-smoke.mjs', 'scripts/gates-smoke.test.ts'],
          requiresPackages: PACKAGES,
          commandScenario: { command: 'npm run type-check' },
        }),
        'specs/infra/infra.task.TA-deps.md': ticket({
          id: 'TA-deps',
          dependencies: 'IB-configs, IB-gates',
          targetFiles: nodeArtifacts,
          capabilityAdapter: 'node',
          bootstrapAction: 'dependency-install',
          providesCapabilities: nodeCapabilities,
          requiresCapabilities: ['node.runtime'],
          rules: [nodeRule],
          providesPackages: PACKAGES,
        }),
      };
  const { root } = buildRepoFixture({
    scripts: { gennady: 'gennady --help' },
    files: { 'package-lock.json': '{"lockfileVersion":3}\n', ...files },
  });
  return root;
}

describe('sdd-check --scaffold-feasibility', () => {
  it('rejects draft.55 reverse bootstrap and presence-only command evidence before execute', () => {
    const root = fixture(false);
    try {
      const result = runCli(['sdd-check', '--scaffold-feasibility', root], root);
      assert.notStrictEqual(result.exitCode, 0, result.stdout + result.stderr);
      const output = result.stdout + result.stderr;
      assert.doesNotMatch(output, /SDD_SCAFFOLD_SHARED_ARTIFACT_WRITER_OVERLAP/);
      assert.match(output, /SDD_SCAFFOLD_TOOLCHAIN_PREREQ_MISSING.*IB-configs.*TA-deps/s);
      assert.match(output, /SDD_SCAFFOLD_BOOTSTRAP_REVERSE_DEP.*TA-deps.*IB-gates/s);
      assert.match(output, /SDD_SCAFFOLD_BDD_COMMAND_PROBE_MISSING.*npm run type-check/s);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('accepts one package+lock owner, forward bootstrap edges, and an exact real command probe', () => {
    const root = fixture(true);
    try {
      const result = runCli(['sdd-check', '--scaffold-feasibility', root], root);
      assert.strictEqual(result.exitCode, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /scaffold feasibility[\s\S]*clean/i);
      const encoded = result.stdout.match(/^critic-context: (.+)$/m)?.[1];
      assert.ok(encoded, result.stdout);
      const context = JSON.parse(encoded) as {
        schema: string;
        targetSet: Array<{ ticket: string; path: string; dependencies: string[] }>;
        cleanHead: { activeLockfiles: string[]; scripts: Record<string, string> };
        packageOwners: string[];
        phases: Array<{ ticket: string; phase: string; profile: string; ladder: string[] }>;
        commandProofs: Array<{
          bddCommand: string;
          probeCommand: string;
          testFile: string;
          testPhase: string;
          verificationRole: string;
          packageOwners: string[];
        }>;
        coverage: Array<{ ticket: string; policy: string; detail?: string }>;
        gaps: Array<{ type: string; fact: string }>;
      };
      assert.strictEqual(context.schema, 'sdd-scaffold-critic-context/v1');
      assert.deepStrictEqual(context.cleanHead.activeLockfiles, ['package-lock.json']);
      assert.strictEqual(context.cleanHead.scripts.gennady, 'gennady --help');
      assert.strictEqual(context.targetSet.length, 4);
      assert.deepStrictEqual(
        context.targetSet.find((entry) => entry.ticket === 'IB-gates'),
        {
          ticket: 'IB-gates',
          path: 'specs/infra/infra.task.IB-gates.md',
          dependencies: ['IB-toolchain', 'IB-configs'],
        }
      );
      assert.deepStrictEqual(context.packageOwners, ['IB-toolchain/P1']);
      assert.deepStrictEqual(
        context.phases.find((phase) => phase.ticket === 'IB-gates' && phase.phase === 'P2'),
        {
          ticket: 'IB-gates',
          path: 'specs/infra/infra.task.IB-gates.md',
          phase: 'P2',
          kind: 'test',
          profile: 'test',
          ladder: ['fix', 'type-check', 'test:coverage'],
          ticketDependencies: ['IB-toolchain', 'IB-configs'],
          phaseDependencies: ['P1'],
          targetFiles: ['scripts/gates-smoke.test.ts'],
          bootstrap: { action: null, providesPackages: [], requiresPackages: [] },
          verification: [
            { command: 'npm run type-check', role: 'probe', requiredBy: ['IB-REQ-1'] },
          ],
        }
      );
      assert.deepStrictEqual(context.commandProofs, [
        {
          ticket: 'IB-gates',
          scenario: 'type-check command',
          bddCommand: 'npm run type-check',
          probeCommand: 'npm run type-check',
          testFile: 'scripts/gates-smoke.test.ts',
          testPhase: 'P2',
          verificationRole: 'probe',
          cleanHeadScript: null,
        },
      ]);
      assert.deepStrictEqual(
        context.coverage.find((entry) => entry.ticket === 'IB-gates'),
        { ticket: 'IB-gates', policy: 'legacy', detail: 'pre-COVERAGE_POLICY ticket' }
      );
      assert.deepStrictEqual(context.gaps, []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects an exact command probe whose claimed test file has no owning test phase', () => {
    const root = fixture(true);
    try {
      const ticketPath = join(root, 'specs/infra/infra.task.IB-gates.md');
      const invalid = readFileSync(ticketPath, 'utf-8')
        .replace('| P2 | test | P1 | [ ] |\n', '')
        .replace(/\n<!--SECTION:PHASE_P2-->[\s\S]*?<!--\/SECTION:PHASE_P2-->/, '')
        .replace(
          '- **Target Files:**\n  - scripts/gates-smoke.mjs',
          '- **Target Files:**\n  - scripts/gates-smoke.mjs\n  - scripts/gates-smoke.test.ts'
        );
      writeFileSync(ticketPath, invalid, 'utf-8');

      const result = runCli(['sdd-check', '--scaffold-feasibility', root], root);
      assert.notStrictEqual(result.exitCode, 0, result.stdout + result.stderr);
      assert.match(
        result.stdout + result.stderr,
        /SDD_SCAFFOLD_BDD_COMMAND_TEST_PHASE_MISSING.*gates-smoke\.test\.ts/s
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports a missing quality package before execute with an exact provider repair', () => {
    const root = fixture(true);
    try {
      const ticketPath = join(root, 'specs/infra/infra.task.IB-toolchain.md');
      const invalid = readFileSync(ticketPath, 'utf-8').replace(
        `- **Provides Packages:** ${PACKAGES.join(', ')}`,
        `- **Provides Packages:** ${PACKAGES.filter((pkg) => pkg !== 'eslint-config-prettier').join(', ')}`
      );
      writeFileSync(ticketPath, invalid, 'utf-8');

      const result = runCli(['sdd-check', '--scaffold-feasibility', root], root);
      assert.notStrictEqual(result.exitCode, 0, result.stdout + result.stderr);
      assert.match(
        result.stdout + result.stderr,
        /infra\.task\.IB-configs\.md: error: SDD_SCAFFOLD_PACKAGE_PROVIDER_MISSING\s+IB-configs\/P1 requires package 'eslint-config-prettier'.+Expected: one DAG-reachable dependency-install provider.+Next: add eslint-config-prettier to Provides Packages/s
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('lists the selected adapter capabilities when a legacy monolithic claim is unknown', () => {
    const root = fixture(true);
    try {
      writeFileSync(
        join(root, 'specs/infra/infra.task.IB-quality-legacy.md'),
        ticket({
          id: 'IB-quality-legacy',
          dependencies: 'IB-configs',
          targetFiles: ['package.json'],
          capabilityAdapter: 'typescript-quality',
          providesCapabilities: ['typescript.quality-test-tooling'],
          requiresCapabilities: ['typescript.compiler', 'node.dependencies'],
        }),
        'utf8'
      );

      const result = runCli(['sdd-check', '--scaffold-feasibility', root], root);
      assert.notStrictEqual(result.exitCode, 0, result.stdout + result.stderr);
      assert.match(
        result.stdout + result.stderr,
        /SDD_SCAFFOLD_CAPABILITY_NOT_DECLARED_BY_ADAPTER\s+IB-quality-legacy\/P1 claims capability 'typescript\.quality-test-tooling'.+Expected: one of typescript\.test-tooling, typescript\.eslint-lint-tooling, typescript\.format-tooling.+Next:/s
      );
      assert.doesNotMatch(result.stdout + result.stderr, /--help/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
