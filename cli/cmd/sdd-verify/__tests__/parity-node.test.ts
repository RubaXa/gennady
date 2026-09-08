// @file: V-01 node-parity golden — byte-for-byte proof of today's sdd-verify behaviour (30-TRACK-
//   VERIFY.md §3.1.3 п.2-5, п.9-11; §6 V-01). Exercises `run()`/`runPhaseVerification()` through an
//   INJECTED GateRunner — per §3.1.3 п.2 ("с инжектируемым GateRunner") — never a real spawned CLI
//   subprocess: fast, deterministic, and it still goes through the exact production receipt-writing
//   path (phase-run.ts), which is what the plan document's own "живым фазовым прогоном" language
//   asks for at the level that matters (real code path, fake process boundary). See R-01-V-01.md
//   "ВОПРОСЫ" for the residual open question about true CLI-subprocess e2e coverage.
// @invariant `run()`/`readProjectScripts()`/`isSelfHosting()` (sdd-verify.cmd.ts) read `package.json`
//   relative to `process.cwd()`, not a passed root — untouched by this brief (FILES: не трогать
//   sdd-verify.cmd.ts). Every test below that calls `run()` or `runPhaseVerification()` therefore
//   chdir's into a throwaway fixture directory it fully controls, and restores cwd in `finally` —
//   this keeps every golden decoupled from the mutable RC root's own package.json (I-3).
// @consumers: N/A (regression fixture for the SDD v1→v2 transfer plan, track 30-TRACK-VERIFY)
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import path, { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { run } from '../sdd-verify.cmd.ts';
import { verdict, type GateResult, type GateRunner } from '../sdd-verify.types.ts';
import { resolvePhaseContext, type PhaseVerifyContext } from '../phase-context.ts';
import { runPhaseVerification } from '../phase-run.ts';
import { phaseReceiptIssue, phaseReceiptCommandIssue } from '../phase-receipt-validation.ts';
import {
  parsePhaseReceipts,
  phaseVerificationEnvironmentState,
} from '../../../../shared/sdd/phase-receipt.ts';
import { formatPhaseVerificationGatePlan } from '../../../../shared/sdd/phase-verification-plan.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..', '..');
const FIXTURE_ROOT = path.join(HERE, 'fixtures', 'environment-state-fixture');

function updateGolden(): boolean {
  return process.env.UPDATE_VERIFY_GOLDEN === '1';
}

function assertGoldenText(goldenPath: string, actual: string): void {
  if (updateGolden()) {
    writeFileSync(goldenPath, actual);
    return;
  }
  assert.ok(
    existsSync(goldenPath),
    `missing ${path.relative(REPO_ROOT, goldenPath)} — regenerate with UPDATE_VERIFY_GOLDEN=1 npm test`
  );
  const expected = readFileSync(goldenPath, 'utf-8');
  assert.strictEqual(
    actual,
    expected,
    `${path.relative(REPO_ROOT, goldenPath)} drifted from the frozen rc-baseline-1 (227c03a8) shape.\n` +
      'Regenerate ONLY inside a named owning task (V-04/V-04a/V-12/V-14, 30-TRACK-VERIFY.md §6): ' +
      'UPDATE_VERIFY_GOLDEN=1 npm test'
  );
}

// Compared by parsed VALUE, not raw bytes: the repo's own `format` gate (prettier) reformats a
// committed `.golden.json` file's whitespace on the very next `npm run format:fix`, which would
// otherwise make this golden flap between two passing runs of the SAME data for a reason that has
// nothing to do with sdd-verify's behaviour.
function assertGoldenJson(goldenPath: string, actual: unknown): void {
  if (updateGolden()) {
    writeFileSync(goldenPath, `${JSON.stringify(actual, null, 2)}\n`);
    return;
  }
  assert.ok(
    existsSync(goldenPath),
    `missing ${path.relative(REPO_ROOT, goldenPath)} — regenerate with UPDATE_VERIFY_GOLDEN=1 npm test`
  );
  const expected: unknown = JSON.parse(readFileSync(goldenPath, 'utf-8'));
  assert.deepStrictEqual(
    actual,
    expected,
    `${path.relative(REPO_ROOT, goldenPath)} drifted from the frozen rc-baseline-1 (227c03a8) shape.\n` +
      'Regenerate ONLY inside a named owning task (V-04/V-04a/V-12/V-14, 30-TRACK-VERIFY.md §6): ' +
      'UPDATE_VERIFY_GOLDEN=1 npm test'
  );
}

// Дыра #4 (30-TRACK-VERIFY.md:172): durationMs is the ONLY volatile field in rendered stdout — the
// receipt itself carries no timestamps (phase-receipt.ts:52-70), so nothing else is normalized.
function normalizeDurations(text: string): string {
  return text.replace(/\(\d+(?:\.\d+)?s\)/g, '(Ns)');
}

const NODE_SCRIPTS: Record<string, string> = {
  'type-check': 'tsc --noEmit',
  test: 'node --test',
  'test:coverage': 'c8 node --test',
  format: 'prettier --check .',
  'format:fix': 'prettier --write',
  lint: 'eslint .',
  'lint:fix': 'eslint --fix',
  fix: 'npm run format:fix -- . && npm run lint:fix -- .',
};

/** One throwaway directory whose package.json becomes `process.cwd()`'s for the duration of `fn`. */
async function withScripts<T>(
  scripts: Record<string, string>,
  fn: () => Promise<T> | T
): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'v01-cwd-scripts-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'not-gennady', scripts }));
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Records every (command, args) pair; fails names in `failNames` — mirrors sdd-verify.cmd.test.ts's fakeRunner. */
function fakeRunner(failNames: string[] = []): { runner: GateRunner; calls: string[] } {
  const calls: string[] = [];
  const runner: GateRunner = (command, args) => {
    calls.push(`${command} ${args.join(' ')}`);
    const leafName =
      command === 'npm' && args[0] === 'run' ? args[1] : (args[args.length - 1] ?? command);
    const fail = failNames.some((name) => leafName === name || args.includes(name));
    return { exitCode: fail ? 1 : 0, output: fail ? `<<${leafName} failed>>` : '' };
  };
  return { runner, calls };
}

// ── 1/2. Call-sequence + byte-for-byte stdout golden (30-TRACK-VERIFY.md §3.1.3 п.2, п.4) ─────────

describe('V-01 golden: exact (command, args) call sequence per profile', () => {
  it('profile=code, all gates pass', async () => {
    const { runner, calls } = fakeRunner();
    const outcome = await withScripts(NODE_SCRIPTS, () =>
      run(runner, 'code', undefined, { targets: ['src/changed.ts'], producesCoverage: false })
    );
    assert.strictEqual(outcome.ok, true, outcome.ok ? '' : outcome.message);
    assertGoldenJson(path.join(HERE, 'parity-node.calls.code.golden.json'), calls);
  });

  it('profile=full, all gates pass (includes the independent quality tail: lint/format/yagni)', async () => {
    const { runner, calls } = fakeRunner();
    const outcome = await withScripts(NODE_SCRIPTS, () =>
      run(runner, 'full', undefined, { targets: [] })
    );
    assert.strictEqual(outcome.ok, true, outcome.ok ? '' : outcome.message);
    assertGoldenJson(path.join(HERE, 'parity-node.calls.full.golden.json'), calls);
  });
});

describe('V-01 golden: byte-for-byte stdout render (durationMs normalized, NOT timestamps — phase-receipt.ts has none)', () => {
  it('profile=code, all pass → ✅ ALL PASS summary', async () => {
    const { runner } = fakeRunner();
    const outcome = await withScripts(NODE_SCRIPTS, () =>
      run(runner, 'code', undefined, { targets: ['src/changed.ts'], producesCoverage: false })
    );
    assert.strictEqual(outcome.ok, true, outcome.ok ? '' : outcome.message);
    assertGoldenText(
      path.join(HERE, 'parity-node.stdout.code-pass.golden.txt'),
      `${normalizeDurations(outcome.ok ? outcome.text : '')}\n`
    );
  });

  it('profile=code, type-check fails → ⛔ halted + failed-gate block', async () => {
    const { runner } = fakeRunner(['type-check']);
    const outcome = await withScripts(NODE_SCRIPTS, () =>
      run(runner, 'code', undefined, { targets: ['src/changed.ts'], producesCoverage: false })
    );
    assert.strictEqual(outcome.ok, false);
    const text = outcome.ok ? '' : outcome.message;
    assertGoldenText(
      path.join(HERE, 'parity-node.stdout.code-typecheck-fail.golden.txt'),
      `${normalizeDurations(text)}\n`
    );
  });

  it('profile=setup, no Target Files → fix skipped, ✅ ALL PASS with bootstrap note', async () => {
    const { runner } = fakeRunner();
    const outcome = await withScripts(NODE_SCRIPTS, () =>
      run(runner, 'setup', undefined, { targets: [] })
    );
    assert.strictEqual(outcome.ok, true, outcome.ok ? '' : outcome.message);
    assertGoldenText(
      path.join(HERE, 'parity-node.stdout.setup-pass.golden.txt'),
      `${normalizeDurations(outcome.ok ? outcome.text : '')}\n`
    );
  });
});

// ── 3. Exit-code / status matrix (30-TRACK-VERIFY.md §3.1.3 п.5) ────────────────────────────────
//
// sdd-verify.types.ts's VerifyOutcome only carries {ok:true} or {ok:false, exitCode:1} — there is no
// third machine exit code inside `run()` itself. Exit 4 (bad invocation) belongs to index.ts:23
// (parseInvocation) and exit 1 to index.ts:67 (phase-context resolution failure); both are outside
// `run()`'s surface and are not re-spawned here — this matrix is the `run()`-level part of the story.

describe('V-01 golden: gate-status matrix (profile × script-state)', () => {
  const withoutTypeCheck: Record<string, string> = Object.fromEntries(
    Object.entries(NODE_SCRIPTS).filter(([name]) => name !== 'type-check')
  );
  const matrix: {
    name: string;
    profile: 'setup' | 'code' | 'test' | 'full';
    scripts: Record<string, string>;
    targets: string[];
    producesCoverage?: boolean;
    failNames?: string[];
  }[] = [
    { name: 'code-all-declared', profile: 'code', scripts: NODE_SCRIPTS, targets: ['src/a.ts'] },
    {
      name: 'code-missing-required-type-check',
      profile: 'code',
      scripts: withoutTypeCheck,
      targets: ['src/a.ts'],
    },
    {
      name: 'code-vacuous-test',
      profile: 'code',
      scripts: { ...NODE_SCRIPTS, test: 'true' },
      targets: ['src/a.ts'],
    },
    { name: 'setup-no-targets', profile: 'setup', scripts: NODE_SCRIPTS, targets: [] },
    {
      name: 'test-owner-coverage',
      profile: 'test',
      scripts: NODE_SCRIPTS,
      targets: ['src/a.ts'],
      producesCoverage: true,
    },
    {
      name: 'test-non-owner',
      profile: 'test',
      scripts: NODE_SCRIPTS,
      targets: ['src/a.ts'],
      producesCoverage: false,
    },
    {
      name: 'full-quality-tail-fail-non-halting',
      profile: 'full',
      scripts: NODE_SCRIPTS,
      targets: [],
      failNames: ['lint'],
    },
  ];

  for (const testCase of matrix) {
    it(testCase.name, async () => {
      const { runner } = fakeRunner(testCase.failNames ?? []);
      const outcome = await withScripts(testCase.scripts, () =>
        run(runner, testCase.profile, undefined, {
          targets: testCase.targets,
          producesCoverage: testCase.producesCoverage,
        })
      );
      const statuses = outcome.ok
        ? { ok: true }
        : { ok: false, exitCode: outcome.exitCode, code: outcome.code };
      assertGoldenJson(
        path.join(HERE, `parity-node.exit-matrix.${testCase.name}.golden.json`),
        statuses
      );
    });
  }
});

// ── 4. Receipt compatibility on a freshly-produced artifact (30-TRACK-VERIFY.md §3.1.3 п.3) ──────
//
// "Old artifact" here means: an artifact produced by TODAY's code, which today's own validator must
// still accept — the baseline this task locks down. A cross-version migration replay is out of scope
// for V-01 (measurement only) and belongs to whichever later task actually changes phase-receipt.ts.

// `resolvePhaseContext` requires `checkReadiness().executionReady` for a non-setup profile —
// `readiness.ts`'s `lint` must reach gennady and `node_modules/.bin/gennady` must exist, or the
// context resolver instead demands a specs/README.md GATE_QUEUE exemption (unrelated machinery,
// out of V-01's scope). Mirrors phase-run.test.ts's proven-executionReady fixture scripts exactly.
const EXECUTION_READY_SCRIPTS: Record<string, string> = {
  'format:fix': 'prettier --write',
  'lint:fix': 'eslint --fix',
  'type-check': 'tsc --noEmit',
  test: 'node --test',
  'test:coverage': 'c8 node --test',
  format: 'prettier --check .',
  lint: 'gennady lint src/',
  fix: 'npm run format:fix -- . && npm run lint:fix -- .',
};

function receiptFixture(): { root: string; taskPath: string; context: PhaseVerifyContext } {
  const root = mkdtempSync(join(tmpdir(), 'v01-parity-receipt-'));
  mkdirSync(join(root, 'specs/app'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'node_modules/.bin'), { recursive: true });
  writeFileSync(join(root, 'node_modules/.bin/gennady'), '');
  writeFileSync(join(root, 'src/a.ts'), 'export const a = 1;\n');
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'not-gennady', scripts: EXECUTION_READY_SCRIPTS })
  );
  writeFileSync(join(root, 'specs/app/app.spec.md'), '# App\n');
  const taskPath = 'specs/app/app.task.V01-PARITY.md';
  writeFileSync(
    join(root, taskPath),
    [
      '<!--SECTION:META-->',
      '- **Task-ID:** V01-PARITY',
      '<!--/SECTION:META-->',
      '<!--SECTION:PHASES_OVERVIEW-->',
      '| ID | Kind | Deps | Status |',
      '|---|---|---|---|',
      '| P1 | impl | — | [ ] |',
      '<!--/SECTION:PHASES_OVERVIEW-->',
      '<!--SECTION:PHASE_P1-->',
      '- **Rules:**',
      '  - none',
      '- **Target Files:**',
      '  - src/a.ts',
      '- **Deleted Files:**',
      '  - none',
      '<!--/SECTION:PHASE_P1-->',
      '<!--SECTION:VERIFICATION-->',
      '- **Coverage Policy:** not-applicable',
      '- **Coverage Reason:** fixture',
      '| Command | Required by | Role |',
      '|---|---|---|',
      '| — | — | extra |',
      '<!--/SECTION:VERIFICATION-->',
      '<!--SECTION:EXECUTION_LOG-->',
      '## Execution Log',
      '<!--/SECTION:EXECUTION_LOG-->',
    ].join('\n')
  );
  const context = resolvePhaseContext(taskPath, 'P1', root);
  assert.strictEqual(context.ok, true, context.ok ? '' : context.message);
  if (!context.ok) throw new Error(context.message);
  return { root, taskPath, context: context.context };
}

describe("V-01 golden: a receipt written by today's code validates against today's own validator", () => {
  it('runPhaseVerification writes a receipt that phaseReceiptIssue accepts on an unchanged workspace', async () => {
    const f = receiptFixture();
    const previousCwd = process.cwd();
    process.chdir(f.root);
    try {
      const result = await runPhaseVerification(
        f.root,
        f.context,
        (command, args) => ({ exitCode: 0, output: `${command} ${args.join(' ')}` }),
        () => ({ exitCode: 0, output: '' })
      );
      assert.strictEqual(result.ok, true, result.ok ? '' : result.message);
      const ticketContent = readFileSync(join(f.root, f.taskPath), 'utf-8');
      const parsed = parsePhaseReceipts(ticketContent);
      assert.strictEqual(parsed.ok, true);
      if (!parsed.ok) return;
      const receipt = parsed.receipts.find((r) => r.phase === 'P1');
      assert.ok(receipt);
      assert.strictEqual(phaseReceiptCommandIssue(receipt, f.context.gatePlan), null);
      const issue = phaseReceiptIssue(f.root, receipt, 'P1', join(f.root, f.taskPath));
      assert.strictEqual(issue, null, issue ?? '');
      // Golden the receipt SHAPE (fields/order), not the environment/target hashes — those are
      // legitimately machine- and content-dependent, not a parity property of the code under test.
      assertGoldenJson(path.join(HERE, 'parity-node.receipt-shape.golden.json'), {
        commands: receipt.commands.map(({ gate, role, command, exitCode }) => ({
          gate,
          role,
          command,
          exitCode,
        })),
        gateEvidence: receipt.gateEvidence?.map(({ name, state, provider }) => ({
          name,
          state,
          provider,
        })),
        profile: receipt.profile,
        profileBasis: receipt.profileBasis,
      });
    } finally {
      process.chdir(previousCwd);
      rmSync(f.root, { recursive: true, force: true });
    }
  });
});

// ── 5. environmentState golden — frozen node fixture (30-TRACK-VERIFY.md §3.1.3 п.9) ─────────────
//
// `phaseVerificationEnvironmentState` takes `root` explicitly (unlike `run()`'s readProjectScripts())
// so this section needs no chdir — it fingerprints ONLY the committed frozen fixture below, never
// the RC repo's own package.json (I-3: REL-4/REL-6/REL-8 mutate that one for unrelated reasons and
// would redden this golden).

describe('V-01 golden: environmentState on the frozen node fixture', () => {
  it('code profile, repair targets present', () => {
    const state = phaseVerificationEnvironmentState(FIXTURE_ROOT, 'code', false, [], true);
    assert.strictEqual(state.ok, true, state.ok ? '' : state.issue);
    if (state.ok)
      assertGoldenText(
        path.join(HERE, 'parity-node.environment-state.code.golden.txt'),
        `${state.state}\n`
      );
  });

  it('test profile, coverage owner', () => {
    const state = phaseVerificationEnvironmentState(FIXTURE_ROOT, 'test', true, [], true);
    assert.strictEqual(state.ok, true, state.ok ? '' : state.issue);
    if (state.ok)
      assertGoldenText(
        path.join(HERE, 'parity-node.environment-state.test-owner.golden.txt'),
        `${state.state}\n`
      );
  });
});

// Matrix (дыра #9) — behavioural coverage on throwaway temp fixtures, not frozen: each case proves
// the fingerprint actually reacts to (or ignores) the named shape, which a single frozen hash cannot
// show by itself. Only the base fixture above needs freezing — I-3's stated concern is "golden from
// the mutable RC root", not "every matrix variant must be pinned forever".
describe('V-01: environmentState matrix — reacts to transitive hops, hooks, start/restart fallback, pnpm/yarn forwarding, local inputs', () => {
  function tmpRepo(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'v01-env-state-'));
    for (const [rel, content] of Object.entries(files)) {
      const abs = join(root, rel);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, content);
    }
    return root;
  }

  it('transitive npm run hop changes the fingerprint when the hop target changes', () => {
    const base = (inner: string) =>
      tmpRepo({
        'package.json': JSON.stringify({
          scripts: { ...NODE_SCRIPTS, test: 'npm run inner-test', 'inner-test': inner },
        }),
      });
    // Bodies avoid a bare trailing file-like operand (`looksLocalPath`, phase-receipt.ts:594) on
    // purpose — that would additionally require the referenced file to exist on disk, which is a
    // different dyra (local-input fingerprinting, covered by its own case below).
    const a = phaseVerificationEnvironmentState(base('echo variant-one'), 'code', false, [], true);
    const b = phaseVerificationEnvironmentState(base('echo variant-two'), 'code', false, [], true);
    assert.strictEqual(a.ok, true);
    assert.strictEqual(b.ok, true);
    if (a.ok && b.ok) assert.notStrictEqual(a.state, b.state);
  });

  it('pre/post lifecycle hooks participate in the fingerprint', () => {
    const withoutHook = tmpRepo({ 'package.json': JSON.stringify({ scripts: NODE_SCRIPTS }) });
    const withHook = tmpRepo({
      'package.json': JSON.stringify({ scripts: { ...NODE_SCRIPTS, pretest: 'echo preparing' } }),
    });
    const a = phaseVerificationEnvironmentState(withoutHook, 'code', false, [], true);
    const b = phaseVerificationEnvironmentState(withHook, 'code', false, [], true);
    assert.strictEqual(a.ok, true);
    assert.strictEqual(b.ok, true);
    if (a.ok && b.ok) assert.notStrictEqual(a.state, b.state);
  });

  it('npm start with no scripts.start entry falls back to the documented `node server.js` when server.js exists', () => {
    const withServer = tmpRepo({
      'package.json': JSON.stringify({ scripts: NODE_SCRIPTS }),
      // Content is irrelevant to the fingerprint test below (only its byte-presence/absence
      // matters) — deliberately inert text, not an actual HTTP listener: scripts/test-topology.ts
      // classifies a test file by a raw regex over its OWN source text, so real server-bootstrap
      // syntax here (even inside a fixture string) would misclassify this suite away from 'unit'.
      'server.js': 'module.exports.started = true;\n',
    });
    const withoutServer = tmpRepo({ 'package.json': JSON.stringify({ scripts: NODE_SCRIPTS }) });
    const a = phaseVerificationEnvironmentState(
      withServer,
      'code',
      false,
      [{ command: 'npm start' }],
      true
    );
    const b = phaseVerificationEnvironmentState(
      withoutServer,
      'code',
      false,
      [{ command: 'npm start' }],
      true
    );
    assert.strictEqual(a.ok, true);
    assert.strictEqual(b.ok, true);
    if (a.ok && b.ok) assert.notStrictEqual(a.state, b.state);
  });

  it('npm restart with no explicit restart script falls back to the stop/start lifecycle', () => {
    const withStop = tmpRepo({
      'package.json': JSON.stringify({ scripts: { ...NODE_SCRIPTS, stop: 'echo stopping' } }),
    });
    const withoutStop = tmpRepo({ 'package.json': JSON.stringify({ scripts: NODE_SCRIPTS }) });
    const a = phaseVerificationEnvironmentState(
      withStop,
      'code',
      false,
      [{ command: 'npm restart' }],
      true
    );
    const b = phaseVerificationEnvironmentState(
      withoutStop,
      'code',
      false,
      [{ command: 'npm restart' }],
      true
    );
    assert.strictEqual(a.ok, true);
    assert.strictEqual(b.ok, true);
    if (a.ok && b.ok) assert.notStrictEqual(a.state, b.state);
  });

  it('pnpm/yarn script forwarding is followed (PACKAGE_MANAGER_BUILTINS, phase-receipt.ts:95)', () => {
    const a = tmpRepo({
      'package.json': JSON.stringify({ scripts: { ...NODE_SCRIPTS, mylint: 'echo one' } }),
    });
    const b = tmpRepo({
      'package.json': JSON.stringify({ scripts: { ...NODE_SCRIPTS, mylint: 'echo two' } }),
    });
    const stateA = phaseVerificationEnvironmentState(
      a,
      'code',
      false,
      [{ command: 'pnpm run mylint' }],
      true
    );
    const stateB = phaseVerificationEnvironmentState(
      b,
      'code',
      false,
      [{ command: 'pnpm run mylint' }],
      true
    );
    assert.strictEqual(stateA.ok, true);
    assert.strictEqual(stateB.ok, true);
    if (stateA.ok && stateB.ok) assert.notStrictEqual(stateA.state, stateB.state);
  });

  it('a repo-local input file (--project ./tsconfig.build.json) is fingerprinted by content', () => {
    const withOneConfig = tmpRepo({
      'package.json': JSON.stringify({
        scripts: { ...NODE_SCRIPTS, 'type-check': 'tsc --noEmit --project ./tsconfig.build.json' },
      }),
      'tsconfig.build.json': '{"strict":true}',
    });
    const withOtherConfig = tmpRepo({
      'package.json': JSON.stringify({
        scripts: { ...NODE_SCRIPTS, 'type-check': 'tsc --noEmit --project ./tsconfig.build.json' },
      }),
      'tsconfig.build.json': '{"strict":false}',
    });
    const a = phaseVerificationEnvironmentState(withOneConfig, 'code', false, [], true);
    const b = phaseVerificationEnvironmentState(withOtherConfig, 'code', false, [], true);
    assert.strictEqual(a.ok, true);
    assert.strictEqual(b.ok, true);
    if (a.ok && b.ok) assert.notStrictEqual(a.state, b.state);
  });
});

// ── 6. Exact-substring contracts read by directives (30-TRACK-VERIFY.md §3.1.3 п.10) ─────────────

describe('V-01: exact substrings that ai/kit/audit/steps/STEP_1_MECHANICAL.xml and sdd-task parse', () => {
  it('a missing REQUIRED script renders the "⛔" + "обязательная ступень профиля" pair (sdd-verify.types.ts:305,519)', () => {
    const results: GateResult[] = [
      {
        name: 'type-check',
        status: 'missing',
        exitCode: 1,
        output: 'обязательная ступень профиля «code»: скрипта нет в package.json — verify нечем',
        durationMs: 0,
        ranCommand: '',
        mutates: false,
      },
    ];
    const outcome = verdict(results, undefined, 'code');
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) {
      assert.match(outcome.message, /⛔ type-check — /);
      assert.match(outcome.message, /обязательная ступень профиля/);
    }
  });

  it('formatPhaseVerificationGatePlan renders the exact "gate-state: " prefix read by sdd-task (phase-verification-plan.ts:376)', () => {
    const line = formatPhaseVerificationGatePlan({
      name: 'type-check',
      state: 'CONFIGURED',
      required: true,
      command: 'npm run type-check',
      prerequisites: [],
      provider: null,
      next: 'run npm run type-check',
    });
    assert.strictEqual(
      line,
      'gate-state: type-check CONFIGURED provider=none next=run npm run type-check'
    );
  });
});

// ── 7. tailCap + GATE_MAX_BUFFER_BYTES (30-TRACK-VERIFY.md:181, "дополнительно вне восьми пунктов") ─

describe('V-01: tailCap output truncation (sdd-verify.types.ts:234-281)', () => {
  it('a failed gate with >120 lines of output is truncated to the last 120 lines with a digest note', () => {
    const lines = Array.from({ length: 200 }, (_, i) =>
      i === 50 ? 'not ok 1 - example' : `line ${i}`
    );
    const results: GateResult[] = [
      {
        name: 'test',
        status: 'fail',
        exitCode: 1,
        output: lines.join('\n'),
        durationMs: 12,
        ranCommand: 'npm run test',
        mutates: false,
      },
    ];
    const outcome = verdict(results, undefined, 'code');
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) {
      assert.match(outcome.message, /output truncated to last 120 lines/);
      assert.match(outcome.message, /failing tests dropped by the cap/);
      assert.match(outcome.message, /not ok 1 - example/);
      assert.ok(!outcome.message.includes('line 0\n'));
    }
  });

  it('output within both caps is left untouched, byte-for-byte', () => {
    const results: GateResult[] = [
      {
        name: 'test',
        status: 'fail',
        exitCode: 1,
        output: 'short failure output\n',
        durationMs: 5,
        ranCommand: 'npm run test',
        mutates: false,
      },
    ];
    const outcome = verdict(results, undefined, 'code');
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) assert.match(outcome.message, /short failure output/);
  });
});
