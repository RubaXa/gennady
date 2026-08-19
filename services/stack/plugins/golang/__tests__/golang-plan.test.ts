// @file: Unit tests for the golang gate planner — non-mutating gates, module flags, timeouts, predicates.
// @consumers: CI
// @tasks: TSK-95

import { describe, it, after } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import type { GatePlanOptions } from 'gennady/stack';
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

const fixtureDirs: string[] = [];
after(() => fixtureDirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

/** @purpose Materialize scope files on disk so directive detection can read them. */
function scopeWithFiles(contents: Record<string, string>): GoScope {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'golang-plan-gen-'));
  fixtureDirs.push(dir);
  const files = Object.entries(contents).map(([name, content]) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, content);
    return file;
  });
  return scope({ files, fmtTargets: files.map((file) => path.basename(file)) });
}

describe('planGoGates', () => {
  it('plans exactly the built-in gates in order: generate, build, vet, fmt, lint, test', () => {
    const ids = planGoGates(project(), scope(), defaultOptions).map((gate) => gate.id);

    assert.deepEqual(ids, [...GO_GATE_ORDER]);
    assert.equal(ids[0], 'generate');
    assert.ok(ids.indexOf('generate') < ids.indexOf('build'), 'codegen is a build prerequisite');
    assert.ok(!ids.includes('tidy'), 'tidy is an extraGates recipe, not a built-in');
  });

  it('plans a drift generate gate when the scope carries //go:generate directives', () => {
    const withDirective = scopeWithFiles({
      'a.go': 'package a\n\n//go:generate easyjson a.go\n',
    });
    const generate = planGoGates(project(), withDirective, defaultOptions).find(
      (gate) => gate.id === 'generate'
    );

    assert.equal(generate?.skipped, null);
    assert.equal(
      generate?.driftMeansFailure,
      true,
      'the generator mutates — its drift is the verdict'
    );
    assert.deepEqual(generate?.argv.slice(1, 2), ['generate']);
  });

  it('classifies a missing generator binary as env-fail with an install hint (D-STACK-012)', () => {
    const withDirective = scopeWithFiles({
      'a.go': 'package a\n\n//go:generate easyjson a.go\n',
    });
    const generate = planGoGates(project(), withDirective, defaultOptions).find(
      (gate) => gate.id === 'generate'
    );

    const matched = generate?.envFail?.find((predicate) =>
      predicate({
        exitCode: 1,
        timedOut: false,
        stdout: 'a.go:3: running "easyjson": exec: "easyjson": executable file not found in $PATH',
        stderr: '',
        output: 'a.go:3: running "easyjson": exec: "easyjson": executable file not found in $PATH',
      })
    );
    assert.ok(matched, 'a missing generator implicates the environment, not the code');
    assert.match(matched?.hint ?? '', /go install/);
  });

  it('skips the generate gate with a reason when no //go:generate directive is in scope', () => {
    const withoutDirective = scopeWithFiles({ 'a.go': 'package a\n' });
    const generate = planGoGates(project(), withoutDirective, defaultOptions).find(
      (gate) => gate.id === 'generate'
    );

    assert.match(generate?.skipped ?? '', /go:generate/);
  });

  it('discards build output so the gate cannot write a binary into the tree', () => {
    const build = planGoGates(project(), scope(), defaultOptions).find(
      (gate) => gate.id === 'build'
    );

    // `go build` writes the executable into cwd when exactly one main package is built,
    // which the run replica reports as a VIOLATION of the observe-only contract.
    const flags = build?.argv ?? [];
    assert.ok(flags.includes('-o'), `build must discard its output, got: ${flags.join(' ')}`);
    assert.equal(flags[flags.indexOf('-o') + 1], '/dev/null');
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
      lint!.envFail!.some((p) =>
        p({
          exitCode: 2,
          timedOut: false,
          stdout: 'some internal error',
          stderr: '',
          output: 'some internal error',
        })
      ),
      true
    );
    assert.equal(
      lint!.envFail!.some((p) =>
        p({
          exitCode: 1,
          timedOut: false,
          stdout: 'a.go:1: issue',
          stderr: '',
          output: 'a.go:1: issue',
        })
      ),
      false
    );
  });

  it('classifies a blocked module lookup reported on a source line, not only on a `go:` line', () => {
    // With -mod=mod, Go reports the environmental cause prefixed by a file position:
    //   main.go:3:8: cannot find module providing package x: module lookup disabled by GOPROXY=off
    // A `^go: ` anchor misses it, so a corporate proxy read as a code finding.
    const build = planGoGates(project(), scope(), defaultOptions).find(
      (gate) => gate.id === 'build'
    );
    const outcome = {
      exitCode: 1,
      timedOut: false,
      stdout: '',
      stderr:
        'main.go:3:8: cannot find module providing package golang.org/x/text/language: module lookup disabled by GOPROXY=off',
      output:
        'main.go:3:8: cannot find module providing package golang.org/x/text/language: module lookup disabled by GOPROXY=off',
    };
    assert.ok(
      build!.envFail!.some((predicate) => predicate(outcome)),
      'a blocked lookup is the environment, whatever line prefix Go chose'
    );
  });

  it('keeps a missing dependency declaration as a code finding', () => {
    // `no required module provides package` and `missing go.sum entry` are fixable IN THE REPO
    // (go get / go mod tidy + commit), so they must stay FAIL — the agent should act.
    const build = planGoGates(project(), scope(), defaultOptions).find(
      (gate) => gate.id === 'build'
    );
    for (const text of [
      'main.go:3:8: no required module provides package golang.org/x/text/language; to add it:',
      'main.go:3:8: missing go.sum entry for module providing package golang.org/x/text/language',
    ]) {
      const outcome = { exitCode: 1, timedOut: false, stdout: '', stderr: text, output: text };
      assert.ok(
        !build!.envFail!.some((predicate) => predicate(outcome)),
        `must stay FAIL: ${text.slice(0, 50)}`
      );
    }
  });

  it('declares env-fail predicates: build classifies panics and blocked module fetches', () => {
    const build = planGoGates(project(), scope(), defaultOptions).find(
      (gate) => gate.id === 'build'
    );

    assert.equal(
      build!.envFail!.some((p) =>
        p({
          exitCode: 1,
          timedOut: false,
          stdout: 'panic: boom\ngoroutine 1',
          stderr: '',
          output: 'panic: boom\ngoroutine 1',
        })
      ),
      true
    );
    assert.equal(
      build!.envFail!.some((p) =>
        p({
          exitCode: 1,
          timedOut: false,
          stdout: 'go: example.com/x@v1: Get "https://proxy.golang.org/x": Forbidden',
          stderr: '',
          output: 'go: example.com/x@v1: Get "https://proxy.golang.org/x": Forbidden',
        })
      ),
      true
    );
    assert.equal(
      build!.envFail!.some((p) =>
        p({
          exitCode: 1,
          timedOut: false,
          stdout: './x.go:1:1: syntax error',
          stderr: '',
          output: './x.go:1:1: syntax error',
        })
      ),
      false
    );
  });

  it('does not classify a panic in code under test as env-fail (review B4)', () => {
    const test = planGoGates(project(), scope(), defaultOptions).find((gate) => gate.id === 'test');

    assert.equal(
      test!.envFail!.some((p) =>
        p({
          exitCode: 1,
          timedOut: false,
          stdout: 'panic: runtime error: index out of range [3]',
          stderr: '',
          output: 'panic: runtime error: index out of range [3]',
        })
      ),
      false,
      'a panic in the code under test is a genuine finding'
    );
    assert.equal(
      test!.envFail!.some((p) =>
        p({
          exitCode: 1,
          timedOut: false,
          stdout: 'go: example.com/x@v1: Get "https://proxy.example.com/x": Forbidden',
          stderr: '',
          output: 'go: example.com/x@v1: Get "https://proxy.example.com/x": Forbidden',
        })
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
