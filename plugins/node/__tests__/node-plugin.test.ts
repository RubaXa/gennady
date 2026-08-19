// @file: Unit tests for the node plugin — existence detection, script classification, gate planning.
// @consumers: CI
// @tasks: TSK-95

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { nodePlugin } = await import('../node-plugin.ts');
const { classifyNpmScripts } = await import('../classify-npm-scripts.ts');

/** @purpose Create a temp dir with a package.json, run fn, clean up. */
function withPackageJson<T>(content: object | string | null, fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-plugin-'));
  try {
    if (content !== null) {
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        typeof content === 'string' ? content : JSON.stringify(content)
      );
    }
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('classifyNpmScripts', () => {
  it('selects one script per class with sensible priorities', () => {
    const selected = classifyNpmScripts({
      'type-check': 'tsc --noEmit',
      lint: 'eslint .',
      'lint:contracts': 'tsx cli/gennady.ts lint --autofix cli/',
      test: 'node --import tsx --test',
      'format:check': 'prettier --check .',
    });

    assert.equal(selected.typecheck, 'type-check');
    assert.equal(selected.gennady, 'lint:contracts');
    assert.equal(selected.lint, 'lint');
    assert.equal(selected.test, 'test');
    assert.equal(selected.format, 'format:check');
  });

  it('excludes watch-like scripts', () => {
    const selected = classifyNpmScripts({ 'test:watch': 'vitest --watch' });
    assert.equal(selected.test, undefined);
  });

  it('excludes bare `watch` in a script body (review B8)', () => {
    const selected = classifyNpmScripts({ test: 'vitest watch' });
    assert.equal(selected.test, undefined);
  });

  it('excludes umbrella scripts that chain multiple classes', () => {
    const selected = classifyNpmScripts({ ci: 'tsc --noEmit && eslint . && vitest run' });
    assert.deepEqual(selected, {});
  });

  it('prefers format:check over the potentially mutating format script', () => {
    const selected = classifyNpmScripts({
      format: 'prettier --write .',
      'format:check': 'prettier --check .',
    });
    assert.equal(selected.format, 'format:check');
  });
});

describe('nodePlugin', () => {
  it('does not detect a directory without package.json', () => {
    withPackageJson(null, (dir) => {
      assert.equal(nodePlugin.detect(dir), null);
    });
  });

  it('declares node_modules as an environment link for the run replica (D-STACK-013)', () => {
    assert.ok(
      nodePlugin.sandboxLinks?.includes('node_modules'),
      'npm scripts resolve from node_modules/.bin — without the link no gate can run in the replica'
    );
  });

  it('detects a broken package.json — with a diagnostic, not an un-detect (spec §3)', () => {
    withPackageJson('{broken', (dir) => {
      const detection = nodePlugin.detect(dir);
      assert.notEqual(detection, null);
      assert.equal(detection!.diagnostics[0]?.code, 'NODE_INVALID_MANIFEST');

      const scope = nodePlugin.verify.resolveScope(detection!, { mode: 'changed', targets: [] });
      assert.deepEqual(nodePlugin.verify.planGates(detection!, scope, { pluginConfig: null }), []);
    });
  });

  it('plans npm-run gates for classified scripts, in class order, with mandatory timeouts', () => {
    withPackageJson(
      {
        name: 'x',
        scripts: { test: 'vitest run', lint: 'eslint .', 'type-check': 'tsc --noEmit' },
      },
      (dir) => {
        const detection = nodePlugin.detect(dir)!;
        const scope = nodePlugin.verify.resolveScope(detection, { mode: 'changed', targets: [] });
        const gates = nodePlugin.verify.planGates(detection, scope, { pluginConfig: null });

        assert.deepEqual(
          gates.map((gate) => gate.id),
          ['typecheck', 'lint', 'test']
        );
        assert.deepEqual(gates[0]?.argv, ['npm', 'run', 'type-check']);
        assert.ok(gates.every((gate) => gate.stack === 'node' && gate.skipped === null));
        assert.ok(gates.every((gate) => gate.timeoutMs > 0));
      }
    );
  });

  it('plans a mutating script as a visible skip, never an executable gate (review B3)', () => {
    withPackageJson(
      { name: 'x', scripts: { 'lint:contracts': 'tsx cli/gennady.ts lint --autofix cli/' } },
      (dir) => {
        const detection = nodePlugin.detect(dir)!;
        const scope = nodePlugin.verify.resolveScope(detection, { mode: 'changed', targets: [] });
        const gates = nodePlugin.verify.planGates(detection, scope, { pluginConfig: null });
        const gennady = gates.find((gate) => gate.id === 'gennady');

        assert.notEqual(gennady, undefined);
        assert.match(gennady?.skipped ?? '', /mutat/i);
        assert.deepEqual(gennady?.argv, []);
      }
    );
  });

  it('diagnoses a package.json with no classifiable verification scripts', () => {
    withPackageJson({ name: 'x', scripts: { start: 'node server.js' } }, (dir) => {
      const detection = nodePlugin.detect(dir)!;
      assert.equal(detection.diagnostics[0]?.code, 'NODE_NO_SCRIPTS');
    });
  });

  it('keeps gates repo-wide regardless of positional targets (D-STACK-006)', () => {
    withPackageJson({ name: 'x', scripts: { test: 'vitest run' } }, (dir) => {
      const detection = nodePlugin.detect(dir)!;
      const scope = nodePlugin.verify.resolveScope(detection, {
        mode: 'files',
        targets: ['src/a.ts'],
      });
      const gates = nodePlugin.verify.planGates(detection, scope, { pluginConfig: null });

      assert.match(scope.note, /repo-wide/);
      assert.equal(gates.length, 1);
    });
  });
});
