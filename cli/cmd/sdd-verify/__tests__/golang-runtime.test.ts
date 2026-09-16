import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { golangPluginGates } from '../../../../shared/verify/presets/golang.ts';
import { runGate } from '../sdd-verify.cmd.ts';
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
      const runner: GateRunner = (_command, _args, options) => {
        writeFileSync(join(options?.cwd ?? root, 'generated.go'), 'package runtime\n');
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
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
