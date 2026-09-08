// @file: Unit tests for Go project detection — modules, vendoring, lint config, diagnostics.
// @consumers: CI
// @tasks: TSK-95

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { detectGoProject } = await import('../golang-detect.logic.ts');

let root: string;

/** @purpose Write a file inside the fixture, creating parent directories as needed. */
function write(relativePath: string, content: string): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'golang-detect-'));
});

after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('detectGoProject', () => {
  it('returns no modules for a directory without go.mod', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'golang-empty-'));
    try {
      assert.equal(detectGoProject(empty).modules.length, 0);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  it('parses module path and go directive', () => {
    write('go.mod', 'module example.com/app\n\ngo 1.24.7\n');

    const project = detectGoProject(root);

    assert.equal(project.modules[0]?.path, 'example.com/app');
    assert.equal(project.modules[0]?.goVersion, '1.24.7');
  });

  it('detects vendoring from vendor/modules.txt', () => {
    assert.equal(detectGoProject(root).vendored, false);

    write('vendor/modules.txt', '# example.com/dep v1.0.0\n');

    assert.equal(detectGoProject(root).vendored, true);
  });

  it('finds a non-dot golangci.yml, which golangci-lint does not auto-discover', () => {
    write('golangci.yml', 'linters:\n  default: none\n');

    assert.equal(path.basename(detectGoProject(root).golangciConfig ?? ''), 'golangci.yml');
  });

  it('prefers a dot-prefixed config over the bare name', () => {
    write('.golangci.yml', 'linters:\n  default: none\n');

    assert.equal(path.basename(detectGoProject(root).golangciConfig ?? ''), '.golangci.yml');
  });

  it('ignores go.mod under vendor/ and testdata/', () => {
    write('vendor/example.com/dep/go.mod', 'module example.com/dep\n\ngo 1.20\n');
    write('testdata/fixture/go.mod', 'module example.com/fixture\n\ngo 1.20\n');

    const dirs = detectGoProject(root).modules.map((module) => module.dir);

    assert.ok(!dirs.some((dir) => dir.includes('vendor')));
    assert.ok(!dirs.some((dir) => dir.includes('testdata')));
  });

  it('discovers nested modules and reports them as a diagnostic', () => {
    write('scripts/go.mod', 'module example.com/app/scripts\n\ngo 1.24\n');

    const project = detectGoProject(root);

    assert.equal(project.modules.length, 2);
    assert.ok(project.diagnostics.some((diagnostic) => diagnostic.code === 'NESTED_MODULES'));
  });

  it('extracts only verification-shaped make targets', () => {
    write(
      'Makefile',
      [
        '.PHONY: build',
        'build:',
        '\tgo build ./...',
        '',
        'lint:',
        '\tgolangci-lint run',
        '',
        'test:',
        '\tgo test ./...',
      ].join('\n')
    );

    const targets = detectGoProject(root).makeTargets;

    assert.ok(targets.includes('lint'));
    assert.ok(targets.includes('test'));
    assert.ok(!targets.includes('build'));
  });

  it('reports a Makefile-referenced golangci config that is absent from the checkout', () => {
    const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'golang-missing-'));
    try {
      fs.writeFileSync(path.join(isolated, 'go.mod'), 'module example.com/x\n\ngo 1.24\n');
      fs.writeFileSync(
        path.join(isolated, 'Makefile'),
        'lint:\n\tgolangci-lint run --config=.golangci.yml ./...\n'
      );

      assert.deepEqual(detectGoProject(isolated).missingGolangciConfigs, ['.golangci.yml']);
    } finally {
      fs.rmSync(isolated, { recursive: true, force: true });
    }
  });

  it('does not mistake unrelated compiler flags for golangci config references', () => {
    const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'golang-cflags-'));
    try {
      fs.writeFileSync(path.join(isolated, 'go.mod'), 'module example.com/x\n\ngo 1.24\n');
      fs.writeFileSync(
        path.join(isolated, 'Makefile'),
        'build:\n\tgcc -c foo.c -L/usr/local/lib/ -o a.out\n'
      );

      assert.deepEqual(detectGoProject(isolated).missingGolangciConfigs, []);
    } finally {
      fs.rmSync(isolated, { recursive: true, force: true });
    }
  });
});

describe('TOOLCHAIN_MISSING guard', () => {
  /** @purpose A repo plus a PATH holding only the named fake executables. */
  function withTools<T>(tools: readonly string[], fn: (root: string) => T): T {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-toolchain-'));
    const bin = path.join(dir, 'fakebin');
    const root = path.join(dir, 'repo');
    fs.mkdirSync(bin);
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, 'go.mod'), 'module example.com/t\n\ngo 1.21\n');
    for (const tool of tools) {
      const file = path.join(bin, tool);
      fs.writeFileSync(file, '');
      fs.chmodSync(file, 0o755);
    }
    const previous = process.env['PATH'];
    process.env['PATH'] = bin;
    try {
      return fn(root);
    } finally {
      process.env['PATH'] = previous;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  const codesFor = (tools: readonly string[]): string[] =>
    withTools(tools, (root) => detectGoProject(root).diagnostics.map((d) => d.code));

  it('fires when go is missing, whatever else is installed', () => {
    // The guard was wired to golangci-lint, so this repo produced no diagnostic at all and a run
    // could report ALL_GATES_PASS on gofmt alone — the exact false green it exists to prevent.
    assert.ok(
      codesFor(['golangci-lint', 'gofmt']).includes('TOOLCHAIN_MISSING'),
      'no go means no verdict about Go code'
    );
  });

  it('stays quiet when go is present but golangci-lint is not', () => {
    // The common case: the linter is heavy and not installed everywhere. Claiming "go was not
    // found" here blocked the whole run while build, vet and test could have passed.
    assert.deepStrictEqual(codesFor(['go']), []);
  });

  it('stays quiet when both are present', () => {
    assert.deepStrictEqual(codesFor(['go', 'golangci-lint']), []);
  });
});
