// @file: Live-CLI behavior of sdd-verify's gate ladder — real `tsx cli/gennady.ts sdd-verify` runs
//   against fixture repos in every state the ladder must handle: nothing to check, a green partial
//   project, a broken foundation (halts), and a mutating repair gate that itself fails (a finding,
//   never a halt).
// @consumers: N/A
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, writeFileSync, mkdirSync, chmodSync, statSync } from 'node:fs';
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

  it('a deliberately masked exit code (`|| true`, --profile code) is OUT OF SCOPE — it runs and passes, not refused', () => {
    // Readiness catches classic bootstrap stubs (echo/`:`), NOT hand-crafted exit-code masks: we are
    // not in a hostile environment, and the net for genuine fictitiousness is the audit +
    // real-toolchain e2e. So a `|| true` script is treated as a real tool that happens to exit 0.
    const { root } = buildRepoFixture({
      scripts: {
        'type-check': noop(0),
        test: `${noop(1)} || true`,
      },
    });
    try {
      const r = runCli(['sdd-verify', '--profile', 'code'], root);
      assert.match(r.stdout, /✅ test\b/);
      assert.doesNotMatch(r.stdout, /⛔ test — обязательная ступень профиля «code»/);
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

  it('--profile full, test:coverage exit 0 that writes a FRESH report passes (% threshold is testcov/audit territory)', () => {
    const { root } = buildRepoFixture({
      scripts: {
        'type-check': noop(0),
        'test:coverage': coverageScript(0), // exits 0 AND writes coverage/coverage-final.json
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

  it('--profile full, test:coverage exit 0 but writes NO report is RED — single-producer freshness (reviewer C2)', () => {
    const { root } = buildRepoFixture({
      scripts: {
        'type-check': noop(0),
        'test:coverage': noop(0), // exits 0 without writing coverage/ — measured nothing
        lint: noop(0),
        format: noop(0),
      },
      gennadyInstalled: true,
    });
    try {
      const r = runCli(['sdd-verify', '--profile', 'full'], root);
      assert.notStrictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /❌ test:coverage/);
      assert.match(r.stdout, /не появился|не записал/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('FAIL-CLOSED: a stale report that cannot be deleted + a producer that writes nothing → RED (reviewer C2)', (t) => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      t.skip('root bypasses directory permissions — read-only guard is unobservable');
      return;
    }
    const { root } = buildRepoFixture({
      scripts: {
        'type-check': noop(0),
        'test:coverage': noop(0), // exits 0, writes nothing
        lint: noop(0),
        format: noop(0),
      },
      gennadyInstalled: true,
    });
    const covDir = join(root, 'coverage');
    mkdirSync(covDir, { recursive: true });
    const covFile = join(covDir, 'coverage-final.json');
    writeFileSync(covFile, '{"stale":true}', 'utf-8');
    const staleMtime = statSync(covFile).mtimeMs;
    chmodSync(covDir, 0o555); // read-only dir → the probe's rm of the file inside FAILS
    try {
      const r = runCli(['sdd-verify', '--profile', 'full'], root);
      // The stale report survives clear, but its mtime is unchanged → not fresh → gate is RED.
      assert.notStrictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /❌ test:coverage/);
      assert.strictEqual(statSync(covFile).mtimeMs, staleMtime, 'stale report must be untouched');
    } finally {
      chmodSync(covDir, 0o755);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('CHAIN: an EMPTY-but-fresh report passes sdd-verify freshness but the full chain fails at testcov (C2 division)', () => {
    // Division of responsibility: sdd-verify proves the report is from THIS run (fresh); testcov
    // proves it is VALID + meets the threshold. An empty `{}` report is fresh (probe passes) yet has
    // no data, so `testcov --min` reds it — neither step alone is the whole guarantee.
    const { root } = buildRepoFixture({
      scripts: {
        'type-check': noop(0),
        'test:coverage': coverageScript(0), // writes a FRESH but empty `{}` coverage-final.json
      },
      gennadyInstalled: true,
      files: { 'src/thing.ts': 'export const x = 1;\n' },
    });
    try {
      // sdd-verify: probe sees a fresh report appear → test:coverage passes.
      const verify = runCli(['sdd-verify', '--profile', 'test'], root);
      assert.strictEqual(verify.exitCode, 0, verify.stdout + verify.stderr);
      assert.match(verify.stdout, /✅ test:coverage/);
      // testcov: the `{}` report has no data for the file → threshold gate is RED.
      const cov = runCli(['testcov', '--min=80', 'src/thing.ts'], root);
      assert.notStrictEqual(cov.exitCode, 0, cov.stdout + cov.stderr);
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
