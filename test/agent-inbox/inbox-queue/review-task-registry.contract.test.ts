// @file: Contract tests — dedup dependency exclusion supersede and session variants are exhaustive.
// @consumers: TSK-177 audit
// @tasks: TSK-177

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ReviewTaskRegistry,
  REVIEW_TASK_PRIORITY,
} from '../../../services/agent-inbox/modules/inbox-queue/registry/review-task-registry.ts';

type RegistryContext = { registry: ReviewTaskRegistry };

function createRegistryContext(): RegistryContext {
  return { registry: new ReviewTaskRegistry() };
}

describe('ReviewTaskRegistry', () => {
  it('dedup dependency exclusion supersede and session variants are exhaustive', () => {
    // invariant: every registered kind has exactly one definition; unknown kind fails closed;
    //   concrete glob-pattern kinds (track_foo, lens_bar, effect_resolve) resolve to the right entry
    const { registry } = createRegistryContext();

    // Known kinds resolve without error
    const plan = registry.resolveKind('plan');
    assert.strictEqual(plan.dependsOn[0], 'prepare_env');
    assert.strictEqual(plan.sessionPolicy, 'engine');
    assert.strictEqual(plan.priority, REVIEW_TASK_PRIORITY.pipeline);

    // Fan-out glob patterns resolve for any concrete suffix
    const trackLogic = registry.resolveKind('track_logic');
    assert.deepStrictEqual(trackLogic.parallelWith, ['track_*', 'lens_*']);
    assert.strictEqual(trackLogic.sessionPolicy, 'task');

    const lensSecurity = registry.resolveKind('lens_security');
    assert.deepStrictEqual(lensSecurity.dependsOn, ['enrich']);

    const effectResolve = registry.resolveKind('effect_resolve');
    assert.deepStrictEqual(effectResolve.exclusiveWith, ['effect_*']);
    assert.strictEqual(registry.isEffectKind('effect_resolve'), true);

    // Unknown kind fails closed — never returns a definition
    assert.throws(
      () => registry.resolveKind('unknown_kind_xyz'),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Unknown task kind/);
        return true;
      }
    );

    // Operator tasks have higher priority than event tasks which are higher than pipeline tasks
    const operatorTask = registry.resolveKind('fact_check');
    const eventTask = registry.resolveKind('delta_review');
    const pipelineTask = registry.resolveKind('prepare_env');
    assert.ok(operatorTask.priority > eventTask.priority);
    assert.ok(eventTask.priority > pipelineTask.priority);
    assert.strictEqual(operatorTask.priority, REVIEW_TASK_PRIORITY.operator);
    assert.strictEqual(eventTask.priority, REVIEW_TASK_PRIORITY.event);
    assert.strictEqual(pipelineTask.priority, REVIEW_TASK_PRIORITY.pipeline);

    // Session policies are exhaustive — all registered policies are present
    const kinds = registry.listKinds();
    const sessionPolicies = new Set(kinds.map((k) => registry.resolveKind(k).sessionPolicy));
    assert.ok(sessionPolicies.has('engine'));
    assert.ok(sessionPolicies.has('task'));
    assert.ok(sessionPolicies.has('new_fresh'));
    assert.ok(sessionPolicies.has('reuse_producer'));
    assert.ok(sessionPolicies.has('operator_chat'));

    // Exclusions: synthesize and delta_review are mutually exclusive
    const synthesize = registry.resolveKind('synthesize');
    assert.ok(synthesize.exclusiveWith.includes('delta_review'));
    const deltaReview = registry.resolveKind('delta_review');
    assert.ok(deltaReview.exclusiveWith.includes('synthesize'));

    // Dependency chain: gate_coverage depends on track_* and lens_* patterns
    const gateCoverage = registry.resolveKind('gate_coverage');
    assert.deepStrictEqual(gateCoverage.dependsOn, ['track_*', 'lens_*']);

    // isEffectKind: only effect_ prefixed kinds return true
    assert.strictEqual(registry.isEffectKind('plan'), false);
    assert.strictEqual(registry.isEffectKind('effect_any'), true);
  });

  it('computeDedupKey produces stable canonical key from kind and sorted params', () => {
    const { registry } = createRegistryContext();

    // Params ordering does not affect the key — canonical sort is applied
    const k1 = registry.computeDedupKey('plan', { b: 2, a: 1 });
    const k2 = registry.computeDedupKey('plan', { a: 1, b: 2 });
    assert.strictEqual(k1, k2);

    // Different kinds produce different keys even with same params
    const k3 = registry.computeDedupKey('enrich', { a: 1 });
    const k4 = registry.computeDedupKey('plan', { a: 1 });
    assert.notStrictEqual(k3, k4);

    // Different params produce different keys for the same kind
    const k5 = registry.computeDedupKey('plan', { a: 1 });
    const k6 = registry.computeDedupKey('plan', { a: 2 });
    assert.notStrictEqual(k5, k6);

    // Empty params are stable
    const k7 = registry.computeDedupKey('prepare_env', {});
    const k8 = registry.computeDedupKey('prepare_env', {});
    assert.strictEqual(k7, k8);
  });
});
