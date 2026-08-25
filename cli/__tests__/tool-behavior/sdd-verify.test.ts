// @file: Live-CLI behavior of sdd-verify's gate ladder — real `tsx cli/gennady.ts sdd-verify` runs
//   against fixture repos in every state the ladder must handle: nothing to check, a green partial
//   project, a broken foundation (halts), and a mutating repair gate that itself fails (a finding,
//   never a halt).
// @consumers: N/A
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { buildRepoFixture, coverageScript, markerScript, noop } from './fixture.ts';
import { runCli } from './run-cli.ts';

describe('sdd-verify — live gate ladder', () => {
  it('empty project (--profile setup): every rung is honestly skipped, exit 0', () => {
    const { root } = buildRepoFixture({ scripts: {} });
    try {
      const r = runCli(['sdd-verify', '--profile', 'setup'], root);
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /ALL PASS \(0\/6\)/);
      for (const gate of ['type-check', 'test', 'format:fix', 'lint:fix', 'lint', 'format']) {
        assert.match(
          r.stdout,
          new RegExp(`⏭ ${gate} — скрипта нет в package\\.json, пропущено`),
          `expected a skipped ⏭ line for ${gate}`
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('type-check present, no test script (--profile code): test is a REQUIRED rung — red ⛔ verdict, not a green skip', () => {
    const { root } = buildRepoFixture({ scripts: { 'type-check': noop(0) } });
    try {
      const r = runCli(['sdd-verify', '--profile', 'code'], root);
      assert.notStrictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /✅ type-check/);
      assert.match(r.stdout, /⛔ test — обязательная ступень профиля «code»/);
      assert.match(r.stdout, /GATE_QUEUE/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('echo-stub test script (--profile code): a stub that exits 0 is refused like a missing script', () => {
    const { root } = buildRepoFixture({
      scripts: {
        'type-check': noop(0),
        test: "echo 'TODO: настроить инфраструктуру (test runner)' >&2",
      },
    });
    try {
      const r = runCli(['sdd-verify', '--profile', 'code'], root);
      assert.notStrictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /⛔ test — обязательная ступень профиля «code»/);
      assert.match(r.stdout, /заглушка \(no-op\)/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('broken types (--profile code): ladder halts at type-check, format:fix never runs', () => {
    const { root } = buildRepoFixture({
      scripts: {
        'type-check': noop(1),
        test: noop(0),
        'format:fix': markerScript('FORMAT_FIX_RAN', 0),
      },
    });
    try {
      const r = runCli(['sdd-verify', '--profile', 'code'], root);
      assert.notStrictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /⛔ лестница остановлена на «type-check»/);
      assert.ok(
        !existsSync(join(root, 'FORMAT_FIX_RAN')),
        'format:fix must never run once type-check has halted the ladder'
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('broken tests (--profile code): type-check passes, ladder halts at test, no repair runs', () => {
    const { root } = buildRepoFixture({
      scripts: {
        'type-check': noop(0),
        test: noop(1),
        'format:fix': markerScript('FORMAT_FIX_RAN', 0),
      },
    });
    try {
      const r = runCli(['sdd-verify', '--profile', 'code'], root);
      assert.notStrictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /✅ type-check/);
      assert.match(r.stdout, /⛔ лестница остановлена на «test»/);
      assert.ok(
        !existsSync(join(root, 'FORMAT_FIX_RAN')),
        'format:fix must never run once test has halted the ladder'
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('repair gate itself fails (--profile code): ladder does not halt, later rungs still run, verdict is red', () => {
    const { root } = buildRepoFixture({
      scripts: {
        'type-check': noop(0),
        test: noop(0),
        'format:fix': markerScript('FORMAT_FIX_RAN', 1),
        'lint:fix': noop(0),
        lint: noop(0),
        format: noop(0),
      },
    });
    try {
      const r = runCli(['sdd-verify', '--profile', 'code'], root);
      assert.notStrictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.ok(
        existsSync(join(root, 'FORMAT_FIX_RAN')),
        'format:fix must have actually run (and mutated) despite failing'
      );
      assert.match(r.stdout, /🔧 format:fix — exit 1 .* — находка, не останавливает лестницу/);
      assert.match(r.stdout, /✅ lint\b/);
      assert.match(r.stdout, /✅ format\b/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('required script with its exit code silenced (--profile code): the tool looks real and can never fail — refused', () => {
    const { root } = buildRepoFixture({
      scripts: {
        'type-check': noop(0),
        // A real command whose failure is swallowed: it RUNS, it just cannot ever report red.
        test: `${noop(1)} || true`,
      },
    });
    try {
      const r = runCli(['sdd-verify', '--profile', 'code'], root);
      assert.notStrictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /⛔ test — обязательная ступень профиля «code»/);
      assert.match(r.stdout, /заглушён exit code/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('--profile full never mutates: format:fix is not in the ladder, marker absent, exit 0 when the rest is green', () => {
    const { root } = buildRepoFixture({
      scripts: {
        'type-check': noop(0),
        'test:coverage': coverageScript(0),
        lint: noop(0),
        format: noop(0),
        'format:fix': markerScript('FORMAT_FIX_RAN', 0),
      },
      gennadyInstalled: true,
    });
    try {
      const r = runCli(['sdd-verify', '--profile', 'full'], root);
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /ALL PASS/);
      assert.ok(
        !existsSync(join(root, 'FORMAT_FIX_RAN')),
        'full profile must never run a mutating gate, even one declared in package.json'
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('--profile full, test:coverage exit 0 passes on the exit code alone — the % threshold is testcov/audit territory, not this gate', () => {
    const { root } = buildRepoFixture({
      scripts: {
        'type-check': noop(0),
        'test:coverage': noop(0), // exits 0 without writing coverage/ — sdd-verify only runs the report step
        lint: noop(0),
        format: noop(0),
      },
      gennadyInstalled: true,
    });
    try {
      const r = runCli(['sdd-verify', '--profile', 'full'], root);
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /ALL PASS/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('mutating rung actually rewrites a file (--profile code): foundation re-runs once over the repaired state', () => {
    const { root } = buildRepoFixture({
      scripts: {
        'type-check': markerScript('TYPE_CHECK_RAN', 0),
        test: noop(0),
        // format:fix mutates the tree for real — rewrites a source file
        'format:fix': `node -e "require('fs').writeFileSync('src.ts','fixed');process.exit(0)"`,
        'lint:fix': noop(0),
        lint: noop(0),
        format: noop(0),
      },
      files: { 'src.ts': 'unformatted' },
    });
    try {
      const r = runCli(['sdd-verify', '--profile', 'code'], root);
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /type-check \(re-run после мутаций\)/);
      assert.match(r.stdout, /test \(re-run после мутаций\)/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
