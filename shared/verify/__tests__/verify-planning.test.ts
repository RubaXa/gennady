// @file: Contract tests for fail-closed verify DAG validation and phase slicing.
// @consumers: CI
// @spec: CLI-VERIFY

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { VerifyPreset, VerifyStep } from '../plugin-api.ts';
import { selectPhase, validatePlan, VerifyPlanError } from '../plugin-api.ts';

type PlanningContext = {
  readonly node: VerifyPreset;
  readonly golang: VerifyPreset;
};

/** @purpose Build two plugin-owned presets with local and explicitly qualified dependencies. */
function createPlanningContext(): PlanningContext {
  const stepDefaults = {
    executor: 'local',
    effect: 'observe',
    requires: [],
    timeoutMs: 60_000,
    onFailure: 'stop-phase',
  } as const;
  const nodeSteps: VerifyStep[] = [
    {
      ...stepDefaults,
      id: 'type-check',
      plugin: 'node',
      tags: ['code'],
      needs: ['golang:build'],
    },
    {
      ...stepDefaults,
      id: 'unit',
      plugin: 'node',
      tags: ['test'],
      needs: ['type-check'],
    },
    {
      ...stepDefaults,
      id: 'integration',
      plugin: 'node',
      tags: ['test', 'slow'],
      needs: ['unit'],
    },
  ];
  const golangSteps: VerifyStep[] = [
    {
      ...stepDefaults,
      id: 'build',
      plugin: 'golang',
      tags: ['code'],
      needs: [],
    },
  ];

  return {
    node: {
      plugin: 'node',
      steps: nodeSteps,
      phases: { test: { include: ['test'], exclude: ['slow'] } },
      sddKinds: { test: 'test' },
      requirements: [],
      rules: [],
    },
    golang: {
      plugin: 'golang',
      steps: golangSteps,
      phases: { test: { include: ['code'] } },
      sddKinds: { test: 'test' },
      requirements: [],
      rules: [],
    },
  };
}

/** @purpose Assert a planner failure exposes both a typed code and actionable diagnostic. */
function expectPlanError(
  action: () => unknown,
  code: VerifyPlanError['code'],
  message: RegExp
): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof VerifyPlanError);
    assert.strictEqual(error.code, code);
    assert.match(error.message, message);
    return true;
  });
}

describe('verify planning', () => {
  it('qualifies local dependencies and preserves explicit cross-plugin references', () => {
    const { node, golang } = createPlanningContext();
    const plan = validatePlan([node, golang]);

    assert.deepStrictEqual(
      plan.steps.map((step) => [step.id, step.needs]),
      [
        ['golang:build', []],
        ['node:integration', ['node:unit']],
        ['node:type-check', ['golang:build']],
        ['node:unit', ['node:type-check']],
      ]
    );
  });

  it('selects phase seeds plus dependency closure in deterministic topological order', () => {
    const { node, golang } = createPlanningContext();

    assert.deepStrictEqual(
      selectPhase([node, golang], 'test').steps.map((step) => step.id),
      ['golang:build', 'node:type-check', 'node:unit']
    );
    assert.deepStrictEqual(
      selectPhase([golang, node], 'test').steps.map((step) => step.id),
      ['golang:build', 'node:type-check', 'node:unit']
    );
  });

  it('keeps an excluded-tag step when a selected seed requires it', () => {
    const { node, golang } = createPlanningContext();
    const nodeWithExcludedDependency: VerifyPreset = {
      ...node,
      steps: node.steps.map((step) =>
        step.id === 'unit'
          ? { ...step, tags: ['slow'] }
          : step.id === 'integration'
            ? { ...step, tags: ['test'] }
            : step
      ),
    };

    assert.deepStrictEqual(
      selectPhase([nodeWithExcludedDependency, golang], 'test').steps.map((step) => step.id),
      ['golang:build', 'node:type-check', 'node:unit', 'node:integration']
    );
  });

  it('lets exclude win when the same tag is both included and excluded', () => {
    const { golang } = createPlanningContext();
    const ambiguous: VerifyPreset = {
      ...golang,
      phases: { test: { include: ['code'], exclude: ['code'] } },
      sddKinds: { test: 'test' },
    };

    assert.deepStrictEqual(selectPhase([ambiguous], 'test').steps, []);
  });

  it('uses qualified ids to break ties across globally ready steps', () => {
    const { golang } = createPlanningContext();
    const alpha = { ...golang.steps[0]!, id: 'alpha', needs: ['zulu'] };
    const beta = { ...golang.steps[0]!, id: 'beta' };
    const zulu = { ...golang.steps[0]!, id: 'zulu' };
    const reversed: VerifyPreset = { ...golang, steps: [zulu, beta, alpha] };

    assert.deepStrictEqual(
      selectPhase([reversed], 'test').steps.map((step) => step.id),
      ['golang:beta', 'golang:zulu', 'golang:alpha']
    );
  });

  it('uses locale-independent code-unit order for qualified ids', () => {
    const { golang } = createPlanningContext();
    const zulu: VerifyPreset = {
      ...golang,
      plugin: 'z',
      steps: [{ ...golang.steps[0]!, plugin: 'z' }],
    };
    const umlaut: VerifyPreset = {
      ...golang,
      plugin: 'ä',
      steps: [{ ...golang.steps[0]!, plugin: 'ä' }],
    };

    assert.deepStrictEqual(
      selectPhase([umlaut, zulu], 'test').steps.map((step) => step.id),
      ['z:build', 'ä:build']
    );
  });

  it('rejects a malformed local step id', () => {
    const { node } = createPlanningContext();
    const malformed: VerifyPreset = {
      ...node,
      steps: [{ ...node.steps[0]!, id: 'bad:id' }],
    };

    expectPlanError(
      () => validatePlan([malformed]),
      'VERIFY_PLAN_INVALID_ID',
      /step id.*bad:id.*without ':'/
    );
  });

  it('rejects duplicate qualified step ids', () => {
    const { node } = createPlanningContext();
    const duplicate: VerifyPreset = {
      ...node,
      steps: [node.steps[0]!, node.steps[0]!],
    };

    expectPlanError(
      () => validatePlan([duplicate]),
      'VERIFY_PLAN_DUPLICATE_STEP',
      /node:type-check.*more than once/
    );
  });

  it('rejects duplicate plugin contributions before composing their steps', () => {
    const { node } = createPlanningContext();

    expectPlanError(
      () => validatePlan([node, { ...node }]),
      'VERIFY_PLAN_DUPLICATE_PLUGIN',
      /plugin "node".*more than one preset/
    );
  });

  it('rejects a step whose plugin differs from its owning preset', () => {
    const { node } = createPlanningContext();
    const mismatched: VerifyPreset = {
      ...node,
      steps: [{ ...node.steps[0]!, plugin: 'golang' }],
    };

    expectPlanError(
      () => validatePlan([mismatched]),
      'VERIFY_PLAN_PLUGIN_MISMATCH',
      /declares plugin "golang".*preset "node"/
    );
  });

  it('rejects a missing dependency', () => {
    const { node } = createPlanningContext();
    const missing: VerifyPreset = {
      ...node,
      steps: [{ ...node.steps[0]!, needs: ['absent'] }],
      phases: { test: { include: ['code'] } },
      sddKinds: { test: 'test' },
    };

    expectPlanError(
      () => validatePlan([missing]),
      'VERIFY_PLAN_MISSING_DEPENDENCY',
      /node:type-check.*node:absent/
    );
  });

  it('rejects a missing invalidation target', () => {
    const { node, golang } = createPlanningContext();
    const missing: VerifyPreset = {
      ...node,
      steps: node.steps.map((step) =>
        step.id === 'unit' ? { ...step, invalidates: ['absent'] } : step
      ),
    };

    expectPlanError(
      () => validatePlan([missing, golang]),
      'VERIFY_PLAN_MISSING_INVALIDATION_TARGET',
      /node:unit.*node:absent/
    );
  });

  it('rejects dependency cycles with the qualified cycle path', () => {
    const { node } = createPlanningContext();
    const cyclic: VerifyPreset = {
      ...node,
      steps: [
        { ...node.steps[0]!, needs: ['unit'] },
        { ...node.steps[1]!, needs: ['type-check'] },
      ],
      phases: { test: { include: ['test'] } },
      sddKinds: { test: 'test' },
    };

    expectPlanError(
      () => validatePlan([cyclic]),
      'VERIFY_PLAN_CYCLE',
      /node:type-check -> node:unit -> node:type-check/
    );
  });

  it('rejects an unknown include tag', () => {
    const { node } = createPlanningContext();
    const unknown: VerifyPreset = {
      ...node,
      phases: { test: { include: ['security'] } },
      sddKinds: { test: 'test' },
    };

    expectPlanError(
      () => validatePlan([unknown]),
      'VERIFY_PLAN_UNKNOWN_TAG',
      /node:test.*security.*known tags/
    );
  });

  it('rejects an unknown exclude tag', () => {
    const { node } = createPlanningContext();
    const unknown: VerifyPreset = {
      ...node,
      phases: { test: { include: ['test'], exclude: ['generated'] } },
      sddKinds: { test: 'test' },
    };

    expectPlanError(
      () => validatePlan([unknown]),
      'VERIFY_PLAN_UNKNOWN_TAG',
      /node:test.*generated.*known tags/
    );
  });

  it('rejects a phase absent from any composed preset', () => {
    const { node, golang } = createPlanningContext();

    expectPlanError(
      () => selectPhase([node, golang], 'release'),
      'VERIFY_PLAN_UNKNOWN_PHASE',
      /plugin "node".*phase "release".*known phases: test/
    );
  });
});
