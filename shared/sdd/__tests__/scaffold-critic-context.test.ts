// @file: Pure regression for the scaffold critic's deterministic mechanical context.
// @consumers: sdd-check --scaffold-feasibility
// @tasks: N/A

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deriveScaffoldCriticContext,
  type ScaffoldPackageBaseline,
} from '../scaffold-feasibility.ts';
import type { TicketCorpusRef } from '../ticket-resolve.ts';

function ticket(id: string, phase: string, dependencies = 'None'): TicketCorpusRef {
  const content = [
    '<!--SECTION:META-->',
    `- **Task-ID:** ${id}`,
    '- **Status:** [ ] TODO',
    `- **Dependencies:** ${dependencies}`,
    '<!--/SECTION:META-->',
    '<!--SECTION:PHASES_OVERVIEW-->',
    '| ID | Kind | Deps | Status |',
    '|---|---|---|---|',
    phase,
    '<!--/SECTION:PHASES_OVERVIEW-->',
    '<!--SECTION:PHASE_P1-->',
    '- **Objective:** prove the planned command',
    ...(id === 'IB-toolchain'
      ? [
          '- **Bootstrap Action:** dependency-install',
          '- **Provides Packages:** vitest',
          '- **Rules:**',
          '  - none',
          '- **Target Files:**',
          '  - package.json',
          '  - package-lock.json',
        ]
      : [
          '- **Requires Packages:** vitest',
          '- **Rules:**',
          '  - ai/directives/testing/coverage.xml',
          '- **Target Files:**',
          '  - scripts/gates-smoke.test.ts',
        ]),
    '- **Deleted Files:**',
    '  - none',
    '<!--/SECTION:PHASE_P1-->',
    '<!--SECTION:BDD-->',
    ...(id === 'IB-gates'
      ? [
          '**Scenario:** type-check command `[IB-REQ-1]`',
          '- **Given** the toolchain exists',
          '- **When** `npm run type-check` runs',
          '- **Then** it succeeds',
        ]
      : [
          '**Scenario:** dependencies install',
          '- **When** bootstrap runs',
          '- **Then** it succeeds',
        ]),
    '<!--/SECTION:BDD-->',
    '<!--SECTION:VERIFICATION-->',
    ...(id === 'IB-gates'
      ? [
          '<!--COVERAGE_POLICY:v1-->',
          '- **Coverage Policy:** required',
          '- **Coverage Owner Phase:** P1',
          '| Command | Required by | Role |',
          '|---|---|---|',
          '| `npm run type-check` | IB-REQ-1 | probe |',
          '| `npx gennady testcov --min=80 src` | coverage | coverage |',
        ]
      : [
          '<!--COVERAGE_POLICY:v1-->',
          '- **Coverage Policy:** not-applicable',
          '- **Coverage Reason:** dependency metadata has no runtime behavior',
          '| Command | Required by | Role |',
          '|---|---|---|',
          '| — | — | extra |',
        ]),
    '<!--/SECTION:VERIFICATION-->',
    '<!--SECTION:TEST_COVERAGE-->',
    ...(id === 'IB-gates'
      ? [
          '- type-check command → `scripts/gates-smoke.test.ts` :: `type-check works` :: command `npm run type-check`',
        ]
      : ['- dependencies install → `deps.test.ts` :: `dependencies install`']),
    '<!--/SECTION:TEST_COVERAGE-->',
    '<!--SECTION:EXECUTION_LOG-->',
    '<!--/SECTION:EXECUTION_LOG-->',
  ].join('\n');
  return {
    file: `/repo/specs/infra/infra.task.${id}.md`,
    taskId: id,
    status: '[ ] TODO',
    dependencies: dependencies === 'None' ? [] : dependencies.split(', '),
    content,
  };
}

describe('deriveScaffoldCriticContext', () => {
  const refs = [
    ticket('IB-toolchain', '| P1 | bootstrap | — | [ ] |'),
    ticket('IB-gates', '| P1 | test | — | [ ] |', 'IB-toolchain'),
  ];
  const baseline: ScaffoldPackageBaseline = {
    declaredPackages: new Set(),
    activeLockfiles: ['package-lock.json'],
    scripts: { 'type-check': 'tsc --noEmit' },
  };

  it('makes phase, command, verification, and coverage mechanics explicit', () => {
    const context = deriveScaffoldCriticContext(refs, baseline, (file) =>
      file.replace('/repo/', '')
    );

    assert.strictEqual(context.schema, 'sdd-scaffold-critic-context/v1');
    assert.deepStrictEqual(context.targetSet[1], {
      ticket: 'IB-gates',
      path: 'specs/infra/infra.task.IB-gates.md',
      dependencies: ['IB-toolchain'],
    });
    assert.deepStrictEqual(context.packageOwners, ['IB-toolchain/P1']);
    const phase = context.phases.find((candidate) => candidate.ticket === 'IB-gates');
    assert.deepStrictEqual(phase?.ladder, ['fix', 'type-check', 'test:coverage']);
    assert.deepStrictEqual(
      phase?.verification.map(({ command, role }) => ({ command, role })),
      [
        { command: 'npm run type-check', role: 'probe' },
        { command: 'npx gennady testcov --min=80 src', role: 'coverage' },
      ]
    );
    assert.deepStrictEqual(context.commandProofs[0], {
      ticket: 'IB-gates',
      scenario: 'type-check command',
      bddCommand: 'npm run type-check',
      probeCommand: 'npm run type-check',
      testFile: 'scripts/gates-smoke.test.ts',
      testPhase: 'P1',
      verificationRole: 'probe',
      cleanHeadScript: 'tsc --noEmit',
    });
    assert.deepStrictEqual(context.coverage[1], {
      ticket: 'IB-gates',
      policy: 'required',
      ownerPhase: 'P1',
      readerCommand: 'npx gennady testcov --min=80 src',
    });
    assert.deepStrictEqual(context.gaps, []);
  });

  it('keeps a normal future script explicit without turning it into a blocking gap', () => {
    const context = deriveScaffoldCriticContext(refs, { ...baseline, scripts: {} });
    assert.strictEqual(context.commandProofs[0]?.cleanHeadScript, null);
    assert.deepStrictEqual(context.packageOwners, ['IB-toolchain/P1']);
    assert.deepStrictEqual(context.gaps, []);
  });

  it('uses typed gaps only for a deterministic schema failure', () => {
    const unsupported = ticket('IB-odd', '| P1 | vendor-magic | — | [ ] |');
    const context = deriveScaffoldCriticContext([unsupported], baseline);
    assert.deepStrictEqual(context.gaps, [
      {
        type: 'TOOL_CONTRACT_MISSING',
        ticket: 'IB-odd',
        phase: 'P1',
        fact: 'phase-profile',
        detail: "phase kind 'vendor-magic' has no structural verify profile",
      },
    ]);
  });
});
