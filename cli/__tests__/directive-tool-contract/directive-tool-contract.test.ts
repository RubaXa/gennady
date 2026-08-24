// @file: Tool-table contract test — every documented `npx gennady <cmd> ...` call in the sdd-v2
//   execute / phase-execution-protocol / audit directives must (a) name a command gennady's own
//   dispatcher recognizes, (b) return the documented CLASS of result against a real fixture repo
//   (exit 0 for a call the directive presents as routine, the tool's own documented error code for
//   one it presents as an error path), and (c) for the handful of fixed-shape forms, produce output
//   matching that shape. This is the class of bug that costs an executing agent real panic: a tool
//   reference table that promises a flag, a Task-ID banner, or a status side-effect the CLI does not
//   actually have.
// @consumers: N/A
// @tasks: N/A

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { extractDocumentedCalls, type DocumentedCall } from './parse-tool-calls.ts';
import { buildFixture, type Fixture } from './fixture.ts';
import { resolveAssemblyMode } from '../../../ai/kit/lazy-assembly.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const GENNADY_ENTRY = join(REPO_ROOT, 'cli', 'gennady.ts');
const GENNADY_TS = join(REPO_ROOT, 'cli', 'gennady.ts');
// Absolute loader path, not the bare `tsx` specifier: `--import tsx` resolves the bare specifier
// from the CHILD PROCESS's cwd (the fixture dir, which has no node_modules/tsx of its own), not
// from this repo — exactly the failure AX_TOOL_INVOCATION's "npx tsx <repo-root>/cli/gennady.ts"
// form is written to avoid by naming the repo root explicitly.
const TSX_LOADER = join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs');

const DIRECTIVE_PATHS = {
  execute: join(REPO_ROOT, 'ai', 'directives', 'sdd-v2', 'execute.directive.xml'),
  phase: join(REPO_ROOT, 'ai', 'directives', 'sdd-v2', 'phase-execution-protocol.directive.xml'),
  audit: join(REPO_ROOT, 'ai', 'directives', 'sdd-v2', 'audit.directive.xml'),
} as const;

type DirectiveKey = keyof typeof DIRECTIVE_PATHS;

/**
 * @purpose Every documented call reachable from one directive, spanning its lazy skeleton + step
 *   packages when the directive resolves `lazy` (ai/kit/lazy-assembly.ts) — the worked CLI
 *   examples this test extracts can live inside a package's own body instead of the skeleton.
 *   Extraction runs on EACH fragment separately and the per-fragment results are merged (dedup by
 *   verbatim raw span, first fragment wins), rather than on one joined string: a fenced code block
 *   (```…```) can leave a backtick unpaired within its own file (harmless there, `extractDocumentedCalls`
 *   simply never matches it), but naively joining raw text lets that unpaired backtick re-pair
 *   with the next file's own backticks, swallowing real content into one bogus cross-file span —
 *   confirmed against this exact directive: joined-text extraction silently dropped 13 of 42
 *   documented calls that per-fragment extraction preserves.
 */
function extractDocumentedCallsAcrossAssembly(path: string): DocumentedCall[] {
  const skeletonText = readFileSync(path, 'utf-8');
  const manifestKey = `sdd-v2/${basename(path)}`;
  const fragments = [skeletonText];
  if (resolveAssemblyMode(manifestKey) === 'lazy') {
    const packagePaths = [...skeletonText.matchAll(/Full step text: `([^`]+)`/g)].map((m) => m[1]!);
    for (const packagePath of packagePaths) {
      fragments.push(readFileSync(join(REPO_ROOT, packagePath), 'utf-8'));
    }
  }

  const seen = new Set<string>();
  const merged: DocumentedCall[] = [];
  for (const fragment of fragments) {
    for (const call of extractDocumentedCalls(fragment)) {
      if (seen.has(call.raw)) continue;
      seen.add(call.raw);
      merged.push(call);
    }
  }
  return merged;
}

const directiveCalls = new Map<DirectiveKey, DocumentedCall[]>();
for (const [key, path] of Object.entries(DIRECTIVE_PATHS) as [DirectiveKey, string][]) {
  directiveCalls.set(key, extractDocumentedCallsAcrossAssembly(path));
}

/**
 * @purpose Every documented command name recognized by gennady's own CLI dispatcher — the source
 *   of truth for property (a), "the directive names a command that exists".
 * @returns Set of case-label strings from cli/gennady.ts's `switch (command)` blocks.
 */
function knownCommands(): Set<string> {
  const src = readFileSync(GENNADY_TS, 'utf-8');
  const set = new Set<string>();
  const re = /case '([a-zA-Z0-9-]+)':/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) set.add(m[1]);
  return set;
}

type CliResult = { stdout: string; stderr: string; exitCode: number };

/** @purpose Run the real repo-relative CLI (`npx tsx cli/gennady.ts <args>`, per AX_TOOL_INVOCATION) against a fixture. */
function runCli(args: string[], cwd: string): CliResult {
  const res = spawnSync(process.execPath, ['--import', TSX_LOADER, GENNADY_ENTRY, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, GENNADY_NO_UPDATE_CHECK: '1' },
    timeout: 30_000,
  });
  return {
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    exitCode: res.status ?? (res.error ? 1 : 0),
  };
}

/** @purpose Assert `raw` is one of the calls the parser actually extracted from `directive` — the drift guard: if the directive's own worked example changes, this fails loudly instead of silently testing a stale string. */
function assertDocumented(directive: DirectiveKey, raw: string): void {
  const calls = directiveCalls.get(directive) ?? [];
  assert.ok(
    calls.some((c) => c.raw === raw),
    `expected "${raw}" among the ${calls.length} call(s) extracted from ${directive}.directive.xml — ` +
      `the worked example may have changed; update the fixture case to match`
  );
}

// #region START_COMPLETENESS_GATE — floors are the ACTUAL counts observed against the current
// directive text (see report); a silent parser regression (markup change swallowing every match)
// would drop these to 0, not shrink them gradually, so a floor well below the observed count still
// catches it without making the test flaky on cosmetic directive edits.
describe('documented-call extraction — completeness gate', () => {
  it('execute.directive.xml yields at least 20 documented calls', () => {
    assert.ok((directiveCalls.get('execute') ?? []).length >= 20);
  });

  it('phase-execution-protocol.directive.xml yields at least 35 documented calls', () => {
    assert.ok((directiveCalls.get('phase') ?? []).length >= 35);
  });

  it('audit.directive.xml yields at least 15 documented calls', () => {
    assert.ok((directiveCalls.get('audit') ?? []).length >= 15);
  });
});
// #endregion END_COMPLETENESS_GATE

// #region START_FIXTURES — one shared read-only fixture; mutating cases (sdd-log, sdd-sync) build
// their own fresh copy so they never interfere with a read-only assertion running before/after them.
let ro: Fixture;
const scratchDirs: string[] = [];

before(() => {
  ro = buildFixture();
  scratchDirs.push(ro.root);
});

after(() => {
  for (const d of scratchDirs) rmSync(d, { recursive: true, force: true });
});

function freshFixture(): Fixture {
  const fx = buildFixture();
  scratchDirs.push(fx.root);
  return fx;
}
// #endregion END_FIXTURES

type FixtureCase = {
  id: string;
  directive: DirectiveKey;
  /** @purpose The exact worked-example string this case is exercising (drift guard). */
  raw: string;
  cmd: string;
  args: (fx: Fixture) => string[];
  cwd?: (fx: Fixture) => string;
  fresh?: boolean;
  /** @purpose Extra CLI calls to run against the fixture before the documented call itself — e.g. opening the phase block a `--phase` pointer needs to already exist. */
  setup?: (fx: Fixture) => void;
  check: (result: CliResult, fx: Fixture) => void;
};

const CASES: FixtureCase[] = [
  {
    id: 'sdd-task (no id) — execution map',
    directive: 'execute',
    raw: 'npx gennady sdd-task',
    cmd: 'sdd-task',
    args: () => [],
    check: (r) => {
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /execution map/);
    },
  },
  {
    id: 'sdd-task <ticket-path> — plan',
    directive: 'execute',
    raw: 'npx gennady sdd-task specs/app/greeting/greeting.task.APP-greet-greeting.md',
    cmd: 'sdd-task',
    args: (fx) => [fx.ticketPath],
    check: (r, fx) => {
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, new RegExp(`^\\[sdd-task\\] ${fx.taskId} — `));
      assert.match(r.stdout, /Per-phase read-manifest/);
    },
  },
  {
    id: 'sdd-task --audit-group <id>',
    directive: 'execute',
    raw: 'npx gennady sdd-task --audit-group APP-greet-greeting',
    cmd: 'sdd-task',
    args: (fx) => ['--audit-group', fx.taskId],
    check: (r) => {
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /^audit: /m);
    },
  },
  {
    id: 'sdd-task <ticket> --phase P<N>',
    directive: 'phase',
    raw: 'npx gennady sdd-task <ticket> --phase P2',
    cmd: 'sdd-task',
    args: (fx) => [fx.ticketPath, '--phase', 'P1'],
    check: (r, fx) => {
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, new RegExp(`\\[sdd-task\\] ${fx.taskId} — P1 impl`));
    },
  },
  {
    id: 'sdd-task --group-scope <id>',
    directive: 'audit',
    raw: 'sdd-task --group-scope <id>',
    cmd: 'sdd-task',
    args: (fx) => ['--group-scope', fx.taskId],
    check: (r) => {
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /^files:$/m);
      assert.match(r.stdout, /^git: /m);
    },
  },
  {
    id: 'sdd-log <ticket> round "<reason>"',
    directive: 'execute',
    raw: 'npx gennady sdd-log <ticket> round "execute <Task-ID>"',
    cmd: 'sdd-log',
    fresh: true,
    args: (fx) => [fx.ticketPath, 'round', `execute ${fx.taskId}`],
    check: (r) => {
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /Round 1 —/);
    },
  },
  {
    id: 'sdd-log <ticket> close',
    directive: 'execute',
    raw: 'npx gennady sdd-log <ticket> close',
    cmd: 'sdd-log',
    fresh: true,
    args: (fx) => [fx.ticketPath, 'close'],
    check: (r, fx) => {
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      const body = readFileSync(join(fx.root, fx.ticketPath), 'utf-8');
      assert.match(body, /#### Round close\n- \[x\] `[^`]+` DONE/);
    },
  },
  {
    id: 'sdd-log <ticket> line "env-fix ..."',
    directive: 'execute',
    raw: 'npx gennady sdd-log <ticket> line "env-fix <file> ← <operator decision ref>"',
    cmd: 'sdd-log',
    fresh: true,
    args: (fx) => [
      fx.ticketPath,
      'line',
      'env-fix package.json ← operator approved narrower type-check script',
    ],
    check: (r, fx) => {
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      const body = readFileSync(join(fx.root, fx.ticketPath), 'utf-8');
      assert.match(
        body,
        /- \[x\] `[^`]+` env-fix package\.json ← operator approved narrower type-check script/
      );
    },
  },
  {
    id: 'sdd-log <ticket> phase <PhaseID>',
    directive: 'phase',
    raw: 'npx gennady sdd-log <ticket> phase P2 "— re-run: fix F-012"',
    cmd: 'sdd-log',
    fresh: true,
    args: (fx) => [fx.ticketPath, 'phase', 'P1'],
    check: (r, fx) => {
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      const body = readFileSync(join(fx.root, fx.ticketPath), 'utf-8');
      assert.match(body, /\n#### P1\n/);
    },
  },
  {
    id: 'sdd-log <ticket> handoff "<payload>" --phase <PhaseID>',
    directive: 'phase',
    raw: 'npx gennady sdd-log <ticket> handoff "artifacts: [src/app/greeting/greeting.ts]; decisions: [module-system=esm]; open: []; deviations: []" --phase P2',
    cmd: 'sdd-log',
    fresh: true,
    // --phase requires that phase's block already open — same STEP_1B precondition a real worker
    // always satisfies before STEP_6 runs.
    setup: (fx) => {
      runCli(['sdd-log', fx.ticketPath, 'phase', 'P2'], fx.root);
    },
    args: (fx) => [
      fx.ticketPath,
      'handoff',
      'artifacts: [src/greeter.ts]; decisions: [module-system=esm]; open: []; deviations: []',
      '--phase',
      'P2',
    ],
    check: (r, fx) => {
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      const body = readFileSync(join(fx.root, fx.ticketPath), 'utf-8');
      assert.ok(
        body.includes(
          '**Handoff →** artifacts: [src/greeter.ts]; decisions: [module-system=esm]; open: []; deviations: []'
        )
      );
    },
  },
  {
    id: 'sdd-log <ticket> blocker "<reason>" --axiom <AX> --unblock "<action>" --phase <PhaseID>',
    directive: 'phase',
    raw: 'npx gennady sdd-log <ticket> blocker "vitest binary missing" --axiom AX_ENV_FIX_CHANNEL --unblock "npm i -D vitest" --phase P2',
    cmd: 'sdd-log',
    fresh: true,
    setup: (fx) => {
      runCli(['sdd-log', fx.ticketPath, 'phase', 'P2'], fx.root);
    },
    args: (fx) => [
      fx.ticketPath,
      'blocker',
      'test runner missing',
      '--axiom',
      'AX_ENV_FIX_CHANNEL',
      '--unblock',
      'npm i -D vitest',
      '--phase',
      'P2',
    ],
    check: (r, fx) => {
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      const body = readFileSync(join(fx.root, fx.ticketPath), 'utf-8');
      assert.match(body, /- 🛑 `[^`]+` BLOCKED: test runner missing/);
      assert.match(body, /- 🔗 axiom: AX_ENV_FIX_CHANNEL/);
      assert.match(body, /- 💬 unblock: npm i -D vitest/);
    },
  },
  {
    id: 'sdd-sync <ticket>',
    directive: 'execute',
    raw: 'npx gennady sdd-sync <ticket>',
    cmd: 'sdd-sync',
    fresh: true,
    args: (fx) => [fx.ticketPath],
    check: (r, fx) => {
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, new RegExp(`^\\[sdd-sync\\] ${fx.taskId} → `));
    },
  },
  {
    id: 'sdd-state [project-root]',
    directive: 'execute',
    raw: 'npx gennady sdd-state',
    cmd: 'sdd-state',
    args: () => [],
    check: (r) => {
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /FLOW_VERSION=v2/);
    },
  },
  {
    id: 'sdd-check --task <ticket>',
    directive: 'execute',
    raw: 'npx gennady sdd-check --task <ticket>',
    cmd: 'sdd-check',
    args: (fx) => ['--task', fx.ticketPath],
    check: (r) => {
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /^\[sdd-check\]/);
    },
  },
  {
    id: 'sdd-check --all [root]',
    directive: 'audit',
    raw: 'sdd-check --all [root]',
    cmd: 'sdd-check',
    args: () => ['--all'],
    check: (r) => {
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /^\[sdd-check\]/);
    },
  },
  {
    id: 'sdd-check --changed [root]',
    directive: 'audit',
    raw: 'sdd-check --changed [root]',
    cmd: 'sdd-check',
    args: () => ['--changed'],
    check: (r) => {
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /^\[sdd-check\]/);
    },
  },
  {
    id: 'sdd-extract <file> <NAME>',
    directive: 'phase',
    raw: 'npx gennady sdd-extract <ticket> PHASE_P1',
    cmd: 'sdd-extract',
    args: (fx) => [fx.ticketPath, 'PHASE_P1'],
    check: (r) => {
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /### P1 — impl/);
    },
  },
  {
    id: 'sdd-extract <file>#<anchor>',
    directive: 'phase',
    raw: 'npx gennady sdd-extract specs/app/greeting/greeting.spec.md#module-contracts',
    cmd: 'sdd-extract',
    args: (fx) => [`${fx.specPath}#module-contracts`],
    check: (r) => {
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /Greeter/);
    },
  },
  {
    id: 'sdd-verify --profile <code|test|full>',
    directive: 'phase',
    raw: 'npx gennady sdd-verify --profile code',
    cmd: 'sdd-verify',
    // Substituting `test` for the worked example's `code`: same documented form
    // (`--profile code|test|full`), but `code`/`full` include the `yagni` gate, which sdd-verify
    // shells out to via `npx gennady yagni` — outside this fixture's control and, with no local
    // gennady install, a real npx-registry resolution attempt. `test` (format + type-check +
    // test:coverage only) stays entirely inside the fixture's own no-op npm scripts. See report.
    args: () => ['--profile', 'test'],
    check: (r) => {
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /ALL PASS/);
    },
  },
  {
    id: 'lint --spec=<module-spec> <Target Files>',
    directive: 'phase',
    raw: 'npx gennady lint --spec=specs/app/greeting/greeting.spec.md src/app/greeting/*.ts',
    cmd: 'lint',
    args: (fx) => [`--spec=${fx.specPath}`, 'src/greeter.ts'],
    check: (r) => {
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /clean|no errors/);
    },
  },
  {
    id: 'lint --spec=<module-spec> --inventory-reverse <module-code-dir>',
    directive: 'audit',
    raw: 'npx gennady lint --spec=<spec path from AuditContext> --inventory-reverse <code-root>',
    cmd: 'lint',
    args: (fx) => [`--spec=${fx.specPath}`, '--inventory-reverse', 'src'],
    check: (r) => {
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /clean|no errors/);
    },
  },
  {
    id: 'yagni .',
    directive: 'phase',
    raw: 'npx gennady yagni .',
    cmd: 'yagni',
    args: () => ['.'],
    check: (r) => {
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
    },
  },
  {
    id: 'testcov --run --min=80',
    directive: 'phase',
    raw: 'npx gennady testcov --run --min=80',
    cmd: 'testcov',
    args: () => ['--run', '--min=80'],
    check: (r) => {
      // Fixture declares no vitest/jest/c8 devDependency, so `--run` finds no runner to drive —
      // testcov's own documented "no runner detected" diagnostic path (exit 1), not a crash.
      assert.strictEqual(r.exitCode, 1, r.stdout + r.stderr);
    },
  },
];

describe('command existence — every documented command is a real gennady dispatch case', () => {
  const known = knownCommands();
  for (const c of CASES) {
    it(`${c.cmd} (case: ${c.id})`, () => {
      assert.ok(known.has(c.cmd), `"${c.cmd}" is not a case in cli/gennady.ts's dispatch switch`);
    });
  }
});

describe('documented call still present verbatim in its directive (drift guard)', () => {
  for (const c of CASES) {
    it(c.id, () => {
      assertDocumented(c.directive, c.raw);
    });
  }
});

describe('sdd-orient documented invocation contract', () => {
  const authoring = ['infra', 'scope', 'module', 'interface'];

  for (const name of authoring) {
    it(`${name} uses the pre-materialization --scope form without a positional path`, () => {
      let text = readFileSync(
        join(REPO_ROOT, 'ai', 'directives', 'sdd-v2', `${name}.directive.xml`),
        'utf-8'
      );
      if (name === 'audit') {
        text += readFileSync(
          join(REPO_ROOT, 'ai', 'directives', 'sdd-v2', 'audit', 'steps', 'STEP_2_SEMANTIC.xml'),
          'utf-8'
        );
      }
      assert.match(text, /npx gennady sdd-orient --scope <scope>/);
      assert.doesNotMatch(text, /sdd-orient [^`\n]+ --scope <scope>/);
    });
  }

  it('critic uses the existing-artifact positional form without --scope', () => {
    const text = readFileSync(
      join(REPO_ROOT, 'ai', 'directives', 'sdd-v2', 'critic.directive.xml'),
      'utf-8'
    );
    assert.match(text, /npx gennady sdd-orient <artifact-path>`/);
    assert.doesNotMatch(text, /sdd-orient <artifact-path> --scope/);
  });
});

describe('historical SDD agent-confusion regressions', () => {
  it('audit and code-review define both modes once and pass named context forward', () => {
    for (const name of ['audit', 'code-review']) {
      let text = readFileSync(
        join(REPO_ROOT, 'ai', 'directives', 'sdd-v2', `${name}.directive.xml`),
        'utf-8'
      );
      if (name === 'audit') {
        text += readFileSync(
          join(REPO_ROOT, 'ai', 'directives', 'sdd-v2', 'audit', 'steps', 'STEP_2_SEMANTIC.xml'),
          'utf-8'
        );
      }
      const context = name === 'audit' ? 'AuditContext' : 'ReviewContext';
      assert.match(text, /per-group → `npx gennady sdd-task --group-scope <id>`/);
      assert.match(text, /per-task → `npx gennady sdd-task --task-scope <Task-ID>`/);
      assert.match(text, new RegExp(`Consume .*${context}`, 's'));
      assert.match(text, /STEP_1/);
      assert.doesNotMatch(
        text,
        /FIRST action resolves the working scope via `sdd-task --group-scope/
      );
    }
  });

  it('audit preserves exact lint files and forbids shell reconstruction', () => {
    const text = readFileSync(DIRECTIVE_PATHS.audit, 'utf-8');
    const step = readFileSync(
      join(REPO_ROOT, 'ai', 'directives', 'sdd-v2', 'audit', 'steps', 'STEP_1_MECHANICAL.xml'),
      'utf-8'
    );
    assert.match(step, /AuditContext lint-files/);
    assert.match(step, /separate\s+tool calls, never a shell loop/);
    assert.doesNotMatch(step, /`gennady lint --spec=<module-spec>`/);
    assert.doesNotMatch(
      text,
      /FIRST action resolves the working scope via `sdd-task --group-scope/
    );
  });

  it('scaffold gives exact module-owned and scope-owned ticket calls', () => {
    const step = readFileSync(
      join(
        REPO_ROOT,
        'ai',
        'directives',
        'sdd-v2',
        'scaffold',
        'steps',
        'STEP_3_TASK_GENERATION.xml'
      ),
      'utf-8'
    );
    assert.match(step, /--scope <scope> --module <module> --id <ACR>-<slug>/);
    assert.match(step, /--scope <scope> --id <ACR>-<slug>/);
    assert.match(step, /omit `--module`, never invent one/);
  });

  it('skills advertise only implemented audit/review modes', () => {
    const auditSkill = readFileSync(
      join(REPO_ROOT, 'ai', 'skills', 'sdd-audit', 'SKILL.md'),
      'utf-8'
    );
    const reviewSkill = readFileSync(
      join(REPO_ROOT, 'ai', 'skills', 'sdd-code-review', 'SKILL.md'),
      'utf-8'
    );
    assert.doesNotMatch(auditSkill, /\{TSK-NN \| full tree \| current changes\}/);
    assert.match(reviewSkill, /ReviewContext/);
    assert.match(reviewSkill, /per-task|one-task/);
  });
});

describe('documented result class against a real fixture repo', () => {
  for (const c of CASES) {
    it(c.id, () => {
      const fx = c.fresh ? freshFixture() : ro;
      const cwd = c.cwd ? c.cwd(fx) : fx.root;
      c.setup?.(fx);
      const result = runCli([c.cmd, ...c.args(fx)], cwd);
      c.check(result, fx);
    });
  }
});
