import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { golangPluginGates } from '../../../../shared/verify/presets/golang.ts';
import { defaultAsyncRunner, runGate } from '../sdd-verify.cmd.ts';
import type { Gate, GateRunner } from '../sdd-verify.types.ts';

function cliGate(gate: ReturnType<typeof golangPluginGates>[number]): Gate {
  return {
    name: gate.id,
    stack: gate.stack,
    argv: gate.argv,
    cwd: gate.cwd,
    env: gate.env,
    timeoutMs: gate.timeoutMs,
    envFail: gate.envFail,
    requires: gate.requires,
    outputMeansFailure: gate.outputMeansFailure,
    driftMeansFailure: gate.driftMeansFailure,
    skipped: gate.skipped,
    mutates: false,
    haltsOnFailure: true,
  };
}

describe('Go V-09 runtime semantics', () => {
  it('classifies module fetch failures as environment failures', async () => {
    const root = mkdtempSync(join(tmpdir(), 'go-runtime-env-'));
    try {
      writeFileSync(join(root, 'go.mod'), 'module example.com/runtime\n\ngo 1.22\n');
      writeFileSync(join(root, 'main.go'), 'package runtime\n');
      const build = golangPluginGates(root, null).find((gate) => gate.id === 'build');
      assert.ok(build);
      const runner: GateRunner = () => ({
        exitCode: 1,
        output: 'go: example.com/missing: dial tcp: no such host',
      });
      assert.equal((await runGate(runner, cliGate(build), 'build')).status, 'env-fail');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('treats gofmt stdout as a failure even with exit 0', async () => {
    const root = mkdtempSync(join(tmpdir(), 'go-runtime-fmt-'));
    try {
      writeFileSync(join(root, 'go.mod'), 'module example.com/runtime\n\ngo 1.22\n');
      writeFileSync(join(root, 'main.go'), 'package runtime\n');
      const fmt = golangPluginGates(root, null).find((gate) => gate.id === 'fmt');
      assert.ok(fmt);
      const runner: GateRunner = () => ({
        exitCode: 0,
        output: 'main.go\n',
        stdout: 'main.go\n',
        stderr: '',
      });
      assert.equal((await runGate(runner, cliGate(fmt), 'fmt')).status, 'fail');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('detects generate drift in a disposable replica and leaves the source tree unchanged', async () => {
    const root = mkdtempSync(join(tmpdir(), 'go-runtime-drift-'));
    try {
      writeFileSync(join(root, 'go.mod'), 'module example.com/runtime\n\ngo 1.22\n');
      writeFileSync(join(root, 'main.go'), '//go:generate generator\npackage runtime\n');
      const generate = golangPluginGates(root, null).find((gate) => gate.id === 'generate');
      assert.ok(generate);
      let replica = '';
      const runner: GateRunner = (_command, _args, options) => {
        replica = options?.cwd ?? '';
        writeFileSync(join(replica || root, 'generated.go'), 'package runtime\n');
        return { exitCode: 0, output: '' };
      };
      const result = await runGate(runner, cliGate(generate), 'generate');
      assert.equal(result.status, 'fail');
      assert.match(result.output, /ephemeral replica/);
      assert.equal(
        readFileSync(join(root, 'main.go'), 'utf-8'),
        '//go:generate generator\npackage runtime\n'
      );
      assert.throws(() => readFileSync(join(root, 'generated.go')));
      assert.ok(replica);
      assert.equal(existsSync(replica), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('runs real go generate in the replica and fails only because that replica drifted', async () => {
    const created = mkdtempSync(join(realpathSync(tmpdir()), 'go-runtime-real-drift-'));
    const root = realpathSync(created);
    const previousCwd = process.cwd();
    try {
      writeFileSync(join(root, 'go.mod'), 'module example.com/runtime\n\ngo 1.22\n');
      const source = '//go:generate sh -c "echo package runtime > generated.go"\npackage runtime\n';
      writeFileSync(join(root, 'main.go'), source);
      const generate = golangPluginGates(root, null).find((gate) => gate.id === 'generate');
      assert.ok(generate);
      assert.equal(generate.skipped, null);

      // Match the production CLI shape where process.cwd() and gate.cwd are the same canonical root.
      process.chdir(root);
      const result = await runGate(defaultAsyncRunner, cliGate(generate), 'generate');

      assert.equal(result.status, 'fail');
      assert.equal(result.exitCode, 0, result.output);
      assert.match(result.output, /gate changed files in its ephemeral replica/);
      assert.doesNotMatch(result.output, /unknown command/);
      assert.equal(readFileSync(join(root, 'main.go'), 'utf-8'), source);
      assert.equal(existsSync(join(root, 'generated.go')), false);
    } finally {
      process.chdir(previousCwd);
      rmSync(root, { recursive: true, force: true });
    }
  });
});
