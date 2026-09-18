// @file: Unit tests for Swift gate planning and config-owned Xcode commands.
// @consumers: CI
// @tasks: V-11

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GatePlanOptions } from 'gennady/stack';
import type { SwiftProject, SwiftToolId } from '../swift-detect.logic.ts';
import type { SwiftScope } from '../swift-scope.logic.ts';

const { planSwiftGates, SWIFT_GATE_ORDER } = await import('../swift-plan.logic.ts');

/** @purpose Build deterministic tool facts without relying on the test host. */
function tools(available: readonly SwiftToolId[]): SwiftProject['tools'] {
  return Object.fromEntries(
    (['swift', 'swiftformat', 'swiftlint', 'xcodebuild'] as const).map((id) => [
      id,
      { id, bin: available.includes(id) ? `/tool/${id}` : null },
    ])
  ) as SwiftProject['tools'];
}

/** @purpose Build the project facts the planner consumes. */
function project(kind: SwiftProject['kind'], available: readonly SwiftToolId[]): SwiftProject {
  return {
    root: '/repo',
    kind,
    markers: kind === 'package' ? ['Package.swift'] : ['App.xcodeproj/project.pbxproj'],
    manifests: [],
    tools: tools(available),
    diagnostics: [],
  };
}

const scope: SwiftScope = {
  mode: 'files',
  note: 'one Swift file',
  details: { files: ['/repo/Sources/App.swift'], repoWide: false },
};
const options: GatePlanOptions = { pluginConfig: null };

describe('planSwiftGates', () => {
  it('emits the canonical gate order', () => {
    assert.deepEqual(
      planSwiftGates(project('package', ['swift']), scope, options).map((gate) => gate.id),
      [...SWIFT_GATE_ORDER]
    );
  });

  it('uses SwiftPM build/test defaults only for a detected root package', () => {
    const gates = planSwiftGates(project('package', ['swift', 'swiftformat']), scope, options);

    assert.deepEqual(gates.find((gate) => gate.id === 'build')?.argv, ['/tool/swift', 'build']);
    assert.deepEqual(gates.find((gate) => gate.id === 'test')?.argv, ['/tool/swift', 'test']);
    assert.deepEqual(gates.find((gate) => gate.id === 'format')?.fixer?.argv, [
      '/tool/swiftformat',
      '/repo/Sources/App.swift',
    ]);
  });

  it('keeps Xcode build/test unavailable until config supplies project-specific argv', () => {
    const gates = planSwiftGates(
      project('xcode', ['swift', 'swiftformat', 'xcodebuild']),
      scope,
      options
    );

    assert.match(gates.find((gate) => gate.id === 'build')?.skipped ?? '', /project-owned/);
    assert.match(gates.find((gate) => gate.id === 'test')?.skipped ?? '', /project-owned/);
    assert.deepEqual(gates.find((gate) => gate.id === 'build')?.argv, []);
    assert.ok(
      !gates.some((gate) => gate.argv.includes('-scheme')),
      'generic Swift code must not invent a workspace, scheme, or destination'
    );
  });

  it('distinguishes missing formatter config from optional lint', () => {
    const gates = planSwiftGates(project('package', ['swift']), scope, options);

    assert.match(gates.find((gate) => gate.id === 'format')?.skipped ?? '', /configure/);
    assert.match(gates.find((gate) => gate.id === 'lint')?.skipped ?? '', /optional/);
  });

  it('keeps swiftlint findings as FAIL and classifies other nonzero exits as environment', () => {
    const gates = planSwiftGates(project('package', ['swift', 'swiftlint']), scope, options);
    const outcome = (exitCode: number) => ({
      exitCode,
      timedOut: false,
      stdout: '',
      stderr: '',
      output: '',
    });
    for (const id of ['format', 'lint']) {
      const predicate = gates.find((gate) => gate.id === id)?.envFail?.[0];
      assert.ok(predicate, `${id} must carry SwiftLint's literal exit convention`);
      assert.equal(predicate(outcome(0)), false);
      assert.equal(predicate(outcome(2)), false);
      assert.equal(predicate(outcome(1)), true);
      assert.equal(predicate(outcome(70)), true);
    }
  });
});
