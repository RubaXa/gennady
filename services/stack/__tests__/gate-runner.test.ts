// @file: Unit tests for the gate runner — RUN-ALL, stdout contract, env-fail predicates, report format.
// @consumers: CI
// @tasks: TSK-95

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Gate, StackDiagnostic, StackRun } from '../stack.types.ts';

const { runVerify, runFix, formatVerifyReport, exitCodeMatches, outputMatches, streamMatches } =
  await import('../gate-runner.ts');

// Small one-commit repo shared by the plain-gate tests: every gate runs in a run
// replica (D-STACK-013), so cwd must never be the (large) gennady checkout itself.
const BASE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-base-'));
fs.writeFileSync(path.join(BASE_DIR, 'README.md'), 'fixture\n');
execFileSync('git', ['-C', BASE_DIR, 'init', '-q', '-b', 'main'], { stdio: 'ignore' });
execFileSync('git', ['-C', BASE_DIR, 'add', '-A'], { stdio: 'ignore' });
execFileSync(
  'git',
  ['-C', BASE_DIR, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'],
  { stdio: 'ignore' }
);
after(() => fs.rmSync(BASE_DIR, { recursive: true, force: true }));

/** @purpose Build a gate that runs a shell snippet through `sh -c`. */
function shellGate(id: string, script: string, extra: Partial<Gate> = {}): Gate {
  return {
    id,
    stack: 'golang',
    label: id,
    argv: ['/bin/sh', '-c', script],
    cwd: BASE_DIR,
    timeoutMs: 30_000,
    outputMeansFailure: false,
    skipped: null,
    ...extra,
  };
}

/** @purpose Wrap gates into a single-stack run fixture. */
function runOf(gates: Gate[]): StackRun {
  return {
    detection: {
      stack: 'golang',
      root: BASE_DIR,
      summary: ['module: example.com/x'],
      diagnostics: [],
      details: null,
    },
    scope: { mode: 'changed', note: 'test fixture', details: null },
    gates,
  };
}

describe('runVerify', () => {
  it('runs every gate even after one fails (RUN-ALL)', () => {
    const report = runVerify(
      [
        runOf([
          shellGate('build', 'exit 1'),
          shellGate('vet', 'exit 0'),
          shellGate('test', 'exit 0'),
        ]),
      ],
      []
    );

    assert.equal(report.total, 3);
    assert.equal(report.passed, 2);
    assert.equal(report.ok, false);
  });

  it('treats stdout as failure when outputMeansFailure is set, despite exit 0', () => {
    const report = runVerify(
      [runOf([shellGate('fmt', 'echo bad.go; exit 0', { outputMeansFailure: true })])],
      []
    );

    assert.equal(report.results[0]?.status, 'fail');
    assert.match(report.results[0]?.output ?? '', /bad\.go/);
  });

  it('passes an outputMeansFailure gate that prints nothing', () => {
    const report = runVerify(
      [runOf([shellGate('fmt', 'exit 0', { outputMeansFailure: true })])],
      []
    );

    assert.equal(report.results[0]?.status, 'pass');
    assert.equal(report.ok, true);
  });

  it('passes an outputMeansFailure gate that exits non-zero with no output (grep clean case)', () => {
    // `grep`/`rg` "no forbidden pattern" gates exit 1 when they find nothing — the clean case.
    // Output, not the exit code, drives the verdict (review P2: it used to invert to FAIL).
    const report = runVerify(
      [runOf([shellGate('no-todos', 'exit 1', { outputMeansFailure: true })])],
      []
    );

    assert.equal(report.results[0]?.status, 'pass');
    assert.equal(report.ok, true);
  });

  it('classifies a failure as env-fail when an outputMatches predicate fires', () => {
    const report = runVerify(
      [
        runOf([
          shellGate('lint', 'echo "panic: package requires newer Go version"; exit 2', {
            envFail: [outputMatches(/^panic: /m)],
          }),
        ]),
      ],
      []
    );

    assert.equal(report.results[0]?.status, 'env-fail');
  });

  it('appends the matched predicate hint to env-fail output (D-STACK-012)', () => {
    const report = runVerify(
      [
        runOf([
          shellGate('generate', 'echo "exec: \\"easyjson\\": executable file not found"; exit 1', {
            envFail: [outputMatches(/executable file not found/, 'install it with `go install`')],
          }),
        ]),
      ],
      []
    );

    assert.equal(report.results[0]?.status, 'env-fail');
    assert.match(report.results[0]?.output ?? '', /hint: install it with `go install`/);
  });

  it('classifies exit codes above the exit-code condition as env-fail', () => {
    const report = runVerify(
      [runOf([shellGate('lint', 'exit 3', { envFail: [exitCodeMatches('>1')] })])],
      []
    );

    assert.equal(report.results[0]?.status, 'env-fail');
  });

  it('keeps exit codes at or below the exit-code condition as genuine findings', () => {
    const report = runVerify(
      [
        runOf([
          shellGate('lint', 'echo "a.go:1: issue"; exit 1', { envFail: [exitCodeMatches('>1')] }),
        ]),
      ],
      []
    );

    assert.equal(report.results[0]?.status, 'fail');
  });

  it('treats a failure without predicates as a code finding', () => {
    const report = runVerify([runOf([shellGate('test', 'exit 1')])], []);

    assert.equal(report.results[0]?.status, 'fail');
  });

  it('classifies an unspawnable binary as env-fail', () => {
    const broken: Gate = { ...shellGate('build', ''), argv: ['/definitely/not/a/binary'] };
    const report = runVerify([runOf([broken])], []);

    assert.equal(report.results[0]?.status, 'env-fail');
  });

  it('kills a gate exceeding its own timeoutMs and reports TIMEOUT', () => {
    const report = runVerify([runOf([shellGate('test', 'sleep 5', { timeoutMs: 300 })])], []);

    assert.equal(report.results[0]?.status, 'timeout');
  });

  it('merges gate.env over the process environment', () => {
    const report = runVerify(
      [
        runOf([
          shellGate('build', '[ "$STACK_TEST_VAR" = "42" ] || { echo "missing env"; exit 1; }', {
            env: { STACK_TEST_VAR: '42' },
          }),
        ]),
      ],
      []
    );

    assert.equal(report.results[0]?.status, 'pass');
  });

  it('reports skipped gates without executing them and excludes them from totals', () => {
    const skipped: Gate = { ...shellGate('lint', 'exit 1'), argv: [], skipped: 'tool not found' };
    const report = runVerify([runOf([skipped])], []);

    assert.equal(report.results[0]?.status, 'skipped');
    assert.equal(report.total, 0);
    assert.equal(report.ok, true);
  });
});

describe('runVerify — verdict precedence (spec §8.2, D-STACK-015)', () => {
  it('a matching output rule outranks TIMEOUT: the environment is named, not the clock', () => {
    const report = runVerify(
      [
        runOf([
          shellGate('e2e', 'echo "cannot reach docker daemon" >&2; sleep 5', {
            timeoutMs: 400,
            envFail: [streamMatches('stderr', /docker daemon/m, 'start docker')],
          }),
        ]),
      ],
      []
    );

    assert.equal(report.results[0]?.status, 'env-fail');
    assert.match(report.results[0]?.output ?? '', /hint: start docker/);
  });

  it('an unexplained TIMEOUT still carries the do-not-edit-code note', () => {
    const report = runVerify([runOf([shellGate('test', 'sleep 5', { timeoutMs: 300 })])], []);
    const text = formatVerifyReport(report);

    assert.equal(report.results[0]?.status, 'timeout');
    assert.match(text, /NOT a finding about the code/);
  });

  it('a rule outranks the stdout contract, so exit-0 diagnostics can be env-fail', () => {
    // `outputMeansFailure` gates (the gofmt family) previously never consulted rules at all.
    const report = runVerify(
      [
        runOf([
          shellGate('drift', 'echo "cannot reach docker daemon"; exit 0', {
            outputMeansFailure: true,
            envFail: [streamMatches('stdout', /docker daemon/m, 'start docker')],
          }),
        ]),
      ],
      []
    );

    assert.equal(report.results[0]?.status, 'env-fail');
  });

  it('a broken environment outranks VIOLATION, and still lists the debris', () => {
    withGitFixture((dir) => {
      const gate: Gate = {
        ...shellGate('e2e', 'echo "cannot reach docker daemon" >&2; echo junk > junk.txt; exit 1'),
        cwd: dir,
        envFail: [streamMatches('stderr', /docker daemon/m, 'start docker')],
      };
      const report = runVerify([runOf([gate])], []);

      assert.equal(report.results[0]?.status, 'env-fail');
      assert.match(report.results[0]?.output ?? '', /junk\.txt/, 'the debris stays visible');
      assert.equal(fs.existsSync(path.join(dir, 'junk.txt')), false, 'real tree untouched');
    });
  });
});

describe('runVerify — predicates see a bounded window (spec §8.2)', () => {
  it('matches in the head and the tail, and fails open when only the middle matches', () => {
    // A config regex runs in this process against output that can reach tens of megabytes.
    // Predicates see the same head+tail window the report prints; dropping the middle can only
    // LOSE a match, so the conservative direction (FAIL, never a false env-fail) is preserved.
    const head = runVerify(
      [
        runOf([
          shellGate('a', 'echo NEEDLE; seq 1 500; exit 1', {
            envFail: [streamMatches('stdout', /NEEDLE/m, 'h')],
          }),
        ]),
      ],
      []
    );
    assert.equal(head.results[0]?.status, 'env-fail', 'head is inside the window');

    const tail = runVerify(
      [
        runOf([
          shellGate('b', 'seq 1 500; echo NEEDLE; exit 1', {
            envFail: [streamMatches('stdout', /NEEDLE/m, 'h')],
          }),
        ]),
      ],
      []
    );
    assert.equal(tail.results[0]?.status, 'env-fail', 'tail is inside the window');

    const middle = runVerify(
      [
        runOf([
          shellGate('c', 'seq 1 200; echo NEEDLE; seq 1 200; exit 1', {
            envFail: [streamMatches('stdout', /NEEDLE/m, 'h')],
          }),
        ]),
      ],
      []
    );
    assert.equal(middle.results[0]?.status, 'fail', 'an elided middle fails open to FAIL');
  });
});

describe('runVerify — output that overruns the capture limit (review)', () => {
  it("is the gate's own verdict, not a broken environment", () => {
    // Genuinely overruns the 64MB capture cap, so spawnSync reports ENOBUFS with a null exit
    // code — the shape that used to be excused as env-fail. Costs about 50ms.
    const gate: Gate = shellGate(
      'flood',
      'yes xxxxxxxxxxxxxxxxxxxxxxxxxxxx | head -c 70000000; exit 3'
    );
    const report = runVerify([runOf([gate])], []);

    assert.notEqual(
      report.results[0]?.status,
      'env-fail',
      'the tool ran to a verdict — excusing it as environmental hides a real failure'
    );
    assert.equal(report.results[0]?.status, 'fail');
    assert.match(report.results[0]?.output ?? '', /exceeded the capture limit/);
  });
});

describe('runVerify — blocking diagnostics (review #1)', () => {
  it('a blocking diagnostic cannot report a pass, even when every executed gate passed', () => {
    const report = runVerify(
      [runOf([shellGate('fmt', 'exit 0')])],
      [
        {
          code: 'TOOLCHAIN_MISSING',
          message: 'go was not found in PATH',
          fix: 'install Go',
          blocking: true,
        },
      ]
    );

    assert.equal(report.results[0]?.status, 'pass');
    assert.equal(report.ok, false, 'gates that could not be planned leave nothing to fail');
    assert.match(formatVerifyReport(report), /BLOCKED: TOOLCHAIN_MISSING/);
  });

  it('an ordinary diagnostic is advisory and leaves a clean run green', () => {
    const report = runVerify(
      [runOf([shellGate('fmt', 'exit 0')])],
      [{ code: 'NESTED_MODULES', message: 'nested module found', fix: 'verify it separately' }]
    );

    assert.equal(report.ok, true);
    assert.match(formatVerifyReport(report), /ALL_GATES_PASS/);
  });
});

describe('runVerify — timeout enforcement (review #6)', () => {
  it('kills a gate that ignores SIGTERM and classifies it as a timeout', () => {
    const gate: Gate = {
      ...shellGate('stubborn', 'trap "" TERM; sleep 30'),
      timeoutMs: 700,
    };
    const startedAt = Date.now();
    const report = runVerify([runOf([gate])], []);
    const elapsed = Date.now() - startedAt;

    assert.equal(report.results[0]?.status, 'timeout', report.results[0]?.output);
    assert.ok(elapsed < 10_000, `runner waited ${elapsed}ms for a 700ms timeout`);
  });

  it('refuses a non-positive timeout rather than treating it as unlimited', () => {
    const gate: Gate = { ...shellGate('zero', 'exit 0'), timeoutMs: 0 };
    assert.throws(() => runVerify([runOf([gate])], []), /non-positive timeout/);
  });
});

describe('runVerify — requires preconditions (spec §4.7)', () => {
  it('reports a precondition whose cwd is missing as env-fail, not a crash', () => {
    const gate: Gate = {
      ...shellGate('deploy', 'exit 0'),
      requires: [
        {
          argv: ['/bin/sh', '-c', 'exit 0'],
          cwd: path.join(BASE_DIR, 'no-such-directory'),
          timeoutMs: 10_000,
          hint: 'create the workspace directory first',
        },
      ],
    };
    const report = runVerify([runOf([gate])], []);

    assert.equal(report.results[0]?.status, 'env-fail');
    assert.match(report.results[0]?.output ?? '', /create the workspace directory first/);
  });

  it('runs preconditions on the unsandboxed path too (review #12)', () => {
    const marker = path.join(BASE_DIR, 'unsandboxed-gate-ran.txt');
    fs.rmSync(marker, { force: true });
    const gate: Gate = {
      ...shellGate('deploy', `touch ${JSON.stringify(marker)}`),
      requires: [
        {
          argv: ['/bin/sh', '-c', 'echo "no cluster credentials" >&2; exit 1'],
          cwd: BASE_DIR,
          timeoutMs: 10_000,
          hint: 'run `kubectl login` first',
        },
      ],
    };
    // runFix passes no pool — the same unsandboxed path a non-git repository takes.
    const results = runFix([gate]);

    assert.equal(results[0]?.status, 'env-fail');
    assert.match(results[0]?.output ?? '', /run `kubectl login` first/);
    assert.equal(fs.existsSync(marker), false, 'the gate command must not have run');
  });

  it('reports env-fail with the precondition hint and never runs the gate command', () => {
    const marker = path.join(BASE_DIR, 'gate-ran.txt');
    const gate: Gate = {
      ...shellGate('e2e', `touch ${JSON.stringify(marker)}`),
      requires: [
        {
          argv: ['/bin/sh', '-c', 'exit 0'],
          cwd: BASE_DIR,
          timeoutMs: 10_000,
          hint: 'this one passes',
        },
        {
          argv: ['/bin/sh', '-c', 'echo "cannot reach docker daemon" >&2; exit 1'],
          cwd: BASE_DIR,
          timeoutMs: 10_000,
          hint: 'start docker, then re-run',
        },
      ],
    };
    const report = runVerify([runOf([gate])], []);

    assert.equal(report.results[0]?.status, 'env-fail');
    assert.match(report.results[0]?.output ?? '', /start docker, then re-run/);
    assert.match(report.results[0]?.output ?? '', /cannot reach docker daemon/);
    assert.equal(fs.existsSync(marker), false, 'the gate command must not run');
  });

  it('runs the gate normally once every precondition passes', () => {
    const gate: Gate = {
      ...shellGate('e2e', 'exit 0'),
      requires: [
        { argv: ['/bin/sh', '-c', 'exit 0'], cwd: BASE_DIR, timeoutMs: 10_000, hint: 'ok' },
      ],
    };
    const report = runVerify([runOf([gate])], []);

    assert.equal(report.results[0]?.status, 'pass');
  });

  it('a failing precondition is env-fail even when the gate would have failed on code', () => {
    // Otherwise a broken environment reads as a finding about the code.
    const gate: Gate = {
      ...shellGate('e2e', 'exit 1'),
      requires: [
        {
          argv: ['/bin/sh', '-c', 'exit 3'],
          cwd: BASE_DIR,
          timeoutMs: 10_000,
          hint: 'fix the env',
        },
      ],
    };
    const report = runVerify([runOf([gate])], []);

    assert.equal(report.results[0]?.status, 'env-fail');
  });
});

describe('formatVerifyReport', () => {
  it('reports ZERO_GATES, not ALL_GATES_PASS, when nothing was executed (review B2)', () => {
    const skipped: Gate = { ...shellGate('lint', 'exit 1'), argv: [], skipped: 'tool not found' };
    const report = runVerify([runOf([skipped])], []);
    const text = formatVerifyReport(report);

    assert.match(text, /ZERO_GATES/);
    assert.ok(!text.includes('ALL_GATES_PASS'), 'verified-nothing must not read as success');
    // Machine consumers read diagnostics, not the human verdict line (review B2 follow-up).
    assert.ok(
      report.diagnostics.some((diagnostic) => diagnostic.code === 'ZERO_GATES'),
      'a zero-gate run must carry a ZERO_GATES diagnostic for --json consumers'
    );
    // The diagnostic feeds the verdict block only — it must not also print as a ⚠️ warning.
    assert.equal(text.match(/ZERO_GATES/g)?.length, 1);
  });

  it('tells an unconfigured repository what to do when nothing was even planned', () => {
    // anystack matches every repository, so this is the terminal message where
    // NO_STACK_DETECTED used to be: the verdict alone would leave the reader stuck.
    const text = formatVerifyReport(runVerify([runOf([])], []));

    assert.match(text, /ZERO_GATES/);
    assert.match(text, /stack\.<id>\.extraGates/);
  });

  it('omits a stack that planned nothing from the verdict line', () => {
    const report = runVerify([runOf([shellGate('build', 'true')]), runOf([])], []);
    const text = formatVerifyReport(report);

    assert.match(text, /ALL_GATES_PASS/);
    assert.strictEqual(
      text.split('·').length,
      1,
      'a stack with no gates must not add a note to the verdict line'
    );
  });

  it('keeps the tail of long failure output, where test runners put the summary (review N1)', () => {
    const report = runVerify([runOf([shellGate('vet', 'seq 1 500; exit 1')])], []);
    const text = formatVerifyReport(report);

    assert.match(text, /lines truncated/);
    assert.ok(
      text.includes('\n499\n'),
      'the tail (failure summary territory) must survive truncation'
    );
  });

  it('prints a single summary line and nothing else when all gates pass', () => {
    const report = runVerify([runOf([shellGate('vet', 'echo noise; exit 0')])], []);
    const text = formatVerifyReport(report);

    assert.match(text, /ALL_GATES_PASS \(1\/1\)/);
    assert.ok(!text.includes('noise'), 'passing gates must contribute no output');
  });

  it('includes stack-qualified name, command, cwd and output for a failing gate', () => {
    const report = runVerify([runOf([shellGate('vet', 'echo boom >&2; exit 3')])], []);
    const text = formatVerifyReport(report);

    assert.match(text, /FAIL gate: golang:vet/);
    assert.match(text, /command:/);
    assert.match(text, /cwd:/);
    assert.match(text, /boom/);
  });

  it('warns an agent not to edit sources on env-fail', () => {
    const report = runVerify(
      [
        runOf([
          shellGate('lint', 'echo "panic: boom"; exit 2', {
            envFail: [outputMatches(/^panic: /m)],
          }),
        ]),
      ],
      []
    );
    const text = formatVerifyReport(report);

    assert.match(text, /ENV_FAIL/);
    assert.match(text, /NOT a finding about the code/);
  });

  it('renders diagnostics with their fixes', () => {
    const diagnostic: StackDiagnostic = { code: 'X_CODE', message: 'broken', fix: 'do this' };
    const report = runVerify([runOf([shellGate('vet', 'exit 0')])], [diagnostic]);
    const text = formatVerifyReport(report);

    assert.match(text, /X_CODE: broken/);
    assert.match(text, /fix: do this/);
  });

  it('truncates very long failure output with an explicit marker', () => {
    const report = runVerify([runOf([shellGate('vet', 'seq 1 500; exit 1')])], []);
    const text = formatVerifyReport(report);

    assert.match(text, /lines truncated/);
  });
});

/** @purpose Run git quietly in a fixture dir. */
function fixtureGit(dir: string, ...args: string[]): void {
  execFileSync('git', ['-C', dir, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    stdio: 'ignore',
  });
}

/** @purpose Create a committed git fixture with one tracked file, run fn, clean up. */
function withGitFixture<T>(fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-gate-'));
  try {
    fs.writeFileSync(path.join(dir, 'gen.txt'), 'original\n');
    fixtureGit(dir, 'init', '-q', '-b', 'main');
    fixtureGit(dir, 'add', '-A');
    fixtureGit(dir, 'commit', '-qm', 'init');
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('runVerify — sandboxed gates (spec §2, D-STACK-011)', () => {
  it('classifies generator drift as FAIL with the file list, and rolls the tree back to HEAD', () => {
    withGitFixture((dir) => {
      const gate: Gate = {
        ...shellGate('generate', 'echo regenerated > gen.txt'),
        cwd: dir,
        driftMeansFailure: true,
      };
      const report = runVerify([runOf([gate])], []);

      assert.equal(report.results[0]?.status, 'fail');
      assert.match(report.results[0]?.output ?? '', /gen\.txt/);
      // The mutation happened in the real tree and was reset — exactly to HEAD (D-STACK-017).
      assert.equal(fs.readFileSync(path.join(dir, 'gen.txt'), 'utf-8'), 'original\n');
    });
  });

  it('passes a drift-free sandboxed gate', () => {
    withGitFixture((dir) => {
      const gate: Gate = { ...shellGate('generate', 'true'), cwd: dir, driftMeansFailure: true };
      const report = runVerify([runOf([gate])], []);

      assert.equal(report.results[0]?.status, 'pass');
    });
  });

  it('refuses a dirty tree — uncommitted work is never verified and never touched', () => {
    withGitFixture((dir) => {
      fs.writeFileSync(path.join(dir, 'gen.txt'), 'agent-edit\n'); // uncommitted tracked edit
      fs.writeFileSync(path.join(dir, 'new.txt'), 'untracked\n'); // untracked file
      const gate: Gate = { ...shellGate('build', 'true'), cwd: dir };
      const report = runVerify([runOf([gate])], []);

      assert.equal(report.results[0]?.status, 'env-fail');
      assert.match(report.results[0]?.output ?? '', /DIRTY_TREE/);
      // The refusal must not touch the user's work.
      assert.equal(fs.readFileSync(path.join(dir, 'gen.txt'), 'utf-8'), 'agent-edit\n');
      assert.equal(fs.readFileSync(path.join(dir, 'new.txt'), 'utf-8'), 'untracked\n');
    });
  });

  it('reports env-fail for a drift gate when there is no HEAD to guard against', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-nogit-'));
    try {
      fixtureGit(dir, 'init', '-q', '-b', 'main'); // repo without a single commit
      const gate: Gate = { ...shellGate('generate', 'true'), cwd: dir, driftMeansFailure: true };
      const report = runVerify([runOf([gate])], []);

      assert.equal(report.results[0]?.status, 'env-fail');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('runVerify — clean-tree guard enforcement (spec §2, D-STACK-017)', () => {
  it('flags a mutating gate as VIOLATION and resets the tree before the next gate', () => {
    withGitFixture((dir) => {
      const mutator: Gate = { ...shellGate('bad', 'echo dirt > dirt.txt'), cwd: dir };
      const checker: Gate = { ...shellGate('probe', 'test ! -f dirt.txt'), cwd: dir };
      const report = runVerify([runOf([mutator, checker])], []);

      assert.equal(report.results[0]?.status, 'violation');
      assert.match(report.results[0]?.output ?? '', /dirt\.txt/);
      assert.match(formatVerifyReport(report), /VIOLATION/);
      assert.match(formatVerifyReport(report), /fixer/);
      assert.equal(report.results[1]?.status, 'pass', 'the tree is reset to HEAD between gates');
      assert.equal(fs.existsSync(path.join(dir, 'dirt.txt')), false, 'mutation rolled back');
      assert.equal(report.ok, false);
    });
  });

  it('gate output carries real-tree paths natively — nothing is rewritten', () => {
    withGitFixture((dir) => {
      const gate: Gate = {
        ...shellGate('build', 'echo "$PWD/gen.txt:1: broken"; exit 1'),
        cwd: dir,
      };
      const report = runVerify([runOf([gate])], []);

      assert.equal(report.results[0]?.status, 'fail');
      assert.ok(
        (report.results[0]?.output ?? '').includes(`${dir}/gen.txt:1: broken`),
        `expected real path ${dir}, got: ${report.results[0]?.output}`
      );
    });
  });

  it('runs gates outside a git repository unsandboxed, with a loud diagnostic', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nogit-run-'));
    try {
      const gate: Gate = { ...shellGate('build', 'true'), cwd: dir };
      const report = runVerify([runOf([gate])], []);

      assert.equal(report.results[0]?.status, 'pass');
      assert.ok(
        report.diagnostics.some((diagnostic) => diagnostic.code === 'UNSANDBOXED_RUN'),
        'the unenforced run must be visible'
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('gitignored paths are legal gate workspace: readable, writable, never reset', () => {
    withGitFixture((dir) => {
      fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\ncache/\n');
      fixtureGit(dir, 'add', '-A');
      fixtureGit(dir, 'commit', '-qm', 'ignore');
      fs.mkdirSync(path.join(dir, 'node_modules'));
      fs.writeFileSync(path.join(dir, 'node_modules', 'dep.js'), 'x');
      const reader: Gate = { ...shellGate('lint', 'test -e node_modules/dep.js'), cwd: dir };
      // A gate writing into an ignored path is a cache write, not a violation (D-STACK-017).
      const cacheWriter: Gate = {
        ...shellGate('build', 'mkdir -p cache && echo warm > cache/x'),
        cwd: dir,
      };
      const report = runVerify([runOf([reader, cacheWriter])], []);

      assert.equal(report.results[0]?.status, 'pass', report.results[0]?.output);
      assert.equal(report.results[1]?.status, 'pass', report.results[1]?.output);
      assert.equal(
        fs.readFileSync(path.join(dir, 'cache', 'x'), 'utf-8'),
        'warm\n',
        'the ignored cache survives the run'
      );
    });
  });
});

describe('guard failures never execute gates', () => {
  it('reports env-fail instead of executing where the guard cannot arm', () => {
    // An unguardable tree (here: unwritable gitdir, so no lock) is not a repository that
    // cannot have a guard: executing anyway silently drops observe-only for the whole run.
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'replica-fail-'));
    execFileSync('git', ['init', '-q', '-b', 'main', repo]);
    fs.writeFileSync(path.join(repo, 'a.txt'), 'x\n');
    execFileSync('git', ['-C', repo, 'add', '-A']);
    execFileSync('git', [
      '-C',
      repo,
      '-c',
      'user.email=e@e',
      '-c',
      'user.name=e',
      'commit',
      '-qm',
      'i',
    ]);
    fs.chmodSync(path.join(repo, '.git'), 0o500);

    try {
      const gate: Gate = { ...shellGate('touch', 'echo hi'), cwd: repo };
      const report = runVerify(
        [{ ...runOf([gate]), detection: { ...runOf([gate]).detection, root: repo } }],
        []
      );

      assert.strictEqual(report.results[0]?.status, 'env-fail');
      assert.match(report.results[0]?.output ?? '', /refusing to execute/);
    } finally {
      fs.chmodSync(path.join(repo, '.git'), 0o700);
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
