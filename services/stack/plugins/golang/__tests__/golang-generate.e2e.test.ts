// @file: End-to-end drift-gate test with the real go toolchain — skipped when go is absent.
// @consumers: CI
// @tasks: TSK-95

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { execFileTrimSafe } from '../../../../../shared/common/exec.ts';

const { detectGoProject } = await import('../golang-detect.logic.ts');
const { resolveGoScope } = await import('../golang-scope.logic.ts');
const { planGoGates } = await import('../golang-plan.logic.ts');
const { runVerify } = await import('../../../gate-runner.ts');

const GO_AVAILABLE = execFileTrimSafe('go', ['version'], os.tmpdir()).length > 0;

/** @purpose Create a committed go module whose //go:generate writes gen.out. */
function makeFixture(committedGenOut: string | null): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-generate-e2e-'));
  fs.writeFileSync(path.join(dir, 'go.mod'), 'module example.com/gen\n\ngo 1.21\n');
  fs.writeFileSync(
    path.join(dir, 'main.go'),
    'package main\n\n//go:generate sh -c "printf generated > gen.out"\n\nfunc main() {}\n'
  );
  if (committedGenOut !== null) {
    fs.writeFileSync(path.join(dir, 'gen.out'), committedGenOut);
  }
  const git = (...args: string[]): void => {
    execFileSync('git', ['-C', dir, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
      stdio: 'ignore',
    });
  };
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-qm', 'init');
  return dir;
}

/** @purpose Run the generate gate of the fixture through the real runner. */
function runGenerateGate(dir: string) {
  const project = detectGoProject(dir);
  const scope = resolveGoScope(project, { mode: 'files', targets: ['main.go'] });
  const gates = planGoGates(project, scope, { pluginConfig: null });
  const generate = gates.find((gate) => gate.id === 'generate');
  assert.equal(generate?.skipped, null, generate?.skipped ?? '');
  const report = runVerify(
    [
      {
        detection: { stack: 'golang', root: dir, summary: [], diagnostics: [], details: project },
        scope: { mode: 'files', note: 'e2e', details: scope },
        gates: [generate!],
      },
    ],
    []
  );
  return report.results[0]!;
}

describe('golang:generate drift gate — real go toolchain', { skip: !GO_AVAILABLE }, () => {
  it('passes when the committed generated file matches its generator', () => {
    const dir = makeFixture('generated');
    try {
      const result = runGenerateGate(dir);
      assert.equal(result.status, 'pass', result.output);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails with the drifted file when the committed generated file is stale — real tree untouched', () => {
    const dir = makeFixture('stale-content');
    try {
      const result = runGenerateGate(dir);
      assert.equal(result.status, 'fail');
      assert.match(result.output, /gen\.out/);
      assert.match(result.output, /gennady fix golang:generate/);
      assert.equal(fs.readFileSync(path.join(dir, 'gen.out'), 'utf-8'), 'stale-content');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when the generated file is missing entirely (uncommitted codegen)', () => {
    const dir = makeFixture(null);
    try {
      const result = runGenerateGate(dir);
      assert.equal(result.status, 'fail');
      assert.match(result.output, /gen\.out/);
      assert.equal(fs.existsSync(path.join(dir, 'gen.out')), false, 'real tree stays untouched');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
