// @file: Unit tests for the golang gate planner — non-mutating gates, module flags, timeouts, predicates.
// @consumers: CI
// @tasks: TSK-95

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { GatePlanOptions } from '../../../stack.types.ts';
import type { GoProject, GoTool, GoToolId } from '../golang-detect.logic.ts';
import type { GoScope } from '../golang-scope.logic.ts';

const { planGoGates, GO_GATE_ORDER } = await import('../golang-plan.logic.ts');

/** @purpose Build a resolved tool stub pointing at a fake absolute path. */
function tool(id: GoToolId, available = true): GoTool {
  return {
    id,
    bin: available ? `/usr/bin/${id}` : null,
    origin: available ? 'path' : 'missing',
    builtWithGo: null,
  };
}

/** @purpose Build a project fixture, overriding only the fields a test cares about. */
function project(overrides: Partial<GoProject> = {}): GoProject {
  return {
    root: '/repo',
    modules: [{ dir: '/repo', path: 'example.com/app', goVersion: '1.24' }],
    workspace: null,
    vendored: false,
    golangciConfig: null,
    missingGolangciConfigs: [],
    makeTargets: [],
    tools: { go: tool('go'), 'golangci-lint': tool('golangci-lint'), gofmt: tool('gofmt') },
    diagnostics: [],
    ...overrides,
  };
}

/** @purpose Build a scope fixture covering a single package. */
function scope(overrides: Partial<GoScope> = {}): GoScope {
  return {
    mode: 'files',
    packages: ['./internal/foo'],
    files: ['/repo/internal/foo/foo.go'],
    fmtTargets: ['internal/foo/foo.go'],
    note: 'test fixture',
    ...overrides,
  };
}

const defaultOptions: GatePlanOptions = { pluginConfig: null };

describe('planGoGates', () => {
  it('plans exactly the built-in gates: build, vet, fmt, lint, test — no tidy', () => {
    const ids = planGoGates(project(), scope(), defaultOptions).map((gate) => gate.id);

    assert.deepEqual(ids, [...GO_GATE_ORDER]);
    assert.ok(!ids.includes('tidy'), 'tidy is an extraGates recipe, not a built-in');
  });

  it('never plans the mutating `go fmt`; uses `gofmt -l` with the stdout contract', () => {
    const gates = planGoGates(project(), scope(), defaultOptions);
    const fmt = gates.find((gate) => gate.id === 'fmt');

    assert.deepEqual(fmt?.argv.slice(1, 2), ['-l']);
    assert.equal(fmt?.outputMeansFailure, true);
    for (const gate of gates) {
      assert.ok(
        !gate.argv.join(' ').includes('go fmt'),
        'no gate may invoke the rewriting `go fmt`'
      );
    }
  });

  it('gives every gate a mandatory positive timeout', () => {
    for (const gate of planGoGates(project(), scope(), defaultOptions)) {
      assert.ok(gate.timeoutMs > 0, `${gate.id} must carry a timeout`);
    }
  });

  it('renders the test gate timeout into go test -timeout', () => {
    const test = planGoGates(project(), scope(), defaultOptions).find((gate) => gate.id === 'test');

    assert.ok(test?.argv.includes('-timeout=600s'), `got: ${test?.argv.join(' ')}`);
    assert.equal(test?.timeoutMs, 600_000);
  });

  it('a config test-timeout override is rendered into the flag AND the gate timeout', () => {
    const gates = planGoGates(project(), scope(), {
      pluginConfig: { overrideGates: { test: { timeout: '90s' } } },
    });
    const test = gates.find((gate) => gate.id === 'test');

    assert.ok(test?.argv.includes('-timeout=90s'));
    assert.equal(test?.timeoutMs, 90_000);
  });

  it('adds -mod=vendor for a vendored module', () => {
    const gates = planGoGates(project({ vendored: true }), scope(), defaultOptions);

    assert.ok(gates.find((gate) => gate.id === 'build')?.argv.includes('-mod=vendor'));
    assert.ok(gates.find((gate) => gate.id === 'test')?.argv.includes('-mod=vendor'));
  });

  it('omits -mod=vendor under a go workspace, which rejects the combination', () => {
    const gates = planGoGates(
      project({ vendored: true, workspace: '/repo/go.work' }),
      scope(),
      defaultOptions
    );

    assert.ok(!gates.find((gate) => gate.id === 'build')?.argv.includes('-mod=vendor'));
  });

  it('passes the discovered lint config explicitly via -c', () => {
    const gates = planGoGates(
      project({ golangciConfig: '/repo/golangci.yml' }),
      scope(),
      defaultOptions
    );
    const lint = gates.find((gate) => gate.id === 'lint');

    assert.ok(lint?.argv.includes('-c'));
    assert.ok(lint?.argv.includes('/repo/golangci.yml'));
  });

  it('declares env-fail predicates: lint treats exit 2 as env-fail, exit 1 as a finding', () => {
    const lint = planGoGates(project(), scope(), defaultOptions).find((gate) => gate.id === 'lint');

    assert.ok((lint?.envFail?.length ?? 0) > 0);
    assert.equal(
      lint!.envFail!.some((p) => p(2, 'some internal error')),
      true
    );
    assert.equal(
      lint!.envFail!.some((p) => p(1, 'a.go:1: issue')),
      false
    );
  });

  it('declares env-fail predicates: build classifies panics and blocked module fetches', () => {
    const build = planGoGates(project(), scope(), defaultOptions).find(
      (gate) => gate.id === 'build'
    );

    assert.equal(
      build!.envFail!.some((p) => p(1, 'panic: boom\ngoroutine 1')),
      true
    );
    assert.equal(
      build!.envFail!.some((p) =>
        p(1, 'go: example.com/x@v1: Get "https://proxy.golang.org/x": Forbidden')
      ),
      true
    );
    assert.equal(
      build!.envFail!.some((p) => p(1, './x.go:1:1: syntax error')),
      false
    );
  });

  it('does not classify a panic in code under test as env-fail (review B4)', () => {
    const test = planGoGates(project(), scope(), defaultOptions).find((gate) => gate.id === 'test');

    assert.equal(
      test!.envFail!.some((p) => p(1, 'panic: runtime error: index out of range [3]')),
      false,
      'a panic in the code under test is a genuine finding'
    );
    assert.equal(
      test!.envFail!.some((p) =>
        p(1, 'go: example.com/x@v1: Get "https://proxy.example.com/x": Forbidden')
      ),
      true,
      'blocked module fetches stay environmental'
    );
  });

  it('skips lint with a stated reason when golangci-lint is unavailable', () => {
    const gates = planGoGates(
      project({
        tools: {
          go: tool('go'),
          'golangci-lint': tool('golangci-lint', false),
          gofmt: tool('gofmt'),
        },
      }),
      scope(),
      defaultOptions
    );
    const lint = gates.find((gate) => gate.id === 'lint');

    assert.notEqual(lint?.skipped, null);
    assert.deepEqual(lint?.argv, []);
  });

  it('skips package gates, but still formats, when the scope has no packages', () => {
    const gates = planGoGates(
      project(),
      scope({ packages: [], files: [], fmtTargets: ['internal/foo/foo.go'] }),
      defaultOptions
    );

    assert.notEqual(gates.find((gate) => gate.id === 'build')?.skipped, null);
    assert.equal(gates.find((gate) => gate.id === 'fmt')?.skipped, null);
  });

  it('skips every go-dependent gate when the toolchain is missing', () => {
    const gates = planGoGates(
      project({
        tools: {
          go: tool('go', false),
          'golangci-lint': tool('golangci-lint'),
          gofmt: tool('gofmt'),
        },
      }),
      scope(),
      defaultOptions
    );

    for (const gate of gates) {
      if (gate.id !== 'fmt') {
        assert.notEqual(gate.skipped, null, `${gate.id} must be skipped without a go toolchain`);
      }
    }
  });
});
