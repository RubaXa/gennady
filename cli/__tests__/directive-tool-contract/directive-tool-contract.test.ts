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
import { readFileSync, readdirSync, rmSync } from 'node:fs';
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

  it('keeps task-state resolution with the stateless orchestrator before worker dispatch', () => {
    const execute = readFileSync(join(SOURCE_DIRECTIVE_ROOT, 'execute.directive.hbs'), 'utf-8');
    const calls = extractActionToolCalls(execute);
    const taskMap = calls.find((call) => call.result === 'taskMap');
    assert.strictEqual(taskMap?.owner, 'this-step');
    assert.strictEqual(taskMap?.raw, 'npx gennady sdd-task &lt;ticket&gt;');
    assert.match(
      execute,
      /Dispatch a fresh worker with the complete `phaseContext` output verbatim as the leading\s+prompt block/s
    );
    assert.match(execute, /Do not require continuation of the same worker/);
    assert.match(execute, /do not serialize a\s+checkpoint/);
  });

  it('gives each stateless public skill one structural repository-snapshot owner/result', () => {
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
      assert.match(skill, /(?:result alias |exact )`routerState`/);
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

// #endregion END_FIXTURES

type FixtureCase = {
  id: string;
  directive: DirectiveKey;
  /** @purpose The exact worked-example string this case is exercising (drift guard). */
  raw: string;
  cmd: string;
  args: (fx: Fixture) => string[];
  cwd?: (fx: Fixture) => string;
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
    raw: 'npx gennady sdd-task &lt;ticket&gt;',
    cmd: 'sdd-task',
    args: (fx) => [fx.ticketPath],
    check: (r, fx) => {
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, new RegExp(`^\\[sdd-task\\] ${fx.taskId} — `));
      assert.match(r.stdout, /Per-phase read-manifest/);
    },
  },
  {
    id: 'sdd-task --group-scope <id>',
    directive: 'audit',
    raw: 'npx gennady sdd-task --group-scope <id>',
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
    id: 'sdd-check --task <ticket>',
    directive: 'execute',
    raw: 'npx gennady sdd-check --task &lt;ticket&gt;',
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
    raw: 'npx gennady sdd-check --all .',
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
    raw: 'npx gennady sdd-check --changed .',
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

  it('critic reviews the bounded artifact set directly without an obsolete orient detour', () => {
    const text = readFileSync(
      join(REPO_ROOT, 'ai', 'directives', 'sdd-v2', 'critic.directive.xml'),
      'utf-8'
    );
    assert.match(text, /Resolve exact artifact paths and owning references/);
    assert.match(text, /Read the full bounded target/);
    assert.doesNotMatch(text, /sdd-orient|--scope/);
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
    assert.match(
      executionPlan,
      /operator approval #1 with a current marker.+Only AFTER that proof.+scaffold/s
    );
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
    const materialize = readFileSync(
      join(REPO_ROOT, 'ai', 'directives', 'sdd-v2', 'scaffold', 'steps', 'STEP_2_MATERIALIZE.xml'),
      'utf-8'
    );
    const mechanical = readFileSync(
      join(
        REPO_ROOT,
        'ai',
        'directives',
        'sdd-v2',
        'scaffold',
        'steps',
        'STEP_3_MECHANICAL_CHECK.xml'
      ),
      'utf-8'
    );
    assert.match(
      materialize,
      /--owner module --scope &lt;scope&gt; --module &lt;module&gt; --id &lt;ACR&gt;-&lt;slug&gt;/
    );
    assert.match(
      materialize,
      /--owner scope-bootstrap --scope &lt;scope&gt; --id &lt;ACR&gt;-&lt;slug&gt;/
    );
    assert.match(
      materialize,
      /--owner infrastructure-flat --scope &lt;scope&gt; --id &lt;ACR&gt;-&lt;slug&gt;/
    );
    const taskCalls = [
      ...materialize.matchAll(
        /<ToolCall owner="this-step" result="[^"]+">(npx gennady sdd-new task [\s\S]*?)<\/ToolCall>/g
      ),
    ].map((match) => match[1] as string);
    assert.strictEqual(taskCalls.length, 3, taskCalls.join('\n'));
    for (const owner of ['module', 'scope-bootstrap', 'infrastructure-flat']) {
      assert.strictEqual(materialize.match(new RegExp(`--owner ${owner}`, 'g'))?.length, 1);
      assert.strictEqual(taskCalls.filter((call) => call.includes(`--owner ${owner}`)).length, 1);
    }
    assert.doesNotMatch(materialize, /sdd-new task (?![^<\n]*--owner)/);
    assert.doesNotMatch(materialize, /--owner &lt;owner&gt;/);
    assert.match(
      materialize,
      /For each derived node call exactly one applicable `sdd-new` command/
    );
    assert.strictEqual(
      mechanical.match(
        /<ToolCall owner="this-step" result="authoringGate">npx gennady sdd-check --task &lt;ticket-path&gt; --authoring<\/ToolCall>/g
      )?.length,
      1
    );
    assert.match(mechanical, /Correct only named findings and rerun the same\s+check/s);
    assert.match(mechanical, /H_TICKET_AUTHORING_INVALID/);
    assert.match(mechanical, /result="integrityGate">npx gennady sdd-check --all \.<\/ToolCall>/);
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
      const fx = ro;
      const cwd = c.cwd ? c.cwd(fx) : fx.root;
      const result = runCli([c.cmd, ...c.args(fx)], cwd);
      c.check(result, fx);
    });
  }
});
