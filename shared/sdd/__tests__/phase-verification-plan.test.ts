// @file: Typed canonical phase-gate state resolver regressions.
// @consumers: sdd-task, sdd-check scaffold feasibility, sdd-verify
// @tasks: N/A

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  markPhaseVerificationProven,
  resolvePhaseVerificationPlan,
} from '../phase-verification-plan.ts';
import {
  DEFAULT_CAPABILITY_ADAPTER_REGISTRY,
  type CapabilityAdapter,
  type CapabilityAdapterRegistry,
} from '../capability-adapter.ts';
import type { TicketCorpusRef } from '../ticket-resolve.ts';

type Phase = {
  id: string;
  kind: 'config' | 'impl' | 'test';
  deps?: string[];
  adapter?: string;
  provides?: string[];
  requires?: string[];
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
      ...(phase.adapter ? [`- **Capability Adapter:** ${phase.adapter}`] : []),
      ...(phase.provides ? [`- **Provides Capabilities:** ${phase.provides.join(', ')}`] : []),
      ...(phase.requires ? [`- **Requires Capabilities:** ${phase.requires.join(', ')}`] : []),
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

const FAKE_LINT_ADAPTER: CapabilityAdapter = {
  id: 'fake-quality',
  dependencyBoundary: null,
  artifacts: [
    {
      id: 'fake.lint-tooling',
      location: { kind: 'path', path: 'fake-lint.config' },
      order: 1,
    },
  ],
  layers: [
    {
      kind: 'quality-test-tooling',
      capability: 'fake.lint-tooling',
      requires: [],
    },
  ],
  requiredRules: [],
  gateRequirements: [{ gate: 'lint', capabilities: ['fake.lint-tooling'] }],
};

function registry(fakeFirst: boolean): CapabilityAdapterRegistry {
  return fakeFirst
    ? { [FAKE_LINT_ADAPTER.id]: FAKE_LINT_ADAPTER, ...DEFAULT_CAPABILITY_ADAPTER_REGISTRY }
    : { ...DEFAULT_CAPABILITY_ADAPTER_REGISTRY, [FAKE_LINT_ADAPTER.id]: FAKE_LINT_ADAPTER };
}

function typeCheckState(
  ref: TicketCorpusRef,
  phaseId: string,
  scripts: Record<string, string>,
  availableArtifacts: string[] = []
) {
  const plan = resolvePhaseVerificationPlan({
    refs: [ref],
    ticketFile: ref.file,
    phaseId,
    scripts,
    availableArtifacts: new Set(availableArtifacts),
    mode: 'runtime',
  });
  assert.ok(plan);
  const gate = plan.gates.find((candidate) => candidate.name === 'type-check');
  assert.ok(gate);
  return { plan, gate };
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
    const plan = resolvePhaseVerificationPlan({
      refs: [ref],
      ticketFile: ref.file,
      phaseId: 'P1',
      scripts: { 'format:fix': 'prettier --write', 'lint:fix': 'eslint --fix .' },
      availableArtifacts: new Set(),
      mode: 'runtime',
    });
    assert.ok(plan);
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
    const plan = resolvePhaseVerificationPlan({
      refs: [ref],
      ticketFile: ref.file,
      phaseId: 'P1',
      scripts: { 'format:fix': 'prettier --write', 'lint:fix': 'eslint --fix' },
      availableArtifacts: new Set(),
      mode: 'runtime',
    });
    assert.ok(plan);
    assert.deepStrictEqual(
      plan.gates
        .filter((gate) => gate.name === 'fix')
        .map(({ required, state, command }) => ({ required, state, command })),
      [{ required: true, state: 'CONFIGURED', command: 'target-repair' }]
    );
  });

  it('keeps an unrelated missing repair gate optional for a non-owner setup phase', () => {
    const ref = ticket('NON-OWNER', [{ id: 'P1', kind: 'config', targets: ['package.json'] }]);
    const plan = resolvePhaseVerificationPlan({
      refs: [ref],
      ticketFile: ref.file,
      phaseId: 'P1',
      scripts: { 'format:fix': 'prettier --write', 'lint:fix': 'eslint --fix .' },
      availableArtifacts: new Set(),
      mode: 'runtime',
    });
    assert.ok(plan);
    assert.deepStrictEqual(
      plan.gates
        .filter((gate) => gate.name === 'fix')
        .map(({ required, state }) => ({ required, state })),
      [{ required: false, state: 'COMMAND_MISSING' }]
    );
  });

  it('maps owned tooling to its canonical gate through the adapter capability contract', () => {
    const ref = ticket('CAPABILITY-OWNER', [
      {
        id: 'P1',
        kind: 'config',
        adapter: 'typescript-quality',
        provides: ['typescript.eslint-lint-tooling'],
        targets: ['package.json'],
      },
    ]);
    const plan = resolvePhaseVerificationPlan({
      refs: [ref],
      ticketFile: ref.file,
      phaseId: 'P1',
      scripts: { lint: 'eslint .' },
      availableArtifacts: new Set(['package.json']),
      mode: 'runtime',
    });
    assert.ok(plan);
    assert.deepStrictEqual(
      plan.gates
        .filter((gate) => gate.required)
        .map(({ name, state, command }) => ({ name, state, command })),
      [{ name: 'lint', state: 'CONFIGURED', command: 'npm run lint' }]
    );
  });

  it('keeps a TypeScript lint owner on its declared adapter when another platform owns the same gate', () => {
    const ref = ticket('TS-LINT-OWNER', [
      {
        id: 'P1',
        kind: 'config',
        adapter: 'typescript-quality',
        provides: ['typescript.eslint-lint-tooling'],
        targets: ['package.json'],
      },
    ]);
    const plans = [true, false].map((fakeFirst) =>
      resolvePhaseVerificationPlan({
        refs: [ref],
        ticketFile: ref.file,
        phaseId: 'P1',
        scripts: { lint: 'eslint .' },
        availableArtifacts: new Set(['package.json', 'fake-lint.config']),
        registry: registry(fakeFirst),
        mode: 'runtime',
      })
    );
    for (const plan of plans) {
      assert.ok(plan);
      assert.deepStrictEqual(
        plan.gates
          .filter((gate) => gate.name === 'lint')
          .map(({ state, prerequisites, provider }) => ({ state, prerequisites, provider })),
        [
          {
            state: 'CONFIGURED',
            prerequisites: ['typescript.eslint-lint-tooling'],
            provider: 'TS-LINT-OWNER/P1',
          },
        ]
      );
    }
    assert.deepStrictEqual(plans[0], plans[1], 'registry insertion order is not semantic');
  });

  it('keeps a fake-platform lint owner on its own capability and artifact', () => {
    const ref = ticket('FAKE-LINT-OWNER', [
      {
        id: 'P1',
        kind: 'config',
        adapter: 'fake-quality',
        provides: ['fake.lint-tooling'],
        targets: ['fake-lint.config'],
      },
    ]);
    const plan = resolvePhaseVerificationPlan({
      refs: [ref],
      ticketFile: ref.file,
      phaseId: 'P1',
      scripts: { lint: 'fake-lint' },
      availableArtifacts: new Set(['fake-lint.config', 'package.json']),
      registry: registry(false),
      mode: 'runtime',
    });
    assert.ok(plan);
    assert.deepStrictEqual(
      plan.gates
        .filter((gate) => gate.name === 'lint')
        .map(({ state, prerequisites, provider }) => ({ state, prerequisites, provider })),
      [
        {
          state: 'CONFIGURED',
          prerequisites: ['fake.lint-tooling'],
          provider: 'FAKE-LINT-OWNER/P1',
        },
      ]
    );
  });

  it('selects a consumer prerequisite from its declared capability, not registry order', () => {
    const ref = ticket('TS-LINT-CONSUMER', [
      {
        id: 'P1',
        kind: 'config',
        adapter: 'typescript-quality',
        provides: ['typescript.eslint-lint-tooling'],
        targets: ['package.json'],
      },
      {
        id: 'P2',
        kind: 'config',
        deps: ['P1'],
        requires: ['typescript.eslint-lint-tooling'],
        readinessGates: ['lint'],
        targets: ['src/app.ts'],
      },
    ]);
    for (const fakeFirst of [true, false]) {
      const plan = resolvePhaseVerificationPlan({
        refs: [ref],
        ticketFile: ref.file,
        phaseId: 'P2',
        scripts: { lint: 'eslint .' },
        availableArtifacts: new Set(['package.json', 'fake-lint.config']),
        registry: registry(fakeFirst),
        mode: 'runtime',
      });
      assert.ok(plan);
      assert.deepStrictEqual(
        plan.gates
          .filter((gate) => gate.name === 'lint')
          .map(({ state, prerequisites, provider }) => ({ state, prerequisites, provider })),
        [
          {
            state: 'CONFIGURED',
            prerequisites: ['typescript.eslint-lint-tooling'],
            provider: 'TS-LINT-CONSUMER/P1',
          },
        ]
      );
    }
  });

  it('fails closed when two platform gate families are reachable but the consumer selects neither', () => {
    const ref = ticket('AMBIGUOUS-LINT', [
      {
        id: 'P1',
        kind: 'config',
        adapter: 'typescript-quality',
        provides: ['typescript.eslint-lint-tooling'],
        targets: ['package.json'],
      },
      {
        id: 'P2',
        kind: 'config',
        deps: ['P1'],
        adapter: 'fake-quality',
        provides: ['fake.lint-tooling'],
        targets: ['fake-lint.config'],
      },
      {
        id: 'P3',
        kind: 'config',
        deps: ['P2'],
        readinessGates: ['lint'],
        targets: ['src/app.ts'],
      },
    ]);
    const plan = resolvePhaseVerificationPlan({
      refs: [ref],
      ticketFile: ref.file,
      phaseId: 'P3',
      scripts: { lint: 'lint .' },
      availableArtifacts: new Set(['package.json', 'fake-lint.config']),
      registry: registry(true),
      mode: 'runtime',
    });
    assert.ok(plan);
    const lint = plan.gates.find((gate) => gate.name === 'lint');
    assert.ok(lint);
    assert.deepStrictEqual(
      { state: lint.state, provider: lint.provider },
      { state: 'PREREQUISITE_MISSING', provider: null }
    );
    assert.match(lint.next, /ambiguous/i);
  });

  it('derives the sole coverage producer from the ticket instead of a caller boolean', () => {
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
    const nonOwner = resolvePhaseVerificationPlan({
      refs: [ref],
      ticketFile: ref.file,
      phaseId: 'P1',
      scripts,
      availableArtifacts: new Set(),
      mode: 'runtime',
    });
    const owner = resolvePhaseVerificationPlan({
      refs: [ref],
      ticketFile: ref.file,
      phaseId: 'P2',
      scripts,
      availableArtifacts: new Set(),
      mode: 'runtime',
    });
    assert.ok(nonOwner && owner);
    assert.strictEqual(nonOwner.producesCoverage, false);
    assert.strictEqual(owner.producesCoverage, true);
    assert.ok(nonOwner.gates.some((gate) => gate.name === 'test'));
    assert.ok(!nonOwner.gates.some((gate) => gate.name === 'test:coverage'));
    assert.ok(owner.gates.some((gate) => gate.name === 'test:coverage'));
    assert.ok(!owner.gates.some((gate) => gate.name === 'test'));
  });

  it('resolves the accepted typecheck alias to its exact runnable command', () => {
    const ref = ticket('ALIAS', [{ id: 'P1', kind: 'impl', targets: ['src/app.ts'] }]);
    const { gate } = typeCheckState(ref, 'P1', { typecheck: 'tsc --noEmit' }, ['tsconfig.json']);
    assert.deepStrictEqual(
      { state: gate.state, command: gate.command },
      { state: 'CONFIGURED', command: 'npm run typecheck' }
    );
  });

  it('keeps a downstream compiler delegated even after its artifact and command materialize', () => {
    const ref = ticket('STABLE', [
      { id: 'P1', kind: 'config', targets: ['package.json'] },
      {
        id: 'P2',
        kind: 'config',
        deps: ['P1'],
        adapter: 'typescript',
        provides: ['typescript.compiler'],
        targets: ['tsconfig.json'],
      },
      { id: 'P3', kind: 'impl', deps: ['P2'], targets: ['src/app.ts'] },
    ]);
    const scripts = { 'type-check': 'tsc --noEmit' };
    const before = typeCheckState(ref, 'P1', scripts).gate;
    const after = typeCheckState(ref, 'P1', scripts, ['tsconfig.json']).gate;
    const owner = typeCheckState(ref, 'P2', scripts, ['tsconfig.json']).gate;
    const consumer = typeCheckState(ref, 'P3', scripts, ['tsconfig.json']).gate;
    assert.deepStrictEqual(
      [before.state, after.state, before.provider, after.provider],
      ['PREREQUISITE_PENDING', 'PREREQUISITE_PENDING', 'STABLE/P2', 'STABLE/P2']
    );
    assert.deepStrictEqual(
      [owner.state, owner.provider, consumer.state, consumer.provider],
      ['CONFIGURED', 'STABLE/P2', 'CONFIGURED', 'STABLE/P2']
    );
  });

  it('does not configure target repair when either runnable repair leaf is absent', () => {
    const ref = ticket('REPAIR', [{ id: 'P1', kind: 'impl', targets: ['src/app.ts'] }]);
    const oneLeaf = resolvePhaseVerificationPlan({
      refs: [ref],
      ticketFile: ref.file,
      phaseId: 'P1',
      scripts: { 'format:fix': 'prettier --write --' },
      availableArtifacts: new Set(),
      mode: 'runtime',
    });
    assert.ok(oneLeaf);
    assert.deepStrictEqual(
      oneLeaf.gates
        .filter((gate) => gate.name === 'fix')
        .map(({ state, command }) => ({
          state,
          command,
        })),
      [{ state: 'COMMAND_MISSING', command: null }]
    );
    const complete = resolvePhaseVerificationPlan({
      refs: [ref],
      ticketFile: ref.file,
      phaseId: 'P1',
      scripts: {
        'format:fix': 'prettier --write',
        'lint:fix': 'eslint --fix',
      },
      availableArtifacts: new Set(),
      mode: 'runtime',
    });
    assert.ok(complete);
    assert.deepStrictEqual(
      complete.gates
        .filter((gate) => gate.name === 'fix')
        .map(({ state, command }) => ({
          state,
          command,
        })),
      [{ state: 'CONFIGURED', command: 'target-repair' }]
    );
  });

  it('marks a setup gate pending when its exact compiler provider is downstream', () => {
    const ref = ticket('SETUP', [
      { id: 'P1', kind: 'config', targets: ['package.json'] },
      {
        id: 'P2',
        kind: 'config',
        deps: ['P1'],
        adapter: 'typescript',
        provides: ['typescript.compiler'],
        targets: ['tsconfig.json'],
      },
    ]);
    const { gate } = typeCheckState(ref, 'P1', { 'type-check': 'tsc --noEmit' });
    assert.deepStrictEqual(
      { state: gate.state, required: gate.required, provider: gate.provider },
      { state: 'PREREQUISITE_PENDING', required: false, provider: 'SETUP/P2' }
    );
  });

  it('fails closed with a typed missing-provider state', () => {
    const ref = ticket('MISSING', [{ id: 'P1', kind: 'impl', targets: ['src/app.ts'] }]);
    const { gate } = typeCheckState(ref, 'P1', { 'type-check': 'tsc --noEmit' });
    assert.deepStrictEqual(
      { state: gate.state, required: gate.required, provider: gate.provider },
      { state: 'PREREQUISITE_MISSING', required: true, provider: null }
    );
  });

  it('distinguishes a configured script from its missing compiler artifact', () => {
    const ref = ticket('UPSTREAM-MISSING', [
      {
        id: 'P1',
        kind: 'config',
        adapter: 'typescript',
        provides: ['typescript.compiler'],
        targets: ['tsconfig.json'],
      },
      { id: 'P2', kind: 'impl', deps: ['P1'], targets: ['src/app.ts'] },
    ]);
    const { gate } = typeCheckState(ref, 'P2', { 'type-check': 'tsc --noEmit' });
    assert.strictEqual(gate.state, 'PREREQUISITE_MISSING');
    assert.strictEqual(gate.provider, 'UPSTREAM-MISSING/P1');
  });

  it('reports COMMAND_MISSING after the compiler artifact exists', () => {
    const ref = ticket('NO-SCRIPT', [{ id: 'P1', kind: 'impl', targets: ['src/app.ts'] }]);
    const { gate } = typeCheckState(ref, 'P1', {}, ['tsconfig.json']);
    assert.strictEqual(gate.state, 'COMMAND_MISSING');
  });

  it('moves a current-phase prerequisite from pending to configured after materialization', () => {
    const ref = ticket('CURRENT', [
      {
        id: 'P1',
        kind: 'config',
        adapter: 'typescript',
        provides: ['typescript.compiler'],
        targets: ['tsconfig.json'],
      },
    ]);
    const before = typeCheckState(ref, 'P1', { 'type-check': 'tsc --noEmit' }).gate;
    const after = typeCheckState(ref, 'P1', { 'type-check': 'tsc --noEmit' }, ['tsconfig.json']);
    assert.strictEqual(before.state, 'PREREQUISITE_PENDING');
    assert.strictEqual(after.gate.state, 'CONFIGURED');
    assert.strictEqual(
      markPhaseVerificationProven(after.plan, new Set(['type-check'])).gates.find(
        (gate) => gate.name === 'type-check'
      )?.state,
      'PROVEN'
    );
  });
});
