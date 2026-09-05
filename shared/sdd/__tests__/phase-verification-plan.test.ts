// @file: Canonical phase-gate resolver regressions based on real commands and ticket structure.
// @consumers: sdd-task, sdd-verify
// @tasks: N/A

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  markPhaseVerificationProven,
  phaseVerificationArtifactPaths,
  resolvePhaseVerificationPlan,
} from '../phase-verification-plan.ts';
import type { TicketCorpusRef } from '../ticket-resolve.ts';

type Phase = {
  id: string;
  kind: 'config' | 'impl' | 'test';
  deps?: string[];
  readinessGates?: string[];
  targets: string[];
};

type TicketOptions = {
  dependencies?: string[];
  coverageOwner?: string;
};

function ticket(id: string, phases: Phase[], options: TicketOptions = {}): TicketCorpusRef {
  const dependencies = options.dependencies ?? [];
  const content = [
    '<!--SECTION:META-->',
    `- **Task-ID:** ${id}`,
    '- **Status:** [ ] TODO',
    '- **Scope:** app',
    `- **Dependencies:** ${dependencies.join(', ') || 'None'}`,
    '<!--/SECTION:META-->',
    '<!--SECTION:PHASES_OVERVIEW-->',
    '| ID | Kind | Deps | Status |',
    '|---|---|---|---|',
    ...phases.map(
      (phase) => `| ${phase.id} | ${phase.kind} | ${phase.deps?.join(', ') || '—'} | [ ] |`
    ),
    '<!--/SECTION:PHASES_OVERVIEW-->',
    ...phases.flatMap((phase) => [
      `<!--SECTION:PHASE_${phase.id}-->`,
      ...(phase.readinessGates
        ? ['- **Readiness Gates:**', ...phase.readinessGates.map((gate) => `  - ${gate}`)]
        : []),
      '- **Rules:**',
      '  - none',
      '- **Target Files:**',
      ...phase.targets.map((target) => `  - ${target}`),
      '- **Deleted Files:**',
      '  - none',
      `<!--/SECTION:PHASE_${phase.id}-->`,
    ]),
    '<!--SECTION:VERIFICATION-->',
    ...(options.coverageOwner
      ? ['- **Coverage Policy:** required', `- **Coverage Owner Phase:** ${options.coverageOwner}`]
      : ['- **Coverage Policy:** not-applicable', '- **Coverage Reason:** fixture']),
    '| Command | Required by | Role |',
    '|---|---|---|',
    ...(options.coverageOwner
      ? ['| npx gennady testcov --min=80 src | coverage-rule | coverage |']
      : ['| — | — | extra |']),
    '<!--/SECTION:VERIFICATION-->',
  ].join('\n');
  return {
    file: `/repo/specs/app/app.task.${id}.md`,
    taskId: id,
    status: '[ ] TODO',
    dependencies,
    scope: 'app',
    flowVersion: 'v2',
    content,
  };
}

function resolve(
  ref: TicketCorpusRef,
  phaseId: string,
  scripts: Record<string, string>,
  mode: 'planning' | 'runtime' = 'runtime'
) {
  const plan = resolvePhaseVerificationPlan({
    refs: [ref],
    ticketFile: ref.file,
    phaseId,
    scripts,
    availableArtifacts: new Set(),
    mode,
  });
  assert.ok(plan);
  return plan;
}

describe('resolvePhaseVerificationPlan', () => {
  it('requires an explicitly owned repair gate and rejects an inapplicable broad-root brick', () => {
    const ref = ticket('OWNED-BROAD', [
      {
        id: 'P1',
        kind: 'config',
        readinessGates: ['lint:fix'],
        targets: ['package.json'],
      },
    ]);
    const plan = resolve(ref, 'P1', {
      'format:fix': 'prettier --write',
      'lint:fix': 'eslint --fix .',
    });
    assert.deepStrictEqual(
      plan.gates
        .filter((gate) => gate.name === 'fix')
        .map(({ required, state, command }) => ({ required, state, command })),
      [{ required: true, state: 'COMMAND_MISSING', command: null }]
    );
  });

  it('runs an explicitly owned repair gate when both exact-target leaves are applicable', () => {
    const ref = ticket('OWNED-EXACT', [
      {
        id: 'P1',
        kind: 'config',
        readinessGates: ['lint:fix'],
        targets: ['package.json'],
      },
    ]);
    const plan = resolve(ref, 'P1', {
      'format:fix': 'prettier --write',
      'lint:fix': 'eslint --fix',
    });
    assert.deepStrictEqual(
      plan.gates
        .filter((gate) => gate.name === 'fix')
        .map(({ required, state, command }) => ({ required, state, command })),
      [{ required: true, state: 'CONFIGURED', command: 'target-repair' }]
    );
  });

  it('keeps an unrelated missing repair gate optional for a setup phase', () => {
    const ref = ticket('NON-OWNER', [{ id: 'P1', kind: 'config', targets: ['package.json'] }]);
    const plan = resolve(ref, 'P1', {
      'format:fix': 'prettier --write',
      'lint:fix': 'eslint --fix .',
    });
    assert.deepStrictEqual(
      plan.gates
        .filter((gate) => gate.name === 'fix')
        .map(({ required, state }) => ({ required, state })),
      [{ required: false, state: 'COMMAND_MISSING' }]
    );
  });

  it('requires an explicit Readiness Gate and resolves its real project script', () => {
    const ref = ticket('LINT-OWNER', [
      {
        id: 'P1',
        kind: 'config',
        readinessGates: ['lint'],
        targets: ['eslint.config.js'],
      },
    ]);
    const plan = resolve(ref, 'P1', { lint: 'eslint .' });
    assert.deepStrictEqual(
      plan.gates
        .filter((gate) => gate.required)
        .map(({ name, state, command, prerequisites, provider }) => ({
          name,
          state,
          command,
          prerequisites,
          provider,
        })),
      [
        {
          name: 'lint',
          state: 'CONFIGURED',
          command: 'npm run lint',
          prerequisites: [],
          provider: 'LINT-OWNER/P1',
        },
      ]
    );
  });

  it('derives the sole coverage producer from the ticket', () => {
    const ref = ticket(
      'COVERAGE',
      [
        { id: 'P1', kind: 'test', targets: ['test/unit.test.ts'] },
        { id: 'P2', kind: 'test', deps: ['P1'], targets: ['test/integration.test.ts'] },
      ],
      { coverageOwner: 'P2' }
    );
    const scripts = {
      'format:fix': 'prettier --write --',
      'lint:fix': 'eslint --fix --',
      'type-check': 'tsc --noEmit',
      test: 'node --test',
      'test:coverage': 'c8 node --test',
    };
    const nonOwner = resolve(ref, 'P1', scripts);
    const owner = resolve(ref, 'P2', scripts);
    assert.strictEqual(nonOwner.producesCoverage, false);
    assert.strictEqual(owner.producesCoverage, true);
    assert.ok(nonOwner.gates.some((gate) => gate.name === 'test'));
    assert.ok(!nonOwner.gates.some((gate) => gate.name === 'test:coverage'));
    assert.ok(owner.gates.some((gate) => gate.name === 'test:coverage'));
    assert.ok(!owner.gates.some((gate) => gate.name === 'test'));
  });

  it('resolves the accepted typecheck alias to its exact runnable command', () => {
    const ref = ticket('ALIAS', [{ id: 'P1', kind: 'impl', targets: ['src/app.ts'] }]);
    const gate = resolve(ref, 'P1', { typecheck: 'tsc --noEmit' }).gates.find(
      (candidate) => candidate.name === 'type-check'
    );
    assert.deepStrictEqual(
      { state: gate?.state, command: gate?.command },
      { state: 'CONFIGURED', command: 'npm run typecheck' }
    );
  });

  it('does not infer runtime state from capability artifacts or phase ordering', () => {
    const ref = ticket('REAL-RUNTIME', [
      { id: 'P1', kind: 'config', targets: ['tsconfig.json'] },
      { id: 'P2', kind: 'impl', deps: ['P1'], targets: ['src/app.ts'] },
    ]);
    const gate = resolve(ref, 'P2', { 'type-check': 'tsc --noEmit' }).gates.find(
      (candidate) => candidate.name === 'type-check'
    );
    assert.deepStrictEqual(
      {
        state: gate?.state,
        prerequisites: gate?.prerequisites,
        provider: gate?.provider,
      },
      { state: 'CONFIGURED', prerequisites: [], provider: null }
    );
    assert.deepStrictEqual(phaseVerificationArtifactPaths(), []);
  });

  it('defers a real command until its downstream Readiness Gate owner is complete', () => {
    const ref = ticket('FUTURE-CONFIG', [
      { id: 'P1', kind: 'config', targets: ['package.json'] },
      {
        id: 'P2',
        kind: 'config',
        deps: ['P1'],
        readinessGates: ['type-check'],
        targets: ['tsconfig.json'],
      },
    ]);
    const scripts = { 'type-check': 'tsc --noEmit' };
    const before = resolve(ref, 'P1', scripts).gates.find(
      (candidate) => candidate.name === 'type-check'
    );
    const owner = resolve(ref, 'P2', scripts).gates.find(
      (candidate) => candidate.name === 'type-check'
    );
    assert.deepStrictEqual(
      { state: before?.state, provider: before?.provider, required: before?.required },
      { state: 'PREREQUISITE_PENDING', provider: 'FUTURE-CONFIG/P2', required: false }
    );
    assert.deepStrictEqual(
      { state: owner?.state, provider: owner?.provider, required: owner?.required },
      { state: 'CONFIGURED', provider: 'FUTURE-CONFIG/P2', required: true }
    );
  });

  it('does not block a runnable phase on an unrelated ticket that declares the same gate', () => {
    const product = ticket('PRODUCT', [{ id: 'P1', kind: 'impl', targets: ['src/app.ts'] }]);
    const unrelated = ticket('UNRELATED-INFRA', [
      {
        id: 'P1',
        kind: 'config',
        readinessGates: ['type-check'],
        targets: ['tsconfig.other.json'],
      },
    ]);
    const plan = resolvePhaseVerificationPlan({
      refs: [product, unrelated],
      ticketFile: product.file,
      phaseId: 'P1',
      scripts: { 'type-check': 'tsc --noEmit' },
      availableArtifacts: new Set(),
      mode: 'runtime',
    });
    assert.ok(plan);
    assert.deepStrictEqual(
      plan.gates
        .filter((gate) => gate.name === 'type-check')
        .map(({ state, provider, command }) => ({ state, provider, command })),
      [{ state: 'CONFIGURED', provider: null, command: 'npm run type-check' }]
    );
  });

  it('keeps planning semantic while runtime fails closed on a missing required command', () => {
    const ref = ticket('MISSING', [{ id: 'P1', kind: 'impl', targets: ['src/app.ts'] }]);
    const planning = resolve(ref, 'P1', {}, 'planning').gates.find(
      (candidate) => candidate.name === 'type-check'
    );
    const runtime = resolve(ref, 'P1', {}, 'runtime').gates.find(
      (candidate) => candidate.name === 'type-check'
    );
    assert.deepStrictEqual([planning?.state, runtime?.state], ['DECLARED', 'COMMAND_MISSING']);
  });

  it('marks only a configured, actually passed gate as proven', () => {
    const ref = ticket('PROVEN', [{ id: 'P1', kind: 'impl', targets: ['src/app.ts'] }]);
    const plan = resolve(ref, 'P1', {
      'format:fix': 'prettier --write',
      'lint:fix': 'eslint --fix',
      'type-check': 'tsc --noEmit',
      test: 'node --test',
    });
    const proven = markPhaseVerificationProven(plan, new Set(['type-check']));
    assert.strictEqual(proven.gates.find((gate) => gate.name === 'type-check')?.state, 'PROVEN');
    assert.strictEqual(proven.gates.find((gate) => gate.name === 'test')?.state, 'CONFIGURED');
  });
});
