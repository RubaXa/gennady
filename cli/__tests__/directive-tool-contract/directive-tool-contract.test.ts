// @file: Tool-table contract test — every documented `npx gennady <cmd> ...` call in the sdd-v2
//   execute / phase-execution-protocol / audit / reconcile directives must (a) name a command gennady's own
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
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import {
  extractActionToolCalls,
  extractActionToolLiterals,
  extractDocumentedCalls,
  unclassifiedActionCommands,
  validateToolCallSyntax,
  type ActionToolCall,
  type DocumentedCall,
} from './parse-tool-calls.ts';
import { buildFixture, type Fixture } from './fixture.ts';
import { resolveAssemblyMode } from '../../../ai/kit/lazy-assembly.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const GENNADY_ENTRY = join(REPO_ROOT, 'cli', 'gennady.ts');
const GENNADY_TS = join(REPO_ROOT, 'cli', 'gennady.ts');
const SOURCE_DIRECTIVE_ROOT = join(REPO_ROOT, 'ai', 'kit', 'templates', 'sdd-v2');
const BUILT_DIRECTIVE_ROOT = join(REPO_ROOT, 'ai', 'directives', 'sdd-v2');
// Absolute loader path, not the bare `tsx` specifier: `--import tsx` resolves the bare specifier
// from the CHILD PROCESS's cwd (the fixture dir, which has no node_modules/tsx of its own), not
// from this repo — exactly the failure AX_TOOL_INVOCATION's "npx tsx <repo-root>/cli/gennady.ts"
// form is written to avoid by naming the repo root explicitly.
const TSX_LOADER = join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs');

const DIRECTIVE_PATHS = {
  execute: join(REPO_ROOT, 'ai', 'directives', 'sdd-v2', 'execute.directive.xml'),
  phase: join(REPO_ROOT, 'ai', 'directives', 'sdd-v2', 'phase-execution-protocol.directive.xml'),
  audit: join(REPO_ROOT, 'ai', 'directives', 'sdd-v2', 'audit.directive.xml'),
  reconcile: join(REPO_ROOT, 'ai', 'directives', 'sdd-v2', 'reconcile.directive.xml'),
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
function readAssemblyFragments(path: string): string[] {
  const skeletonText = readFileSync(path, 'utf-8');
  const manifestKey = relative(join(REPO_ROOT, 'ai', 'directives'), path).replaceAll('\\', '/');
  const fragments = [skeletonText];
  if (resolveAssemblyMode(manifestKey) === 'lazy') {
    const queued = [skeletonText];
    const seen = new Set<string>();
    while (queued.length > 0) {
      const owner = queued.shift()!;
      const packagePaths = [
        ...owner.matchAll(/READ_AND_USE_DIRECTIVE\("([^"\n]+\/steps\/[^"\n]+\.xml)"\)/g),
      ].map((match) => match[1]!);
      for (const packagePath of packagePaths) {
        if (seen.has(packagePath)) continue;
        seen.add(packagePath);
        const packageText = readFileSync(join(REPO_ROOT, packagePath), 'utf-8');
        fragments.push(packageText);
        queued.push(packageText);
      }
    }
  }
  return fragments;
}

function extractDocumentedCallsAcrossAssembly(path: string): DocumentedCall[] {
  const fragments = readAssemblyFragments(path);

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

/** @purpose Recursively enumerate every callable source directive, including agent-inbox and lazy owners. */
function sourceDirectivePaths(dir = SOURCE_DIRECTIVE_ROOT): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      return entry.isDirectory() ? sourceDirectivePaths(path) : [path];
    })
    .filter((path) => path.endsWith('.directive.hbs'))
    .sort();
}

function extractActionToolCallsAcrossAssembly(path: string): ActionToolCall[] {
  return readAssemblyFragments(path).flatMap(extractActionToolCalls);
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

// #region START_ACTION_INVENTORY — authoritative execution inventory. Source discovery and
// classification are structural: adding a directive or an Action call expands the audited set
// automatically; no frozen file/marker count can turn an unmarked new action into a false green.
describe('callable SDD-v2 action-call inventory', () => {
  const sources = sourceDirectivePaths();
  const inventory = sources.flatMap((path) =>
    extractActionToolCalls(readFileSync(path, 'utf-8')).map((call) => ({ path, call }))
  );

  it('discovers every callable source directive and classifies every Action command', () => {
    assert.ok(sources.length > 0);
    assert.ok(inventory.length > 0);
    for (const path of sources) {
      assert.deepStrictEqual(
        unclassifiedActionCommands(readFileSync(path, 'utf-8')),
        [],
        `${relative(REPO_ROOT, path)} has an unclassified npx gennady Action spelling`
      );
    }
  });

  it('uses a real dispatcher command, valid CLI shape, local provenance, and explicit result reuse', () => {
    const commands = knownCommands();
    const argless = new Set(['sdd-state', 'sdd-task']);
    for (const { path, call } of inventory) {
      const label = `${relative(REPO_ROOT, path)}:${call.stepId}:${call.raw}`;
      assert.match(call.raw, /^npx gennady [a-zA-Z0-9-]+(?:\s|$)/, label);
      assert.ok(commands.has(call.cmd), `${label}: dispatcher has no case '${call.cmd}'`);
      assert.doesNotMatch(call.raw, /(?:^|\s)--help(?:\s|$)/, label);
      assert.strictEqual(validateToolCallSyntax(call), null, label);
      assert.match(call.owner, /^[a-z][a-z0-9-]*$/, `${label}: invalid executor owner`);
      assert.match(call.result, /^[a-z][A-Za-z0-9]*$/, `${label}: invalid result alias`);
      assert.ok(
        call.argsRaw.length > 0 || argless.has(call.cmd),
        `${label}: command requires locally documented arguments`
      );
      for (const placeholder of new Set(call.raw.match(/<[^>\n]+>|\[[a-z][^\]\n]*\]/gi) ?? [])) {
        assert.ok(
          call.actionContext.includes(placeholder),
          `${label}: no local provenance for ${placeholder}`
        );
      }
      if (call.result !== 'terminal') {
        assert.match(
          call.actionContext,
          new RegExp(`\\b${call.result}\\b`),
          `${label}: result alias is not reused`
        );
      }
    }
  });

  it('classifies non-executed spellings as typed ToolLiterals with valid CLI syntax', () => {
    for (const path of sources) {
      for (const literal of extractActionToolLiterals(readFileSync(path, 'utf-8'))) {
        const label = `${relative(REPO_ROOT, path)}:${literal.stepId}:${literal.raw}`;
        assert.strictEqual(validateToolCallSyntax(literal), null, label);
      }
    }
  });

  it('keeps source and built/lazy assemblies coherent', () => {
    for (const sourcePath of sources) {
      const relativePath = relative(SOURCE_DIRECTIVE_ROOT, sourcePath).replace(/\.hbs$/, '.xml');
      const builtPath = join(BUILT_DIRECTIVE_ROOT, relativePath);
      const sourceCalls = extractActionToolCalls(readFileSync(sourcePath, 'utf-8'));
      const builtCalls = extractActionToolCallsAcrossAssembly(builtPath);
      const key = (call: ActionToolCall) =>
        [call.stepId, call.owner, call.result, call.raw].join('\u0000');
      assert.deepStrictEqual(
        builtCalls.map(key),
        sourceCalls.map(key),
        `${relativePath}: source/built action-call inventory drift`
      );
    }
  });

  it('rejects malformed or unowned structural markers', () => {
    assert.throws(
      () =>
        extractActionToolCalls(
          '<Step id="STEP_X"><Action><ToolCall owner="this-step" result="state">npx gennady sdd-state</Action></Step>'
        ),
      /unpaired ToolCall/
    );
    assert.throws(
      () =>
        extractActionToolCalls(
          '<Step id="STEP_X"><ToolCall owner="this-step" result="state">npx gennady sdd-state<\/ToolCall><Action>none<\/Action><\/Step>'
        ),
      /outside a paired <Step><Action>|malformed/
    );
    assert.throws(
      () =>
        extractActionToolCalls(
          '<Step id="STEP_X"><Action><ToolCall>npx gennady sdd-state</ToolCall></Action></Step>'
        ),
      /malformed/
    );
  });

  it('registers scaffold feasibility and rejects an unmarked Action call or invalid flags', () => {
    assert.deepStrictEqual(
      unclassifiedActionCommands(
        '<Step id="STEP_X"><Action>Run `npx gennady sdd-state` now.</Action></Step>'
      ),
      ['STEP_X: npx gennady sdd-state']
    );
    assert.match(
      validateToolCallSyntax({
        raw: 'npx gennady sdd-task --mystery x',
        cmd: 'sdd-task',
        argsRaw: '--mystery x',
      }) ?? '',
      /unknown flag/
    );
    assert.match(
      validateToolCallSyntax({
        raw: 'npx gennady sdd-task ticket --phase P1 --phase P2',
        cmd: 'sdd-task',
        argsRaw: 'ticket --phase P1 --phase P2',
      }) ?? '',
      /repeated/
    );
    assert.strictEqual(
      validateToolCallSyntax({
        raw: 'npx gennady sdd-check --scaffold-feasibility',
        cmd: 'sdd-check',
        argsRaw: '--scaffold-feasibility',
      }),
      null
    );
    assert.strictEqual(
      validateToolCallSyntax({
        raw: 'npx gennady sdd-check --scaffold-feasibility <project-root>',
        cmd: 'sdd-check',
        argsRaw: '--scaffold-feasibility <project-root>',
      }),
      null
    );
    assert.match(
      validateToolCallSyntax({
        raw: 'npx gennady sdd-check --scaffold-feasibility first second',
        cmd: 'sdd-check',
        argsRaw: '--scaffold-feasibility first second',
      }) ?? '',
      /accepts at most one root/
    );
    assert.match(
      validateToolCallSyntax({
        raw: 'npx gennady sdd-check --task ticket.md --phase P1',
        cmd: 'sdd-check',
        argsRaw: '--task ticket.md --phase P1',
      }) ?? '',
      /--phase requires --authoring/
    );
    assert.strictEqual(
      validateToolCallSyntax({
        raw: 'npx gennady sdd-check --task ticket.md --authoring --phase P1',
        cmd: 'sdd-check',
        argsRaw: '--task ticket.md --authoring --phase P1',
      }),
      null
    );
  });

  it('attributes phase context to the phase worker and returns retries to the original audit call', () => {
    const execute = readFileSync(join(SOURCE_DIRECTIVE_ROOT, 'execute.directive.hbs'), 'utf-8');
    const calls = extractActionToolCalls(execute);
    const phase = calls.find((call) => call.result === 'phaseContext');
    assert.strictEqual(phase?.owner, 'phase-worker');
    assert.strictEqual(
      calls.filter((call) => call.raw === 'npx gennady sdd-task --audit-group <ticket>').length,
      1
    );
    assert.match(execute, /return to STEP_5's original `auditGroup` owner\/result and re-run it/);
  });

  it('gives each stateful public skill one structural initial-state owner/result', () => {
    for (const name of ['sdd', 'sdd-execute', 'sdd-scaffold', 'sdd-reconcile', 'sdd-critic']) {
      const skill = readFileSync(join(REPO_ROOT, 'ai', 'skills', name, 'SKILL.md'), 'utf-8');
      const calls = [
        ...skill.matchAll(
          /<ToolCall owner="([^"]+)" result="([^"]+)">(npx gennady sdd-state)<\/ToolCall>/g
        ),
      ];
      assert.equal(calls.length, 1, `${name}: exactly one structural state call`);
      assert.strictEqual(calls[0]![1], 'entry-skill');
      assert.strictEqual(calls[0]![2], 'routerState');
      assert.strictEqual(
        validateToolCallSyntax({ raw: calls[0]![3]!, cmd: 'sdd-state', argsRaw: '' }),
        null
      );
      assert.match(skill, /Use routerState as the literal stdout snapshot\./);
    }
  });
});
// #endregion END_ACTION_INVENTORY

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
    id: 'sdd-task --audit-group <ticket>',
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
    id: 'sdd-task --task-scope <Task-ID>',
    directive: 'audit',
    raw: 'npx gennady sdd-task --task-scope <Task-ID>',
    cmd: 'sdd-task',
    args: (fx) => ['--task-scope', fx.taskId],
    check: (r, fx) => {
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, new RegExp(`^  ${fx.taskId} \\[ \\] TODO → ${fx.ticketPath}$`, 'm'));
      assert.match(r.stdout, /^lint-files:$/m);
      assert.match(r.stdout, /^code-roots: .+$/m);
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
    id: 'sdd-log env-fix from a file-backed payload',
    directive: 'execute',
    raw: 'npx gennady sdd-log <ticket> line --content-file .claude/tmp/<task-id>-env-fix.txt --phase <PhaseID>',
    cmd: 'sdd-log',
    fresh: true,
    setup: (fx) => {
      runCli(['sdd-log', fx.ticketPath, 'phase', 'P1'], fx.root);
      mkdirSync(join(fx.root, '.claude', 'tmp'), { recursive: true });
      writeFileSync(
        join(fx.root, '.claude', 'tmp', 'TSK-x-env-fix.txt'),
        'env-fix package.json ← operator approved narrower type-check script'
      );
    },
    args: (fx) => [
      fx.ticketPath,
      'line',
      '--content-file',
      '.claude/tmp/TSK-x-env-fix.txt',
      '--phase',
      'P1',
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
    id: 'sdd-log phase from a file-backed rerun suffix',
    directive: 'phase',
    raw: 'npx gennady sdd-log <ticket> phase <PhaseID> --content-file .claude/tmp/<task-id>-<phase-id>-log.txt',
    cmd: 'sdd-log',
    fresh: true,
    setup: (fx) => {
      mkdirSync(join(fx.root, '.claude', 'tmp'), { recursive: true });
      writeFileSync(join(fx.root, '.claude', 'tmp', 'phase-log.txt'), '— re-run: fix F-012');
    },
    args: (fx) => [fx.ticketPath, 'phase', 'P1', '--content-file', '.claude/tmp/phase-log.txt'],
    check: (r, fx) => {
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      const body = readFileSync(join(fx.root, fx.ticketPath), 'utf-8');
      assert.match(body, /\n#### P1 — re-run: fix F-012\n/);
    },
  },
  {
    id: 'sdd-log handoff from a file-backed payload',
    directive: 'phase',
    raw: 'npx gennady sdd-log <ticket> handoff --content-file .claude/tmp/<task-id>-<phase-id>-handoff.txt --phase <PhaseID>',
    cmd: 'sdd-log',
    fresh: true,
    // --phase requires that phase's block already open — same STEP_1B precondition a real worker
    // always satisfies before STEP_6 runs.
    setup: (fx) => {
      runCli(['sdd-log', fx.ticketPath, 'phase', 'P2'], fx.root);
      mkdirSync(join(fx.root, '.claude', 'tmp'), { recursive: true });
      writeFileSync(
        join(fx.root, '.claude', 'tmp', 'handoff.txt'),
        'artifacts: [src/greeter.ts]; decisions: [module-system=esm]; open: []; deviations: []'
      );
    },
    args: (fx) => [
      fx.ticketPath,
      'handoff',
      '--content-file',
      '.claude/tmp/handoff.txt',
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
    id: 'sdd-log blocker from a file-backed JSON payload',
    directive: 'phase',
    raw: 'npx gennady sdd-log <ticket> blocker --payload-file .claude/tmp/<task-id>-<phase-id>-blocker.json --phase <PhaseID>',
    cmd: 'sdd-log',
    fresh: true,
    setup: (fx) => {
      runCli(['sdd-log', fx.ticketPath, 'phase', 'P2'], fx.root);
      mkdirSync(join(fx.root, '.claude', 'tmp'), { recursive: true });
      writeFileSync(
        join(fx.root, '.claude', 'tmp', 'blocker.json'),
        JSON.stringify({
          reason: 'test runner missing',
          axiom: 'AX_ENV_FIX_CHANNEL',
          unblock: 'npm i -D vitest',
        })
      );
    },
    args: (fx) => [
      fx.ticketPath,
      'blocker',
      '--payload-file',
      '.claude/tmp/blocker.json',
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
    id: 'reconcile direct sdd-check --all <verification-root>',
    directive: 'reconcile',
    raw: 'npx gennady sdd-check --all <verification-root>',
    cmd: 'sdd-check',
    args: () => ['--all'],
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
    id: 'sdd-verify --task <ticket-path> --phase <PhaseID>',
    directive: 'phase',
    raw: 'npx gennady sdd-verify --task specs/app/app.task.TSK-1.md --phase P2',
    cmd: 'sdd-verify',
    args: (fx) => ['--task', fx.ticketPath, '--phase', 'P1'],
    check: (r) => {
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /ALL PASS/);
    },
  },
  {
    id: 'lint --spec=<module-spec> --inventory-reverse <module-code-dir>',
    directive: 'audit',
    raw: 'npx gennady lint --spec=<spec-path> --inventory-reverse <code-root>',
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
    assert.match(text, /npx gennady sdd-orient <artifact-path><\/ToolCall>/);
    assert.doesNotMatch(text, /sdd-orient <artifact-path> --scope/);
  });
});

describe('review publication documented invocation contract', () => {
  it('critic derives and lifecycle rechecks the same exact CLI form without --help', () => {
    const critic = readFileSync(
      join(REPO_ROOT, 'ai', 'directives', 'sdd-v2', 'critic.directive.xml'),
      'utf-8'
    );
    const lifecycle = readFileSync(
      join(REPO_ROOT, 'ai', 'directives', 'sdd-v2', 'review-lifecycle.directive.xml'),
      'utf-8'
    );
    const exact = 'npx gennady sdd-check --review-publication <primary> [secondary...]';

    assert.match(critic, new RegExp(exact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(lifecycle, new RegExp(exact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(
      [critic, lifecycle].join('\n'),
      /sdd-check --review-publication[^`\n]*--help/
    );
    assert.ok(knownCommands().has('sdd-check'));
  });

  it('pins branch and PR identity while keeping hostile PR body bytes out of shell commands', () => {
    const lifecycle = readFileSync(
      join(REPO_ROOT, 'ai', 'directives', 'sdd-v2', 'review-lifecycle.directive.xml'),
      'utf-8'
    );
    const publish =
      lifecycle.match(/<Step id="STEP_3_PUBLISH_FINAL_BYTES">([\s\S]*?)<\/Step>/)?.[1] ?? '';
    const merge =
      lifecycle.match(/<Step id="STEP_6_MERGE_REVIEWED_COMMIT">([\s\S]*?)<\/Step>/)?.[1] ?? '';

    const addAt = publish.indexOf('git add -- <publication-files>');
    const commitAt = publish.indexOf('git commit -m');
    const branchChecks = [...publish.matchAll(/git branch --show-current/g)].map(
      (match) => match.index
    );
    assert.ok(addAt > 0 && commitAt > addAt);
    assert.ok(
      branchChecks.some((at) => at > publish.indexOf('Immediately before staging') && at < addAt)
    );
    assert.ok(branchChecks.some((at) => at > addAt && at < commitAt));
    assert.match(publish, /H_CURRENT_BRANCH_MISMATCH.+before\s+any VCS mutation/s);
    assert.match(
      publish,
      /gh pr list --head <head-branch> --base <base-branch> --state open --json number,url --limit 2/
    );
    assert.match(publish, /exactly one row after creation/);
    assert.match(publish, /store the one literal `<pr-number>` and `<pr-url>`/);

    const exactMutations = [...lifecycle.matchAll(/`(gh pr (?:create|edit)[^`\n]+)`/g)].map(
      (match) => match[1]!
    );
    const hostileBody = [
      '# Markdown',
      '`code` and ```fence```',
      '$(touch never)',
      '"double" and \'single\'',
    ].join('\n');
    assert.ok(exactMutations.length >= 2);
    for (const command of exactMutations) {
      assert.match(command, /--body-file <pr-body-path>/);
      assert.doesNotMatch(command, /(?:^|\s)--body(?:\s|=)/);
      for (const hostileLine of hostileBody.split('\n')) {
        assert.ok(!command.includes(hostileLine));
      }
    }

    assert.match(publish, /git commit -m "sdd\(<review-slug>\): publish specification"/);
    assert.match(publish, /gh pr edit <pr-number> /);
    assert.match(publish, /gh pr view <pr-number> /);
    assert.match(merge, /gh pr view <pr-number> /);
    assert.match(merge, /gh pr merge <pr-number> --merge --match-head-commit <reviewed-commit>/);
    assert.doesNotMatch(lifecycle, /gh pr (?:view|edit|merge) --/);
    assert.doesNotMatch(lifecycle, /\$\(|`echo\s|&(?:gt|lt|amp);/);
    assert.doesNotMatch(lifecycle, /<commit-title>|<pr-title>|<pr-body>/);
  });
});

describe('historical SDD agent-confusion regressions', () => {
  it('reconcile has no bare sync action and gives direct edits one exact receipt command', () => {
    const text = readFileSync(DIRECTIVE_PATHS.reconcile, 'utf-8');
    const executionPlan = text.match(/<ExecutionPlan>([\s\S]*?)<\/ExecutionPlan>/)?.[1] ?? '';

    assert.doesNotMatch(executionPlan, /sdd-sync/);
    assert.match(executionPlan, /npx gennady sdd-check --all <verification-root>/);
    assert.match(executionPlan, /DIRECT_VERIFICATION_RECEIPT/);
    assert.match(executionPlan, /one-line fix.+new Round/s);
    assert.match(executionPlan, /publication=MERGED.+Only AFTER that proof.+scaffold/s);
  });

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
    assert.match(
      step,
      /<ToolCall owner="audit-worker" result="auditContext">npx gennady sdd-task --task-scope <Task-ID><\/ToolCall>/
    );
    assert.doesNotMatch(step, /per-task →\s*`npx gennady sdd-task\s*<ticket-path>`/);
    assert.match(step, /separate\s+tool calls, never a shell loop/);
    assert.doesNotMatch(step, /`gennady lint --spec=<module-spec>`/);
    assert.doesNotMatch(
      text,
      /FIRST action resolves the working scope via `sdd-task --group-scope/
    );
  });

  it('scaffold exhaustively maps every legal DAG owner to one exact ticket call', () => {
    const generation = readFileSync(
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
    const step = readFileSync(
      join(REPO_ROOT, 'ai', 'directives', 'sdd-v2', 'scaffold', 'steps', 'STEP_3_TICKET_LOOP.xml'),
      'utf-8'
    );
    assert.match(step, /--owner module --scope <scope> --module <module> --id <ACR>-<slug>/);
    assert.match(step, /--owner scope-bootstrap --scope <scope> --id <ACR>-<slug>/);
    assert.match(step, /--owner infrastructure-flat --scope <scope> --id <ACR>-<slug>/);
    assert.match(step, /table is exhaustive/);
    const taskCalls = [
      ...step.matchAll(
        /<ToolCall owner="this-step" result="[^"]+">(npx gennady sdd-new task [\s\S]*?)<\/ToolCall>/g
      ),
    ].map((match) => match[1] as string);
    assert.strictEqual(taskCalls.length, 3, taskCalls.join('\n'));
    for (const owner of ['module', 'scope-bootstrap', 'infrastructure-flat']) {
      assert.strictEqual(step.match(new RegExp(`--owner ${owner}`, 'g'))?.length, 1);
      assert.strictEqual(taskCalls.filter((call) => call.includes(`--owner ${owner}`)).length, 1);
    }
    assert.doesNotMatch(step, /sdd-new task (?![^<\n]*--owner)/);
    assert.doesNotMatch(step, /--owner <owner>/);
    assert.match(step, /run its one exact `sdd-new` ToolCall/);
    assert.match(
      step,
      /copy the manifest's path-aware owning-spec\/rule\/deferred literals verbatim/i
    );
    assert.strictEqual(
      step.match(
        /<ToolCall owner="this-step" result="phaseAuthoringFeedback">npx gennady sdd-check --task <created-ticket-path> --authoring --phase <PhaseID><\/ToolCall>/g
      )?.length,
      1
    );
    assert.strictEqual(
      step.match(
        /<ToolCall owner="this-step" result="authoringGate">npx gennady sdd-check --task <created-ticket-path> --authoring<\/ToolCall>/g
      )?.length,
      1
    );
    assert.match(step, /GREEN authoringGate authorizes\s+selecting the next STEP_2 node/);
    assert.match(step, /at most three repair attempts.+H_TICKET_AUTHORING_INVALID/s);
    assert.match(generation, /Do NOT form, draft, or retain any node's ticket content here/);
    assert.match(generation, /Pass only the ordered node identities plus shared facts/);
    assert.doesNotMatch(generation, /complete ticket-content plan|complete ordered plans/);
    assert.doesNotMatch(step, /authoring[^\n]*(?:&&|;|\|\|)/);
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
