// @file: Real-CLI regression for scaffold's deterministic clean-HEAD feasibility gate.
// @consumers: sdd-scaffold, sdd-check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { buildRepoFixture } from './fixture.ts';
import { runCli } from './run-cli.ts';

type TicketShape = {
  id: string;
  dependencies: string;
  targetFiles: string[];
  bootstrapAction?: string;
  providesPackages?: string[];
  requiresPackages?: string[];
  commandScenario?: { command: string; probe?: string };
};

const PACKAGES = ['typescript', 'eslint', 'vitest', '@playwright/test', 'eslint-config-prettier'];

function ticket(shape: TicketShape): string {
  const scenario = shape.commandScenario;
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
    '<!--/SECTION:PHASES_OVERVIEW-->',
    '<!--SECTION:PHASE_P1-->',
    '### P1 — config',
    `- **Objective:** ${shape.bootstrapAction === 'dependency-install' ? 'install declared toolchain dependencies' : 'configure declared tooling'}`,
    ...(shape.bootstrapAction ? [`- **Bootstrap Action:** ${shape.bootstrapAction}`] : []),
    ...(shape.providesPackages
      ? [`- **Provides Packages:** ${shape.providesPackages.join(', ')}`]
      : []),
    ...(shape.requiresPackages
      ? [`- **Requires Packages:** ${shape.requiresPackages.join(', ')}`]
      : []),
    '- **Rules:**',
    '  - none',
    '- **Target Files:**',
    ...shape.targetFiles.map((path) => `  - ${path}`),
    '- **Deleted Files:**',
    '  - none',
    '- **Inputs:** none',
    '- **Exit:** declared artifacts exist',
    '<!--/SECTION:PHASE_P1-->',
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
  const files: Record<string, string> = corrected
    ? {
        'specs/infra/infra.task.IB-toolchain.md': ticket({
          id: 'IB-toolchain',
          dependencies: 'None',
          targetFiles: ['package.json', 'package-lock.json'],
          bootstrapAction: 'dependency-install',
          providesPackages: PACKAGES,
        }),
        'specs/infra/infra.task.IB-configs.md': ticket({
          id: 'IB-configs',
          dependencies: 'IB-toolchain',
          targetFiles: ['tsconfig.json', 'eslint.config.mjs', 'vitest.config.ts'],
          requiresPackages: PACKAGES,
        }),
        'specs/infra/infra.task.IB-gates.md': ticket({
          id: 'IB-gates',
          dependencies: 'IB-toolchain',
          targetFiles: ['scripts/gates-smoke.mjs', 'scripts/gates-smoke.test.ts'],
          requiresPackages: PACKAGES,
          commandScenario: { command: 'npm run type-check', probe: 'npm run type-check' },
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
          targetFiles: ['package.json', 'package-lock.json'],
          bootstrapAction: 'dependency-install',
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
      assert.match(output, /SDD_SCAFFOLD_SHARED_ARTIFACT_OWNER_AMBIGUOUS.*package\.json/s);
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
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
