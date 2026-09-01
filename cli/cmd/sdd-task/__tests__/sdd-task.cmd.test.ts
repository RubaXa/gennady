// @file: Integration tests for SddTaskCommand#run — planning surface, manifests, gate-matching, exit codes.
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import {
  formatPhaseReceipt,
  phaseReceiptPlanState,
  phaseReceiptTargetState,
  phaseVerificationEnvironmentState,
  type PhaseReceipt,
  type PhaseReceiptPlan,
} from '../../../../shared/sdd/phase-receipt.ts';

type TaskModule = typeof import('../sdd-task.cmd.ts');

/**
 * Make a fixture dir execution-ready (real eight scripts + a gennady bin stub) — the --phase gate
 * refuses impl/refactor/test phases on anything less, so tests that aren't about the gate need this.
 */
function writeExecutionReadyInfra(root: string): void {
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'fixture-app',
      scripts: {
        'type-check': 'tsc --noEmit',
        test: 'node --test',
        'test:coverage': 'c8 node --test',
        format: 'prettier --check .',
        'format:fix': 'prettier --write',
        lint: 'gennady lint src/',
        'lint:fix': 'eslint --fix',
        fix: 'npm run format:fix -- . && npm run lint:fix -- src/',
      },
    }),
    'utf-8'
  );
  const binDir = join(root, 'node_modules', '.bin');
  mkdirSync(binDir, { recursive: true });
  writeFileSync(join(binDir, 'gennady'), '#!/usr/bin/env node\nprocess.exit(0);\n', 'utf-8');
}

function writeDeclaredPhaseTargets(root: string): void {
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src', 'foo.ts'), 'export const foo = true;\n', 'utf-8');
  writeFileSync(join(root, 'src', 'foo.test.ts'), "import './foo.ts';\n", 'utf-8');
  writeFileSync(join(root, 'src', 'real.ts'), 'export const real = true;\n', 'utf-8');
}

/** @purpose Deny one read in hosts that enforce chmod; skip only the platform-sensitive assertion otherwise. */
function denyRead(
  context: { skip(message?: string): void },
  path: string,
  kind: 'file' | 'directory'
): boolean {
  chmodSync(path, 0o000);
  try {
    if (kind === 'file') readFileSync(path, 'utf-8');
    else readdirSync(path);
    context.skip('chmod does not deny reads for this test process');
    return false;
  } catch {
    return true;
  }
}

function writeInfraGateContract(root: string): void {
  mkdirSync(join(root, 'specs', 'infra-core'), { recursive: true });
  writeFileSync(
    join(root, 'specs', 'infra-core', 'infra-core.spec.md'),
    [
      '<!--SECTION:BOOTSTRAP_REQUIREMENTS-->',
      '| Requirement | Kind | Owner | Resolution | Readiness Gates | Gate Artifacts |',
      '|---|---|---|---|---|---|',
      '| tooling | tool | this-scope-task | create | package.json, type-check, test, test:coverage, format, format:fix, lint, lint:fix, fix, gennady | src/foo.ts |',
      '<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->',
    ].join('\n')
  );
}

function claimAllReadinessGates(ticketContent: string): string {
  return ticketContent.replace(
    '  - src/foo.ts',
    '  - src/foo.ts\n- **Readiness Gates:**\n  - package.json\n  - type-check\n  - test\n  - test:coverage\n  - format\n  - format:fix\n  - lint\n  - lint:fix\n  - fix\n  - gennady'
  );
}

let mod: TaskModule;
let origExit: typeof process.exit;
let origArgv: string[];
let origCwd: string;
let dir: string;
let ticket: string;

const TICKET = [
  '# Task: cli-foo — Foo',
  '<!--SECTION:META-->',
  '## 1. Meta',
  '- **Task-ID:** cli-foo',
  '- **Status:** [ ] TODO',
  '- **Purpose:** Build the foo',
  '- **Scope:** cli',
  '- **Module:** core',
  '- **Dependencies:** None',
  '- **Spec References:**',
  '  - Contract: [FooPort](specs/cli/core/core.spec.md#fooport)',
  '<!--/SECTION:META-->',
  '<!--SECTION:PHASES_OVERVIEW-->',
  '| ID | Kind | Deps | Status |',
  '|----|------|------|--------|',
  '| P1 | impl | — | [ ] |',
  '| P2 | test | P1 | [ ] |',
  '<!--/SECTION:PHASES_OVERVIEW-->',
  '<!--SECTION:PHASE_P1-->',
  '### P1 — impl',
  '- **Objective:** implement foo',
  '- **Rules:**',
  '  - [typescript-rules](ai/directives/coding/typescript-rules.xml)',
  '- **Target Files:**',
  '  - src/foo.ts',
  '- **Inputs:** none',
  '- **Exit:** foo.ts compiles and exports Foo',
  '<!--/SECTION:PHASE_P1-->',
  '<!--SECTION:PHASE_P2-->',
  '### P2 — test',
  '- **Objective:** test foo',
  '- **Rules:**',
  '  - [node-test](ai/directives/testing/node-test.xml)',
  '- **Target Files:**',
  '  - src/foo.test.ts',
  '- **Inputs:** P1 handoff',
  '<!--/SECTION:PHASE_P2-->',
  '<!--SECTION:VERIFICATION-->',
  '| Command | Required by | Role |',
  '|---------|-------------|------|',
  '| npm run type-check | typescript-rules | extra |',
  '| npm run test | node-test | extra |',
  '<!--/SECTION:VERIFICATION-->',
].join('\n');

function argv(...rest: string[]): string[] {
  return ['node', 'gennady', 'sdd-task', ...rest];
}

function fixtureRootFor(path: string): string {
  if (path === dir || path.startsWith(`${dir}/`)) return dir;
  const specsAt = path.indexOf('/specs/');
  return specsAt === -1 ? dirname(path) : path.slice(0, specsAt);
}

function normalizeTicketArgs(rawArgs: string[]): { args: string[]; root: string } {
  let root = process.cwd() === origCwd ? dir : process.cwd();
  const absoluteOperand = rawArgs.slice(3).find((value) => isAbsolute(value));
  if (absoluteOperand) {
    root =
      existsSync(absoluteOperand) && statSync(absoluteOperand).isDirectory()
        ? absoluteOperand
        : fixtureRootFor(absoluteOperand);
  }
  return {
    root,
    args: rawArgs.map((value, index) =>
      index >= 3 && isAbsolute(value) && value !== root && !value.endsWith('/')
        ? relative(root, value)
        : value
    ),
  };
}

async function withTemporaryCwd<T>(root: string, fn: () => Promise<T>): Promise<T> {
  const original = process.cwd();
  process.chdir(root);
  try {
    return await fn();
  } finally {
    process.chdir(original);
  }
}

describe('SddTaskCommand', () => {
  before(async () => {
    origExit = process.exit;
    origArgv = process.argv;
    origCwd = process.cwd();
    process.exit = ((_code?: number) => undefined) as typeof process.exit;
    process.argv = ['node', 'gennady', 'sdd-task'];
    dir = mkdtempSync(join(tmpdir(), 'sdd-task-'));
    ticket = join(dir, 'ticket.md');
    writeFileSync(ticket, TICKET, 'utf-8');
    writeExecutionReadyInfra(dir);
    writeDeclaredPhaseTargets(dir);
    const loaded = await import('../sdd-task.cmd.ts');
    mod = {
      ...loaded,
      run: (rawArgs) => {
        const normalized = normalizeTicketArgs(rawArgs);
        return loaded.run(normalized.args, normalized.root);
      },
    };
  });

  after(() => {
    process.exit = origExit;
    process.argv = origArgv;
    rmSync(dir, { recursive: true, force: true });
  });

  it('emits Meta, phases, per-phase manifests, and gates', async () => {
    const outcome = await mod.run(argv(ticket));
    assert.strictEqual(outcome.ok, true);
    if (!outcome.ok) return;
    const t = outcome.text;
    assert.match(t, /\[sdd-task\] cli-foo — \[ \] TODO/);
    assert.match(t, /Contract: FooPort \(specs\/cli\/core\/core\.spec\.md#fooport\)/);
    assert.match(t, /P1 impl  deps=—  status=\[ \]/);
    assert.match(t, /▸ P1 — impl/);
    assert.match(t, /READ rules:  ai\/directives\/coding\/typescript-rules\.xml/);
    assert.match(t, /READ files:  src\/foo\.ts/);
    assert.match(t, /exit:        foo\.ts compiles and exports Foo/);
    assert.match(t, /DO NOT READ/);
  });

  it('rejects unknown flags, missing value flags, extra positionals, and conflicting modes', async () => {
    const invalid = [
      argv('--typo'),
      argv('--phase'),
      argv(ticket, '--phase'),
      argv(ticket, 'extra.md'),
      argv(ticket, 'sdd-task'),
      argv('--audit-group', ticket, '--group-scope', ticket),
      argv(ticket, '--phase', 'P1', '--task-scope', ticket),
      argv('--audit-group', ticket, 'extra.md'),
    ];
    for (const rawArgs of invalid) {
      const outcome = await mod.run(rawArgs);
      assert.strictEqual(outcome.ok === false && outcome.exitCode, 4);
      if (outcome.ok) continue;
      assert.match(outcome.message, /usage: gennady sdd-task/);
    }
  });

  it('no EXECUTION_LOG section → [BLOCKERS] reports blockers: none', async () => {
    const outcome = await mod.run(argv(ticket));
    assert.strictEqual(outcome.ok, true);
    if (!outcome.ok) return;
    assert.match(outcome.text, /\[BLOCKERS\]\nblockers: none/);
  });

  it('no active blockers → next: hint points at running phases per protocol', async () => {
    const outcome = await mod.run(argv(ticket));
    assert.strictEqual(outcome.ok, true);
    if (!outcome.ok) return;
    assert.match(outcome.text, /next: открой тикет, исполняй фазы по протоколу/);
  });

  it('an unresolved 🛑 BLOCKED entry surfaces as blockers: ACTIVE 1 plus its line text', async () => {
    const t = join(dir, 'blocked.md');
    writeFileSync(
      t,
      [
        TICKET,
        '<!--SECTION:EXECUTION_LOG-->',
        '#### P1',
        '- 🛑 BLOCKED waiting on operator decision',
        '<!--/SECTION:EXECUTION_LOG-->',
      ].join('\n'),
      'utf-8'
    );
    const outcome = await mod.run(argv(t));
    assert.strictEqual(outcome.ok, true);
    if (!outcome.ok) return;
    assert.match(outcome.text, /\[BLOCKERS\]\nblockers: ACTIVE 1/);
    assert.match(outcome.text, /- 🛑 BLOCKED waiting on operator decision/);
    assert.match(outcome.text, /next: сначала разбери активные блокеры с оператором/);
  });

  it('a resolved blocker (later ✅ RESOLVED) reports blockers: none', async () => {
    const t = join(dir, 'resolved.md');
    writeFileSync(
      t,
      [
        TICKET,
        '<!--SECTION:EXECUTION_LOG-->',
        '#### P1',
        '- 🛑 BLOCKED waiting on operator decision',
        '- ✅ RESOLVED operator chose B',
        '<!--/SECTION:EXECUTION_LOG-->',
      ].join('\n'),
      'utf-8'
    );
    const outcome = await mod.run(argv(t));
    assert.strictEqual(outcome.ok, true);
    if (!outcome.ok) return;
    assert.match(outcome.text, /\[BLOCKERS\]\nblockers: none/);
  });

  it('matches gates to a phase by rule-id (Required-by ∩ phase rules)', async () => {
    const outcome = await mod.run(argv(ticket));
    assert.strictEqual(outcome.ok, true);
    if (!outcome.ok) return;
    // P1 uses typescript-rules → only the type-check gate; P2 uses node-test → only the test gate
    const p1 = outcome.text.slice(outcome.text.indexOf('▸ P1'), outcome.text.indexOf('▸ P2'));
    assert.match(p1, /gates:       npm run type-check/);
    assert.doesNotMatch(p1, /gates:.*npm run test\b/);
  });

  it('exits 2 when the file is not a ticket (no Meta)', async () => {
    const noMeta = join(dir, 'plain.md');
    writeFileSync(noMeta, '# just a doc\n\nno sections here\n', 'utf-8');
    const outcome = await mod.run(argv(noMeta));
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) assert.strictEqual(outcome.exitCode, 2);
  });

  it('exits 1 on a missing file — the hint points at the map (tool-teaches)', async () => {
    const missing = await mod.run(argv(join(dir, 'nope.md')));
    assert.strictEqual(missing.ok === false && missing.exitCode, 1);
    if (missing.ok) return;
    assert.match(missing.message, /run `sdd-task` with no arguments for the execution map/);
  });

  it('no Task-ID → emits the execution map (deterministic pickable set)', async () => {
    const r = await mod.run(argv());
    assert.strictEqual(r.ok, true);
    assert.match(r.text, /execution map/);
  });

  it('execution map with a pickable ticket → next: hint points at sdd-task <id>', async () => {
    const origCwd = process.cwd();
    process.chdir(dir);
    try {
      const r = await mod.run(argv());
      assert.strictEqual(r.ok, true);
      if (!r.ok) return;
      // Sibling files accumulated by earlier tests (blocked.md, resolved.md) also carry Task-ID
      // cli-foo — assert structure (root line, ≥1 per-line pickable path), not a specific filename.
      assert.match(r.text, /^root: /m);
      assert.match(r.text, /pickable \(ready now\):\n(?: {2}cli-foo → \S+\n?)+/);
      assert.match(r.text, /next: возьми Task-ID из pickable и вызови `sdd-task <id>`/);
    } finally {
      process.chdir(origCwd);
    }
  });

  it('map emits a root line and per-line path for a graph-ready ticket blocked by runtime readiness', async () => {
    const mapDir = mkdtempSync(join(tmpdir(), 'sdd-task-map-'));
    writeFileSync(
      join(mapDir, 'ticket.md'),
      [TICKET, '<!--SECTION:EXECUTION_LOG-->', '<!--/SECTION:EXECUTION_LOG-->'].join('\n'),
      'utf-8'
    );
    const origCwd = process.cwd();
    process.chdir(mapDir);
    try {
      const r = await mod.run(argv());
      assert.strictEqual(r.ok, true);
      if (!r.ok) return;
      // `resolve('.')` follows symlinks (e.g. macOS /tmp → /private/tmp) so the printed root may not
      // be byte-identical to `mapDir` — assert it names a real, absolute directory instead.
      assert.match(r.text, /^root: \/\S*$/m);
      assert.match(r.text, /pickable \(ready now\): — none/);
      assert.match(r.text, /blocked: cli-foo ← EXECUTION_READY=no  →  ticket\.md$/m);
      assert.match(r.text, /portal\/GATE_QUEUE cannot be resolved/);
    } finally {
      process.chdir(origCwd);
      rmSync(mapDir, { recursive: true, force: true });
    }
  });

  it("a positional project root (no chdir needed) applies that root's readiness to its map", async () => {
    const mapDir = mkdtempSync(join(tmpdir(), 'sdd-task-map-root-'));
    writeFileSync(
      join(mapDir, 'ticket.md'),
      [TICKET, '<!--SECTION:EXECUTION_LOG-->', '<!--/SECTION:EXECUTION_LOG-->'].join('\n'),
      'utf-8'
    );
    try {
      const r = await mod.run(argv(mapDir));
      assert.strictEqual(r.ok, true);
      if (!r.ok) return;
      assert.match(r.text, /^\[sdd-task\] execution map/);
      assert.match(r.text, /pickable \(ready now\): — none/);
      assert.match(r.text, /blocked: cli-foo ← EXECUTION_READY=no  →  ticket\.md$/m);
    } finally {
      rmSync(mapDir, { recursive: true, force: true });
    }
  });

  it('execution map fails closed on an unreadable ticket instead of omitting it', async (context) => {
    const mapDir = mkdtempSync(join(tmpdir(), 'sdd-task-map-unreadable-ticket-'));
    writeFileSync(
      join(mapDir, 'visible.md'),
      [TICKET, '<!--SECTION:EXECUTION_LOG-->', '<!--/SECTION:EXECUTION_LOG-->'].join('\n'),
      'utf-8'
    );
    const hidden = join(mapDir, 'hidden.md');
    writeFileSync(hidden, TICKET.replace('cli-foo', 'cli-hidden'), 'utf-8');
    if (!denyRead(context, hidden, 'file')) {
      rmSync(mapDir, { recursive: true, force: true });
      return;
    }
    try {
      const result = await mod.run(argv(mapDir));
      assert.strictEqual(result.ok, false);
      if (result.ok) return;
      assert.strictEqual(result.exitCode, 1);
      assert.match(result.message, /ERR_CLI_SDD_TASK_TICKET_CORPUS/);
      assert.match(result.message, /hidden\.md/);
      assert.doesNotMatch(result.message, /^\[sdd-task\] execution map|^GATE_QUEUE=/m);
    } finally {
      chmodSync(hidden, 0o600);
      rmSync(mapDir, { recursive: true, force: true });
    }
  });

  it('execution map cannot choose a unique infra owner through an unreadable competing subtree', async (context) => {
    const mapDir = mkdtempSync(join(tmpdir(), 'sdd-task-map-unreadable-subtree-'));
    writeFileSync(
      join(mapDir, 'visible-owner.md'),
      [TICKET, '<!--SECTION:EXECUTION_LOG-->', '<!--/SECTION:EXECUTION_LOG-->'].join('\n'),
      'utf-8'
    );
    const competing = join(mapDir, 'competing');
    mkdirSync(competing);
    writeFileSync(
      join(competing, 'possible-owner.md'),
      TICKET.replace('cli-foo', 'cli-competing'),
      'utf-8'
    );
    if (!denyRead(context, competing, 'directory')) {
      rmSync(mapDir, { recursive: true, force: true });
      return;
    }
    try {
      const result = await mod.run(argv(mapDir));
      assert.strictEqual(result.ok, false);
      if (result.ok) return;
      assert.strictEqual(result.exitCode, 1);
      assert.match(result.message, /ERR_CLI_SDD_TASK_TICKET_CORPUS/);
      assert.match(result.message, /competing/);
      assert.match(result.message, /no partial execution map or GATE_QUEUE was emitted/);
      assert.doesNotMatch(result.message, /pickable \(ready now\)/);
    } finally {
      chmodSync(competing, 0o700);
      rmSync(mapDir, { recursive: true, force: true });
    }
  });

  it('map emits a path on blocked lines too', async () => {
    const blkDir = mkdtempSync(join(tmpdir(), 'sdd-task-map-blocked-'));
    const blockedTicket = [
      '# Task: TSK-blocked — Blocked',
      '<!--SECTION:META-->',
      '## 1. Meta',
      '- **Task-ID:** TSK-blocked',
      '- **Status:** [ ] TODO',
      '- **Dependencies:** TSK-missing',
      '<!--/SECTION:META-->',
      '<!--SECTION:EXECUTION_LOG-->',
      '<!--/SECTION:EXECUTION_LOG-->',
    ].join('\n');
    writeFileSync(join(blkDir, 'blocked.md'), blockedTicket, 'utf-8');
    const origCwd = process.cwd();
    process.chdir(blkDir);
    try {
      const r = await mod.run(argv());
      assert.strictEqual(r.ok, true);
      if (!r.ok) return;
      assert.match(r.text, /blocked: TSK-blocked ← TSK-missing\s*→\s*blocked\.md/);
    } finally {
      process.chdir(origCwd);
      rmSync(blkDir, { recursive: true, force: true });
    }
  });

  describe('bare Task-ID resolution (AX_TASK_RESOLUTION)', () => {
    // The shared TICKET fixture's Task-ID ("cli-foo") is lowercase-ACR and does not match the v2
    // Task-ID grammar (`looksLikeTaskId`) — these tests need a grammar-conforming id, so they build
    // their own isolated ticket rather than reusing `dir`/`ticket`.
    const idTicket = (id: string): string =>
      [TICKET, '<!--SECTION:EXECUTION_LOG-->', '<!--/SECTION:EXECUTION_LOG-->']
        .join('\n')
        .split('cli-foo')
        .join(id);

    it('resolves to its ticket — plan output is prefixed with the resolution line', async () => {
      const idDir = mkdtempSync(join(tmpdir(), 'sdd-task-id-'));
      writeFileSync(join(idDir, 'ticket.md'), idTicket('TSK-foo'), 'utf-8');
      const origCwd = process.cwd();
      process.chdir(idDir);
      try {
        const outcome = await mod.run(argv('TSK-foo'));
        assert.strictEqual(outcome.ok, true);
        if (!outcome.ok) return;
        assert.match(outcome.text, /^\[sdd-task\] TSK-foo → ticket\.md\n/);
        assert.match(outcome.text, /\[sdd-task\] TSK-foo — \[ \] TODO/);
      } finally {
        process.chdir(origCwd);
        rmSync(idDir, { recursive: true, force: true });
      }
    });

    it('resolves for --phase too — resolution line precedes the phase context', async () => {
      const idDir = mkdtempSync(join(tmpdir(), 'sdd-task-id-'));
      writeFileSync(join(idDir, 'ticket.md'), idTicket('TSK-foo'), 'utf-8');
      writeExecutionReadyInfra(idDir); // P1 is impl — the phase gate must find real infra
      writeDeclaredPhaseTargets(idDir);
      const origCwd = process.cwd();
      process.chdir(idDir);
      try {
        const outcome = await mod.run(argv('TSK-foo', '--phase', 'P1'));
        assert.strictEqual(outcome.ok, true);
        if (!outcome.ok) return;
        assert.match(outcome.text, /^\[sdd-task\] TSK-foo → ticket\.md\n/);
        assert.match(outcome.text, /\[sdd-task\] TSK-foo — P1 impl/);
      } finally {
        process.chdir(origCwd);
        rmSync(idDir, { recursive: true, force: true });
      }
    });

    it('an unknown but Task-ID-shaped argument → exit 2 listing known Task-IDs', async () => {
      const idDir = mkdtempSync(join(tmpdir(), 'sdd-task-id-'));
      writeFileSync(join(idDir, 'ticket.md'), idTicket('TSK-foo'), 'utf-8');
      const origCwd = process.cwd();
      process.chdir(idDir);
      try {
        const outcome = await mod.run(argv('NOPE-ghost'));
        assert.strictEqual(outcome.ok, false);
        if (outcome.ok) return;
        assert.strictEqual(outcome.exitCode, 2);
        assert.match(outcome.message, /ERR_CLI_SDD_TASK_UNKNOWN_ID: NOPE-ghost/);
        assert.match(outcome.message, /known Task-IDs:.*TSK-foo/);
      } finally {
        process.chdir(origCwd);
        rmSync(idDir, { recursive: true, force: true });
      }
    });

    it('no tickets in the tree → unknown Task-ID reports the queue is empty', async () => {
      const emptyDir = mkdtempSync(join(tmpdir(), 'sdd-task-id-empty-'));
      const origCwd = process.cwd();
      process.chdir(emptyDir);
      try {
        const outcome = await mod.run(argv('NOPE-ghost'));
        assert.strictEqual(outcome.ok, false);
        if (outcome.ok) return;
        assert.match(outcome.message, /очередь пуста/);
      } finally {
        process.chdir(origCwd);
        rmSync(emptyDir, { recursive: true, force: true });
      }
    });

    it('a Task-ID matching two tickets → exit 2 listing both candidate paths', async () => {
      const dupDir = mkdtempSync(join(tmpdir(), 'sdd-task-dup-'));
      const dup = (name: string): string =>
        [
          `# Task: ${name}`,
          '<!--SECTION:META-->',
          '## 1. Meta',
          '- **Task-ID:** TSK-dup',
          '- **Status:** [ ] TODO',
          '<!--/SECTION:META-->',
          '<!--SECTION:EXECUTION_LOG-->',
          '<!--/SECTION:EXECUTION_LOG-->',
        ].join('\n');
      writeFileSync(join(dupDir, 'a.md'), dup('a'), 'utf-8');
      writeFileSync(join(dupDir, 'b.md'), dup('b'), 'utf-8');
      const origCwd = process.cwd();
      process.chdir(dupDir);
      try {
        const outcome = await mod.run(argv('TSK-dup'));
        assert.strictEqual(outcome.ok, false);
        if (outcome.ok) return;
        assert.strictEqual(outcome.exitCode, 2);
        assert.match(outcome.message, /ERR_CLI_SDD_TASK_AMBIGUOUS_ID: TSK-dup matches 2 tickets/);
        assert.match(outcome.message, /a\.md/);
        assert.match(outcome.message, /b\.md/);
      } finally {
        process.chdir(origCwd);
        rmSync(dupDir, { recursive: true, force: true });
      }
    });

    it('an existing ticket path still works exactly as before (no resolution line)', async () => {
      const outcome = await mod.run(argv(ticket));
      assert.strictEqual(outcome.ok, true);
      if (!outcome.ok) return;
      assert.doesNotMatch(outcome.text, /^\[sdd-task\] cli-foo → /);
      assert.match(outcome.text, /^\[sdd-task\] cli-foo — \[ \] TODO/);
    });
  });

  describe('--phase', () => {
    const PHASED_TICKET = [
      '# Task: cli-foo — Foo',
      '<!--SECTION:META-->',
      '## 1. Meta',
      '- **Task-ID:** cli-foo',
      '- **Status:** [~] IN_PROGRESS',
      '- **Purpose:** Build the foo',
      '- **Scope:** cli',
      '- **Module:** core',
      '- **Dependencies:** None',
      '- **Spec References:**',
      '  - Contract: [FooPort](specs/cli/core/core.spec.md#fooport)',
      '  - Adapter: [FooAdapter](specs/cli/core/core.spec.md#fooadapter)',
      '<!--/SECTION:META-->',
      '<!--SECTION:PHASES_OVERVIEW-->',
      '| ID | Kind | Deps | Status |',
      '|----|------|------|--------|',
      '| P1 | impl | — | [x] |',
      '| P2 | test | P1 | [ ] |',
      '<!--/SECTION:PHASES_OVERVIEW-->',
      '<!--SECTION:PHASE_P1-->',
      '### P1 — impl',
      '- **Objective:** implement foo',
      '- **Rules:**',
      '  - [typescript-rules](ai/directives/coding/typescript-rules.xml)',
      '- **Spec Refs:**',
      '  - [FooPort](specs/cli/core/core.spec.md#fooport)',
      '- **Target Files:**',
      '  - src/foo.ts',
      '- **Inputs:** none',
      '- **Exit:** foo.ts compiles and exports Foo',
      '<!--/SECTION:PHASE_P1-->',
      '<!--SECTION:PHASE_P2-->',
      '### P2 — test',
      '- **Objective:** test foo',
      '- **Rules:**',
      '  - [node-test](ai/directives/testing/node-test.xml)',
      '- **Target Files:**',
      '  - src/foo.test.ts',
      '- **Inputs:** P1 handoff',
      '- **Exit:** all scenarios pass',
      '<!--/SECTION:PHASE_P2-->',
      '<!--SECTION:VERIFICATION-->',
      '| Command | Required by | Role |',
      '|---------|-------------|------|',
      '| npm run type-check | typescript-rules | extra |',
      '| npm run test | node-test | extra |',
      '<!--/SECTION:VERIFICATION-->',
      '<!--SECTION:EXECUTION_LOG-->',
      '### Round 1 — 2026-06-21, initial',
      '#### P1',
      '- [x] `2026-06-21T10:00:00Z` ver `npm run type-check` → pass exit=0',
      '- [x] `2026-06-21T10:00:00Z` DONE',
      '**Handoff →** artifacts: [src/foo.ts]; decisions: [none]; open: [none]',
      '<!--/SECTION:EXECUTION_LOG-->',
    ].join('\n');

    it('emits a compact single-phase context: objective, gates+hint, exit, filtered read-manifest', async () => {
      const t = join(dir, 'phased.md');
      writeFileSync(t, PHASED_TICKET, 'utf-8');
      const outcome = await mod.run(argv(t, '--phase', 'P2'));
      assert.strictEqual(outcome.ok, true);
      if (!outcome.ok) return;
      const text = outcome.text;
      assert.match(text, /\[sdd-task\] cli-foo — P2 test  status=\[ \]/);
      assert.match(text, /objective:   test foo/);
      assert.match(text, /gates:\n {2}npm run test — /);
      assert.doesNotMatch(text, /^ {2}npm run type-check — /m);
      assert.match(
        text,
        /^ {2}gate-state: type-check CONFIGURED provider=none next=run npm run type-check$/m
      );
      assert.match(text, /exit:        all scenarios pass/);
      assert.match(text, /READ rules:  ai\/directives\/testing\/node-test\.xml/);
      assert.match(text, /READ files:  src\/foo\.test\.ts/);
      assert.match(text, /DO NOT READ/);
    });

    it('rejects a raw pipeline/extra Verification cell before emitting phase context', async () => {
      const t = join(dir, 'phased-malformed-verification.md');
      writeFileSync(
        t,
        PHASED_TICKET.replace(
          '| npm run test | node-test | extra |',
          '| printf `x` | grep x | node-test | extra |'
        ),
        'utf-8'
      );
      const outcome = await mod.run(argv(t, '--phase', 'P2'));
      assert.strictEqual(outcome.ok, false);
      if (outcome.ok) return;
      assert.strictEqual(outcome.code, 'ERR_CLI_SDD_TASK_VERIFICATION_INVALID');
      assert.match(outcome.message, /expected exactly 3 cells/);
      assert.doesNotMatch(outcome.message, /read-manifest|objective:/);
    });

    it('rejects an absent Verification section before emitting phase context', async () => {
      const t = join(dir, 'phased-missing-verification.md');
      writeFileSync(
        t,
        PHASED_TICKET.replace(
          /<!--SECTION:VERIFICATION-->[\s\S]*?<!--\/SECTION:VERIFICATION-->\n/,
          ''
        ),
        'utf-8'
      );
      const outcome = await mod.run(argv(t, '--phase', 'P2'));
      assert.strictEqual(outcome.ok, false);
      if (outcome.ok) return;
      assert.strictEqual(outcome.code, 'ERR_CLI_SDD_TASK_VERIFICATION_INVALID');
      assert.match(outcome.message, /missing canonical header/);
      assert.doesNotMatch(outcome.message, /read-manifest|objective:/);
    });

    it('READ specs falls back to the full Meta Spec References when the phase declares no Spec Refs', async () => {
      const t = join(dir, 'phased.md');
      writeFileSync(t, PHASED_TICKET, 'utf-8');
      const outcome = await mod.run(argv(t, '--phase', 'P2'));
      assert.strictEqual(outcome.ok, true);
      if (!outcome.ok) return;
      assert.match(
        outcome.text,
        /READ specs:  specs\/cli\/core\/core\.spec\.md#fooport, specs\/cli\/core\/core\.spec\.md#fooadapter/
      );
    });

    it("READ specs uses the phase's own Spec Refs when declared — not the whole Meta list", async () => {
      const t = join(dir, 'phased.md');
      writeFileSync(t, PHASED_TICKET, 'utf-8');
      const outcome = await mod.run(argv(t, '--phase', 'P1'));
      assert.strictEqual(outcome.ok, true);
      if (!outcome.ok) return;
      assert.match(outcome.text, /READ specs:  specs\/cli\/core\/core\.spec\.md#fooport$/m);
      assert.doesNotMatch(outcome.text, /fooadapter/);
    });

    it('includes the verbatim Handoff line of the completed prior phase, prefixed Handoff ←P1', async () => {
      const t = join(dir, 'phased.md');
      writeFileSync(t, PHASED_TICKET, 'utf-8');
      const outcome = await mod.run(argv(t, '--phase', 'P2'));
      assert.strictEqual(outcome.ok, true);
      if (!outcome.ok) return;
      assert.match(
        outcome.text,
        /Handoff ←P1: \*\*Handoff →\*\* artifacts: \[src\/foo\.ts\]; decisions: \[none\]; open: \[none\]/
      );
    });

    it('omits the [HANDOFF] block for the first phase', async () => {
      const t = join(dir, 'phased.md');
      writeFileSync(t, PHASED_TICKET, 'utf-8');
      const outcome = await mod.run(argv(t, '--phase', 'P1'));
      assert.strictEqual(outcome.ok, true);
      if (!outcome.ok) return;
      assert.doesNotMatch(outcome.text, /\[HANDOFF\]/);
    });

    it('picks the real closed Handoff from a later Round over the Round-1 skeleton placeholder', async () => {
      const ROUND2_TICKET = PHASED_TICKET.replace(
        '**Handoff →** artifacts: [src/foo.ts]; decisions: [none]; open: [none]',
        [
          '**Handoff →** artifacts: [...]; decisions: [...]; open: [...]',
          '',
          '### Round 2 — 2026-06-22, execute',
          '#### P1',
          '- [x] `2026-06-22T10:00:00Z` DONE',
          '**Handoff →** artifacts: [src/real.ts]; decisions: [real-decision]; open: [none]',
        ].join('\n')
      );
      const t = join(dir, 'phased-round2.md');
      writeFileSync(t, ROUND2_TICKET, 'utf-8');
      const outcome = await mod.run(argv(t, '--phase', 'P2'));
      assert.strictEqual(outcome.ok, true);
      if (!outcome.ok) return;
      assert.match(
        outcome.text,
        /Handoff ←P1: \*\*Handoff →\*\* artifacts: \[src\/real\.ts\]; decisions: \[real-decision\]; open: \[none\]/
      );
      assert.doesNotMatch(outcome.text, /\[\.\.\.\]/);
    });

    it('a completed prior phase with no captured Handoff says so honestly, never a blank omission or the skeleton placeholder', async () => {
      const NO_HANDOFF_TICKET = PHASED_TICKET.replace(
        '**Handoff →** artifacts: [src/foo.ts]; decisions: [none]; open: [none]',
        ''
      );
      const t = join(dir, 'phased-no-handoff.md');
      writeFileSync(t, NO_HANDOFF_TICKET, 'utf-8');
      const outcome = await mod.run(argv(t, '--phase', 'P2'));
      assert.strictEqual(outcome.ok, true);
      if (!outcome.ok) return;
      assert.match(outcome.text, /\[HANDOFF\]/);
      assert.match(
        outcome.text,
        /Handoff ←P1: \(отсутствует — фаза ещё не закрывалась \/ Handoff не записан\)/
      );
    });

    it('ends with the next: protocol + sdd-log + Handoff-line instruction', async () => {
      const t = join(dir, 'phased.md');
      writeFileSync(t, PHASED_TICKET, 'utf-8');
      const outcome = await mod.run(argv(t, '--phase', 'P2'));
      assert.strictEqual(outcome.ok, true);
      if (!outcome.ok) return;
      assert.match(
        outcome.text,
        /next: прочитай перечисленное, исполняй фазу по протоколу, по завершении sdd-log \+ Handoff-строка\./
      );
    });

    it('unknown --phase → exit 2 naming the known phases', async () => {
      const t = join(dir, 'phased.md');
      writeFileSync(t, PHASED_TICKET, 'utf-8');
      const outcome = await mod.run(argv(t, '--phase', 'P9'));
      assert.strictEqual(outcome.ok, false);
      if (outcome.ok) return;
      assert.strictEqual(outcome.exitCode, 2);
      assert.match(outcome.message, /P1, P2/);
    });

    it('no ## Audit Rounds section → no Audit Rounds block at all', async () => {
      const t = join(dir, 'phased.md');
      writeFileSync(t, PHASED_TICKET, 'utf-8');
      const outcome = await mod.run(argv(t, '--phase', 'P2'));
      assert.strictEqual(outcome.ok, true);
      if (!outcome.ok) return;
      assert.doesNotMatch(outcome.text, /Audit Rounds/);
    });

    it('## Audit Rounds section present → rendered verbatim after the Handoff block', async () => {
      const t = join(dir, 'phased-audited.md');
      const AUDIT_BLOCK = [
        '',
        '## Audit Rounds',
        '',
        '### Audit Round 1 — 2026-06-22, after Execution Round 1',
        '',
        '```',
        '@audit task=cli-foo round=1 after-exec-round=1 triggered-reopen=Round-2 status=FAIL counts=B0·M1·m0·I0',
        'F-01 | sev=M | type=RULES_COMPLIANCE_VIOLATION | conf=H | loc=src/foo.ts:10 | src=ai/directives/coding/typescript-rules.xml#AX_STRICT_NULL | route=ticket-reopen | act=fix: F-01 добавить null-guard',
        '```',
        '',
      ].join('\n');
      writeFileSync(t, PHASED_TICKET + AUDIT_BLOCK, 'utf-8');
      const outcome = await mod.run(argv(t, '--phase', 'P2'));
      assert.strictEqual(outcome.ok, true);
      if (!outcome.ok) return;
      assert.match(
        outcome.text,
        /Audit Rounds \(открытые находки — почини то, что адресовано твоей фазе\):/
      );
      assert.match(outcome.text, /### Audit Round 1 — 2026-06-22, after Execution Round 1/);
      assert.match(outcome.text, /F-01 \| sev=M \| type=RULES_COMPLIANCE_VIOLATION/);
      // verbatim, and after the Handoff block
      const handoffIdx = outcome.text.indexOf('[HANDOFF]');
      const auditIdx = outcome.text.indexOf('Audit Rounds (');
      assert.ok(handoffIdx !== -1 && auditIdx > handoffIdx);
    });

    it('without --phase, existing full-plan behavior is unchanged', async () => {
      const outcome = await mod.run(argv(ticket));
      assert.strictEqual(outcome.ok, true);
      if (!outcome.ok) return;
      assert.match(outcome.text, /Per-phase read-manifest/);
    });

    it('refuses P3 dispatch when a transitive checked P1 receipt is stale', async () => {
      const root = mkdtempSync(join(tmpdir(), 'sdd-task-stale-dependency-'));
      try {
        writeExecutionReadyInfra(root);
        mkdirSync(join(root, 'specs/app'), { recursive: true });
        mkdirSync(join(root, 'src'), { recursive: true });
        writeFileSync(join(root, 'specs/app/app.spec.md'), '# App');
        writeFileSync(join(root, 'src/foo.ts'), 'before');
        writeFileSync(join(root, 'src/foo.test.ts'), 'test');
        const environment = phaseVerificationEnvironmentState(root, 'code', false, []);
        assert.strictEqual(environment.ok, true);
        const plan: PhaseReceiptPlan = {
          ticket: 'specs/app/app.task.TSK-1.md',
          phase: 'P1',
          profile: 'code',
          profileBasis: 'phase-kind',
          targets: ['src/foo.ts'],
          deletedFiles: [],
          verification: [],
          producesCoverage: false,
          environmentState: environment.ok ? environment.state : '',
        };
        const state = phaseReceiptTargetState(root, plan.targets);
        assert.strictEqual(state.ok, true);
        const receipt: PhaseReceipt = {
          schema: 1,
          ...plan,
          planState: phaseReceiptPlanState(plan),
          targetState: state.ok ? state.state : '',
          commands: [
            { gate: 'fix', role: 'repair', command: 'fix', exitCode: 0 },
            { gate: 'type-check', role: 'foundation', command: 'types', exitCode: 0 },
            { gate: 'test', role: 'foundation', command: 'tests', exitCode: 0 },
          ],
        };
        const p2Plan: PhaseReceiptPlan = {
          ...plan,
          phase: 'P2',
          targets: ['src/foo.test.ts'],
        };
        const p2State = phaseReceiptTargetState(root, p2Plan.targets);
        assert.strictEqual(p2State.ok, true);
        const p2Receipt: PhaseReceipt = {
          schema: 1,
          ...p2Plan,
          planState: phaseReceiptPlanState(p2Plan),
          targetState: p2State.ok ? p2State.state : '',
          commands: [...receipt.commands],
        };
        const ticketPath = join(root, plan.ticket);
        writeFileSync(
          ticketPath,
          [
            PHASED_TICKET.replace('- **Task-ID:** cli-foo', '- **Task-ID:** TSK-1')
              .replace(
                '| P2 | test | P1 | [ ] |',
                '| P2 | impl | P1 | [x] |\n| P3 | impl | P2 | [ ] |'
              )
              .replace('  - src/foo.ts', '  - src/foo.ts\n- **Deleted Files:**\n  - none')
              .replace('  - src/foo.test.ts', '  - src/foo.test.ts\n- **Deleted Files:**\n  - none')
              .replace(
                '  - [typescript-rules](ai/directives/coding/typescript-rules.xml)',
                '  - none'
              )
              .replace('  - [node-test](ai/directives/testing/node-test.xml)', '  - none')
              .replace(
                '<!--SECTION:VERIFICATION-->',
                [
                  '<!--SECTION:PHASE_P3-->',
                  '### P3 — impl',
                  '- **Rules:**',
                  '  - none',
                  '- **Target Files:**',
                  '  - src/foo.test.ts',
                  '- **Deleted Files:**',
                  '  - none',
                  '<!--/SECTION:PHASE_P3-->',
                  '<!--SECTION:VERIFICATION-->',
                ].join('\n')
              ),
            formatPhaseReceipt(receipt),
            formatPhaseReceipt(p2Receipt),
          ].join('\n')
        );
        writeFileSync(join(root, 'src/foo.ts'), 'after');
        const outcome = await withTemporaryCwd(root, () =>
          mod.run(argv(plan.ticket, '--phase', 'P3'))
        );
        assert.strictEqual(outcome.ok, false);
        if (!outcome.ok) {
          assert.match(outcome.message, /ERR_CLI_SDD_TASK_DEPENDENCY_NOT_READY/);
          assert.match(outcome.message, /dependency P1 is not current/);
        }
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });

  it('execution map with no classified active ticket → routes back to sdd-state', async () => {
    const soloDir = mkdtempSync(join(tmpdir(), 'sdd-task-blocked-'));
    const blockedTicket = [
      '# Task: cli-bar — Bar',
      '<!--SECTION:META-->',
      '## 1. Meta',
      '- **Task-ID:** cli-bar',
      '- **Status:** [ ] TODO',
      '- **Dependencies:** cli-missing',
      '<!--/SECTION:META-->',
      '<!--SECTION:PHASES_OVERVIEW-->',
      '| ID | Kind | Deps | Status |',
      '|----|------|------|--------|',
      '| P1 | impl | — | [ ] |',
      '<!--/SECTION:PHASES_OVERVIEW-->',
    ].join('\n');
    writeFileSync(join(soloDir, 'ticket.md'), blockedTicket, 'utf-8');
    const origCwd = process.cwd();
    process.chdir(soloDir);
    try {
      const r = await mod.run(argv());
      assert.strictEqual(r.ok, true);
      if (!r.ok) return;
      assert.match(r.text, /pickable \(ready now\): — none/);
      assert.match(r.text, /next: активных TODO-тикетов нет — вызови `sdd-state`/);
    } finally {
      process.chdir(origCwd);
      rmSync(soloDir, { recursive: true, force: true });
    }
  });

  describe('READINESS / GATE_QUEUE preflight fields', () => {
    const infraTicket = (taskId: string) =>
      [
        `# Task: ${taskId} — Bootstrap`,
        '<!--SECTION:META-->',
        '## 1. Meta',
        `- **Task-ID:** ${taskId}`,
        '- **Status:** [ ] TODO',
        '- **Scope:** infra-core',
        '- **Dependencies:** None',
        '<!--/SECTION:META-->',
        '<!--SECTION:PHASES_OVERVIEW-->',
        '| ID | Kind | Deps | Status |',
        '|---|---|---|---|',
        '| P1 | impl | — | [ ] |',
        '<!--/SECTION:PHASES_OVERVIEW-->',
        '<!--SECTION:PHASE_P1-->',
        '- **Target Files:**',
        '  - package.json',
        '- **Readiness Gates:**',
        '  - package.json',
        '  - type-check',
        '  - test',
        '  - test:coverage',
        '  - format',
        '  - format:fix',
        '  - lint',
        '  - lint:fix',
        '  - fix',
        '  - gennady',
        '<!--/SECTION:PHASE_P1-->',
        '<!--SECTION:EXECUTION_LOG-->',
        '<!--/SECTION:EXECUTION_LOG-->',
      ].join('\n');

    const portalWithInfraScope = [
      '# Demo Project',
      '',
      '## Scopes',
      '',
      '| Scope | Type | Status | Description |',
      '|---|---|---|---|',
      '| [`infra-core`](./infra-core/infra-core.spec.md) | infrastructure | ✅ | bootstrap tooling |',
      '',
    ].join('\n');

    it('missing gate scripts + a queued infra TODO ticket → gate line names it', async () => {
      const gateDir = mkdtempSync(join(tmpdir(), 'sdd-task-gate-'));
      mkdirSync(join(gateDir, 'specs'), { recursive: true });
      writeFileSync(join(gateDir, 'specs', 'README.md'), portalWithInfraScope, 'utf-8');
      mkdirSync(join(gateDir, 'specs', 'infra-core'), { recursive: true });
      writeFileSync(
        join(gateDir, 'specs', 'infra-core', 'infra-core.spec.md'),
        [
          '<!--SECTION:BOOTSTRAP_REQUIREMENTS-->',
          '| Requirement | Kind | Owner | Resolution | Readiness Gates | Gate Artifacts |',
          '|---|---|---|---|---|---|',
          '| tooling | tool | this-scope-task | create | package.json, type-check, test, test:coverage, format, format:fix, lint, lint:fix, fix, gennady | package.json |',
          '<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->',
        ].join('\n')
      );
      writeFileSync(join(gateDir, 'ticket.md'), infraTicket('infra-1'), 'utf-8');
      // No package.json at all → readiness is not-ready.
      const origCwd = process.cwd();
      process.chdir(gateDir);
      try {
        const r = await mod.run(argv());
        assert.strictEqual(r.ok, true);
        if (!r.ok) return;
        assert.match(
          r.text,
          /READINESS=not-ready\nEXECUTION_READY=no\nGATE_QUEUE=infra-1 · гейты отсутствуют, их строят эти тикеты/
        );
      } finally {
        process.chdir(origCwd);
        rmSync(gateDir, { recursive: true, force: true });
      }
    });

    it('approved infra scope with no ticket at all → diagnostic after GATE_QUEUE, not silence', async () => {
      const gateDir = mkdtempSync(join(tmpdir(), 'sdd-task-gate-diag-'));
      mkdirSync(join(gateDir, 'specs'), { recursive: true });
      writeFileSync(join(gateDir, 'specs', 'README.md'), portalWithInfraScope, 'utf-8');
      // No ticket referencing infra-core at all — spec approved, nothing scaffolded yet.
      writeFileSync(
        join(gateDir, 'ticket.md'),
        infraTicket('app-1').replace('infra-core', 'app'),
        'utf-8'
      );
      writeInfraGateContract(gateDir);
      const origCwd = process.cwd();
      process.chdir(gateDir);
      try {
        const r = await mod.run(argv());
        assert.strictEqual(r.ok, true);
        if (!r.ok) return;
        assert.match(r.text, /GATE_QUEUE=none/);
        assert.match(
          r.text,
          /GATE_QUEUE_DIAG: infra-спека `infra-core` одобрена, тикетов пока нет — нарежь scaffold'ом/
        );
        assert.match(r.text, /next: bootstrap-тикетов ещё нет — запусти `\/sdd-scaffold`/);
        assert.doesNotMatch(r.text, /разблокируй одну из blocked/);
      } finally {
        process.chdir(origCwd);
        rmSync(gateDir, { recursive: true, force: true });
      }
    });

    it('TODO ticket scope near-misses the portal infra name → mismatch diagnostic', async () => {
      const gateDir = mkdtempSync(join(tmpdir(), 'sdd-task-gate-mismatch-'));
      mkdirSync(join(gateDir, 'specs'), { recursive: true });
      writeFileSync(join(gateDir, 'specs', 'README.md'), portalWithInfraScope, 'utf-8');
      writeFileSync(
        join(gateDir, 'ticket.md'),
        infraTicket('infra-1').replace('infra-core', 'Infra_Core'),
        'utf-8'
      );
      const origCwd = process.cwd();
      process.chdir(gateDir);
      try {
        const r = await mod.run(argv());
        assert.strictEqual(r.ok, true);
        if (!r.ok) return;
        assert.match(r.text, /GATE_QUEUE=none/);
        assert.match(
          r.text,
          /GATE_QUEUE_DIAG: область тикета 'Infra_Core' не совпала с порталом 'infra-core' \(похожие имена\)/
        );
        assert.doesNotMatch(
          r.text,
          /одобрена, тикетов пока нет/,
          'a near-miss ticket already exists — must not also claim no tickets exist'
        );
      } finally {
        process.chdir(origCwd);
        rmSync(gateDir, { recursive: true, force: true });
      }
    });

    it('gate scripts present → no gate line, even with an infra TODO ticket queued', async () => {
      const readyDir = mkdtempSync(join(tmpdir(), 'sdd-task-ready-'));
      mkdirSync(join(readyDir, 'specs'), { recursive: true });
      mkdirSync(join(readyDir, 'node_modules', '.bin'), { recursive: true });
      writeFileSync(join(readyDir, 'node_modules', '.bin', 'gennady'), '', 'utf-8');
      writeFileSync(join(readyDir, 'specs', 'README.md'), portalWithInfraScope, 'utf-8');
      writeFileSync(join(readyDir, 'ticket.md'), infraTicket('infra-2'), 'utf-8');
      writeFileSync(
        join(readyDir, 'package.json'),
        JSON.stringify({
          name: 'demo',
          scripts: {
            'type-check': 'tsc --noEmit',
            test: 'node --test',
            'test:coverage': 'node --test --coverage',
            lint: 'gennady lint --all .',
            format: 'prettier --check .',
            check: 'npm run type-check && npm test && npm run lint && npm run format',
            fix: 'npm run format:fix && npm run lint:fix && npm run check',
            'format:fix': 'prettier --write',
            'lint:fix': 'eslint --fix',
          },
        }),
        'utf-8'
      );
      const origCwd = process.cwd();
      process.chdir(readyDir);
      try {
        const r = await mod.run(argv());
        assert.strictEqual(r.ok, true);
        if (!r.ok) return;
        assert.match(r.text, /READINESS=ready\nEXECUTION_READY=yes\nGATE_QUEUE=none/);
      } finally {
        process.chdir(origCwd);
        rmSync(readyDir, { recursive: true, force: true });
      }
    });
  });

  describe('--audit-group / --group-scope', () => {
    const groupTicket = (id: string, status: string, deps = 'None', verification: string[] = []) =>
      [
        `# Task: ${id}`,
        '<!--SECTION:META-->',
        '## 1. Meta',
        `- **Task-ID:** ${id}`,
        `- **Status:** ${status}`,
        '- **Scope:** core',
        `- **Dependencies:** ${deps}`,
        '- **Spec References:**',
        '  - Contract: [CoreContract](core.spec.md#core-contract)',
        '<!--/SECTION:META-->',
        '<!--SECTION:PHASES_OVERVIEW-->',
        '| ID | Kind | Deps | Status |',
        '|----|------|------|--------|',
        '| P1 | impl | — | [x] |',
        '<!--/SECTION:PHASES_OVERVIEW-->',
        '<!--SECTION:PHASE_P1-->',
        '- **Objective:** implement',
        '- **Target Files:**',
        `  - src/${id}.ts`,
        '<!--/SECTION:PHASE_P1-->',
        ...(verification.length > 0
          ? verification
          : [
              '<!--SECTION:VERIFICATION-->',
              '| Command | Required by | Role |',
              '|---|---|---|',
              '<!--/SECTION:VERIFICATION-->',
            ]),
        '<!--SECTION:EXECUTION_LOG-->',
        '#### P1',
        `**Handoff →** artifacts: [src/${id}.ts]; decisions: [none]; open: [none]`,
        '<!--/SECTION:EXECUTION_LOG-->',
      ].join('\n');

    function withCwd<T>(dir: string, fn: () => T): T {
      const orig = process.cwd();
      process.chdir(dir);
      try {
        return fn();
      } finally {
        process.chdir(orig);
      }
    }

    it('all group tickets DONE → audit due (N/N), next: dispatches the group audit', async () => {
      const gDir = mkdtempSync(join(tmpdir(), 'sdd-task-audit-due-'));
      writeFileSync(join(gDir, 'core.spec.md'), '# Core\n', 'utf-8');
      writeFileSync(join(gDir, 'core.task.TSK-a.md'), groupTicket('TSK-a', '[x] DONE'), 'utf-8');
      writeFileSync(join(gDir, 'core.task.TSK-b.md'), groupTicket('TSK-b', '[x] DONE'), 'utf-8');
      try {
        const r = await withCwd(gDir, () => mod.run(argv('--audit-group', 'TSK-a')));
        assert.strictEqual(r.ok, true);
        if (!r.ok) return;
        assert.match(r.text, /^spec: core\.spec\.md$/m);
        assert.match(r.text, /^ {2}TSK-a \[x\] DONE → core\.task\.TSK-a\.md$/m);
        assert.match(r.text, /^ {2}TSK-b \[x\] DONE → core\.task\.TSK-b\.md$/m);
        assert.match(r.text, /^audit: due — все тикеты группы закрыты \(2\/2\)$/m);
        assert.match(r.text, /^next: dispatch ONE audit-subagent/m);
        assert.match(r.text, /mode=per-group, task=core\.spec\.md/);
        assert.match(r.text, /sdd-task --group-scope TSK-a/);
      } finally {
        rmSync(gDir, { recursive: true, force: true });
      }
    });

    it('a single-ticket group behaves the same as any other group (due 1/1)', async () => {
      const gDir = mkdtempSync(join(tmpdir(), 'sdd-task-audit-solo-'));
      writeFileSync(join(gDir, 'core.spec.md'), '# Core\n', 'utf-8');
      writeFileSync(
        join(gDir, 'core.task.TSK-solo.md'),
        groupTicket('TSK-solo', '[x] DONE'),
        'utf-8'
      );
      try {
        const r = await withCwd(gDir, () => mod.run(argv('--audit-group', 'TSK-solo')));
        assert.strictEqual(r.ok, true);
        if (!r.ok) return;
        assert.match(r.text, /^audit: due — все тикеты группы закрыты \(1\/1\)$/m);
      } finally {
        rmSync(gDir, { recursive: true, force: true });
      }
    });

    it('a partially closed group → not yet, lists open ids, next: points at the pickable one', async () => {
      const gDir = mkdtempSync(join(tmpdir(), 'sdd-task-audit-notyet-'));
      writeFileSync(join(gDir, 'core.spec.md'), '# Core\n', 'utf-8');
      writeFileSync(join(gDir, 'core.task.TSK-a.md'), groupTicket('TSK-a', '[x] DONE'), 'utf-8');
      writeFileSync(join(gDir, 'core.task.TSK-b.md'), groupTicket('TSK-b', '[ ] TODO'), 'utf-8');
      try {
        // resolve via the ticket PATH this time (not the bare id)
        const r = await withCwd(gDir, () => mod.run(argv('--audit-group', 'core.task.TSK-a.md')));
        assert.strictEqual(r.ok, true);
        if (!r.ok) return;
        assert.match(r.text, /^audit: not yet — открыто: TSK-b$/m);
        assert.match(r.text, /^next: возьми TSK-b \(`sdd-task TSK-b`\)/m);
      } finally {
        rmSync(gDir, { recursive: true, force: true });
      }
    });

    it('a ticket filename that does not follow the v2 `.task.` convention → actionable error', async () => {
      const gDir = mkdtempSync(join(tmpdir(), 'sdd-task-audit-badname-'));
      writeFileSync(join(gDir, 'plain.md'), groupTicket('TSK-plain', '[ ] TODO'), 'utf-8');
      try {
        const r = await withCwd(gDir, () => mod.run(argv('--audit-group', join(gDir, 'plain.md'))));
        assert.strictEqual(r.ok, false);
        if (r.ok) return;
        assert.match(r.message, /ERR_CLI_SDD_TASK_NOT_V2_TICKET_NAME/);
        assert.match(r.message, /<scope-or-module>\.task\.<Task-ID>\.md/);
      } finally {
        rmSync(gDir, { recursive: true, force: true });
      }
    });

    it('a well-named ticket whose owning spec is missing on disk → actionable error naming the expected spec path', async () => {
      const gDir = mkdtempSync(join(tmpdir(), 'sdd-task-audit-nospec-'));
      writeFileSync(join(gDir, 'core.task.TSK-x.md'), groupTicket('TSK-x', '[ ] TODO'), 'utf-8');
      try {
        const r = await withCwd(gDir, () => mod.run(argv('--audit-group', 'TSK-x')));
        assert.strictEqual(r.ok, false);
        if (r.ok) return;
        assert.match(r.message, /ERR_CLI_SDD_TASK_SPEC_MISSING/);
        assert.match(r.message, /core\.spec\.md/);
      } finally {
        rmSync(gDir, { recursive: true, force: true });
      }
    });

    it("the plain plan (`sdd-task <id>`) embeds an `audit-group:` line with the group's closed/total count", async () => {
      const gDir = mkdtempSync(join(tmpdir(), 'sdd-task-plan-groupline-'));
      writeFileSync(join(gDir, 'core.spec.md'), '# Core\n', 'utf-8');
      writeFileSync(join(gDir, 'core.task.TSK-a.md'), groupTicket('TSK-a', '[ ] TODO'), 'utf-8');
      writeFileSync(join(gDir, 'core.task.TSK-b.md'), groupTicket('TSK-b', '[x] DONE'), 'utf-8');
      try {
        const r = await withCwd(gDir, () => mod.run(argv(join(gDir, 'core.task.TSK-a.md'))));
        assert.strictEqual(r.ok, true);
        if (!r.ok) return;
        assert.match(r.text, /^audit-group: core\.spec\.md \(1\/2\)$/m);
      } finally {
        rmSync(gDir, { recursive: true, force: true });
      }
    });

    it('the plain plan omits `audit-group:` when the ticket filename has no owning spec (no crash)', async () => {
      const outcome = await mod.run(argv(ticket));
      assert.strictEqual(outcome.ok, true);
      if (!outcome.ok) return;
      assert.doesNotMatch(outcome.text, /^audit-group:/m);
    });

    function initGitRepo(dir: string): void {
      execSync('git init -q', { cwd: dir });
      execSync('git config user.email test@example.com', { cwd: dir });
      execSync('git config user.name test', { cwd: dir });
      execSync('git add -A', { cwd: dir });
      execSync('git commit -q -m init', { cwd: dir });
    }

    function materializeTargets(dir: string, ...paths: string[]): void {
      for (const path of paths) {
        mkdirSync(join(dir, path, '..'), { recursive: true });
        writeFileSync(join(dir, path), `// ${path}\n`, 'utf-8');
      }
    }

    it('--group-scope with a git HEAD → files: targets + changed neighbours under the group-private target root', async () => {
      const gDir = mkdtempSync(join(tmpdir(), 'sdd-task-scope-git-'));
      writeFileSync(join(gDir, 'core.spec.md'), '# Core\n', 'utf-8');
      writeFileSync(join(gDir, 'core.task.TSK-a.md'), groupTicket('TSK-a', '[x] DONE'), 'utf-8');
      writeFileSync(join(gDir, 'core.task.TSK-b.md'), groupTicket('TSK-b', '[x] DONE'), 'utf-8');
      materializeTargets(gDir, 'src/TSK-a.ts', 'src/TSK-b.ts');
      initGitRepo(gDir);
      mkdirSync(join(gDir, 'src'), { recursive: true });
      // Undeclared neighbours remain attributable because `src/` is private to this group.
      writeFileSync(join(gDir, 'src', 'extra.ts'), '// untracked\n', 'utf-8');
      // a non-source file — must also surface now that the scan carries no extension filter
      writeFileSync(join(gDir, 'src', 'notes.md'), '# untracked notes\n', 'utf-8');
      // A repo-root file has no structural relation to this group and must not leak into its audit.
      writeFileSync(join(gDir, 'unrelated.md'), '# unrelated\n', 'utf-8');
      try {
        const r = await withCwd(gDir, () => mod.run(argv('--group-scope', 'TSK-a')));
        assert.strictEqual(r.ok, true);
        if (!r.ok) return;
        assert.match(r.text, /^files:$/m);
        assert.match(r.text, /^ {2}src\/TSK-a\.ts$/m);
        assert.match(r.text, /^ {2}src\/TSK-b\.ts$/m);
        assert.match(r.text, /^ {2}src\/extra\.ts$/m);
        assert.match(r.text, /^ {2}src\/notes\.md$/m);
        assert.doesNotMatch(r.text, /^ {2}unrelated\.md$/m);
        assert.match(
          r.text,
          /^git: bounded HEAD vs рабочее дерево \(exact group files \+ private target roots; включая untracked\/deleted\) — \d+ файл\(ов\)$/m
        );
        assert.match(r.text, /^handoff:$/m);
        assert.match(r.text, /^ {2}src\/TSK-a\.ts$/m);
      } finally {
        rmSync(gDir, { recursive: true, force: true });
      }
    });

    it('--group-scope isolates co-located spec groups and their dirty files, including private-root undeclared files', async () => {
      const gDir = mkdtempSync(join(tmpdir(), 'sdd-task-scope-two-groups-'));
      writeFileSync(join(gDir, 'alpha.spec.md'), '# Alpha\n', 'utf-8');
      writeFileSync(join(gDir, 'beta.spec.md'), '# Beta\n', 'utf-8');
      writeFileSync(
        join(gDir, 'alpha.task.TSK-a.md'),
        groupTicket('TSK-a', '[x] DONE').replace(
          'src/TSK-a.ts',
          'packages/alpha/src/a.ts\n  - src/a.ts'
        ),
        'utf-8'
      );
      writeFileSync(
        join(gDir, 'beta.task.TSK-b.md'),
        groupTicket('TSK-b', '[x] DONE').replace(
          'src/TSK-b.ts',
          'packages/beta/src/b.ts\n  - src/b.ts\n- **Deleted Files:**\n  - packages/beta/src/deleted.ts'
        ),
        'utf-8'
      );
      mkdirSync(join(gDir, 'packages', 'alpha', 'src'), { recursive: true });
      mkdirSync(join(gDir, 'packages', 'beta', 'src'), { recursive: true });
      mkdirSync(join(gDir, 'src'), { recursive: true });
      writeFileSync(join(gDir, 'packages', 'alpha', 'src', 'a.ts'), '// alpha\n', 'utf-8');
      writeFileSync(join(gDir, 'packages', 'beta', 'src', 'b.ts'), '// beta\n', 'utf-8');
      writeFileSync(
        join(gDir, 'packages', 'beta', 'src', 'deleted.ts'),
        '// delete in beta\n',
        'utf-8'
      );
      writeFileSync(join(gDir, 'src', 'a.ts'), '// alpha shared-root target\n', 'utf-8');
      writeFileSync(join(gDir, 'src', 'b.ts'), '// beta shared-root target\n', 'utf-8');
      writeFileSync(join(gDir, 'src', 'TSK-b.ts'), '// beta handoff artifact\n', 'utf-8');
      initGitRepo(gDir);
      writeFileSync(join(gDir, 'packages', 'alpha', 'src', 'a.ts'), '// alpha dirty\n', 'utf-8');
      writeFileSync(
        join(gDir, 'packages', 'alpha', 'src', 'new-helper.ts'),
        '// alpha helper\n',
        'utf-8'
      );
      writeFileSync(join(gDir, 'packages', 'beta', 'src', 'b.ts'), '// beta dirty\n', 'utf-8');
      rmSync(join(gDir, 'packages', 'beta', 'src', 'deleted.ts'));
      writeFileSync(
        join(gDir, 'packages', 'beta', 'src', 'new-helper.ts'),
        '// beta helper\n',
        'utf-8'
      );
      writeFileSync(join(gDir, 'src', 'ambiguous-helper.ts'), '// no owner\n', 'utf-8');
      writeFileSync(join(gDir, 'beta.spec.md'), '# Beta dirty\n', 'utf-8');
      try {
        const r = await withCwd(gDir, () => mod.run(argv('--group-scope', 'TSK-b')));
        assert.strictEqual(r.ok, true);
        if (!r.ok) return;
        assert.match(r.text, /^spec: beta\.spec\.md$/m);
        assert.match(r.text, /^ {2}TSK-b .*beta\.task\.TSK-b\.md$/m);
        assert.doesNotMatch(r.text, /^ {2}TSK-a /m);
        assert.match(r.text, /^ {2}packages\/beta\/src\/b\.ts$/m);
        assert.match(r.text, /^ {2}packages\/beta\/src\/deleted\.ts$/m);
        assert.match(r.text, /^ {2}packages\/beta\/src\/new-helper\.ts$/m);
        assert.match(r.text, /^ {2}beta\.spec\.md$/m);
        assert.doesNotMatch(r.text, /^ {2}packages\/alpha\//m);
        assert.doesNotMatch(r.text, /^ {2}src\/ambiguous-helper\.ts$/m);
      } finally {
        rmSync(gDir, { recursive: true, force: true });
      }
    });

    it('--group-scope with no git HEAD → target files plus staged and untracked group files', async () => {
      const gDir = mkdtempSync(join(tmpdir(), 'sdd-task-scope-nogit-'));
      writeFileSync(join(gDir, 'core.spec.md'), '# Core\n', 'utf-8');
      writeFileSync(join(gDir, 'core.task.TSK-a.md'), groupTicket('TSK-a', '[x] DONE'), 'utf-8');
      materializeTargets(gDir, 'src/TSK-a.ts');
      execSync('git init -q', { cwd: gDir });
      writeFileSync(join(gDir, 'src', 'staged-helper.ts'), '// staged helper\n', 'utf-8');
      writeFileSync(join(gDir, 'src', 'untracked-helper.ts'), '// untracked helper\n', 'utf-8');
      execSync('git add src/TSK-a.ts src/staged-helper.ts', { cwd: gDir });
      try {
        const r = await withCwd(gDir, () => mod.run(argv('--group-scope', 'TSK-a')));
        assert.strictEqual(r.ok, true);
        if (!r.ok) return;
        assert.match(r.text, /^files:$/m);
        assert.match(r.text, /^ {2}src\/TSK-a\.ts$/m);
        assert.match(r.text, /^ {2}src\/staged-helper\.ts$/m);
        assert.match(r.text, /^ {2}src\/untracked-helper\.ts$/m);
        assert.match(r.text, /^contract-anchors: core\.spec\.md#core-contract$/m);
        assert.match(r.text, /^lint-files:\n {2}src\/TSK-a\.ts$/m);
        assert.match(r.text, /^code-roots: src$/m);
        assert.match(
          r.text,
          /^git: bounded empty tree vs индекс \+ рабочее дерево \(exact group files \+ private target roots; включая staged\/intent-to-add\/untracked\) — 5 файл\(ов\)$/m
        );
        // Pre-schema tickets are grandfathered explicitly; no threshold/path/platform is invented.
        assert.match(r.text, /^coverage-gates:$/m);
        assert.match(r.text, /^ {2}TSK-a: legacy-unset — grandfathered .* no command inferred$/m);
      } finally {
        rmSync(gDir, { recursive: true, force: true });
      }
    });

    it('--group-scope publishes only targets the real gennady lint implementation supports', async () => {
      const gDir = mkdtempSync(join(tmpdir(), 'sdd-task-lint-evidence-'));
      writeFileSync(join(gDir, 'core.spec.md'), '# Core\n', 'utf-8');
      const ticket = groupTicket('TSK-a', '[x] DONE').replace(
        '  - src/TSK-a.ts',
        '  - src/TSK-a.ts\n  - src/runtime.js\n  - src/view.jsx'
      );
      writeFileSync(join(gDir, 'core.task.TSK-a.md'), ticket, 'utf-8');
      mkdirSync(join(gDir, 'src'), { recursive: true });
      writeFileSync(join(gDir, 'src', 'TSK-a.ts'), '// supported\n', 'utf-8');
      writeFileSync(join(gDir, 'src', 'runtime.js'), '// unsupported by gennady lint\n', 'utf-8');
      writeFileSync(join(gDir, 'src', 'view.jsx'), '// unsupported by gennady lint\n', 'utf-8');
      execSync('git init -q', { cwd: gDir });
      try {
        const result = await withCwd(gDir, () => mod.run(argv('--group-scope', 'TSK-a')));
        assert.strictEqual(result.ok, true);
        if (!result.ok) return;
        assert.match(result.text, /^files:\n(?: {2}.*\n)* {2}src\/runtime\.js$/m);
        assert.match(result.text, /^lint-files:\n {2}src\/TSK-a\.ts$/m);
        const lintBlock = /lint-files:\n([\s\S]*?)\ncode-roots:/.exec(result.text)?.[1] ?? '';
        assert.doesNotMatch(lintBlock, /runtime\.js|view\.jsx/);
      } finally {
        rmSync(gDir, { recursive: true, force: true });
      }
    });

    it('--group-scope fails closed when dirty tracked files sit behind a corrupt HEAD', async () => {
      const gDir = mkdtempSync(join(tmpdir(), 'sdd-task-scope-corrupt-head-'));
      writeFileSync(join(gDir, 'core.spec.md'), '# Core\n');
      writeFileSync(join(gDir, 'core.task.TSK-a.md'), groupTicket('TSK-a', '[x] DONE'));
      materializeTargets(gDir, 'src/TSK-a.ts');
      initGitRepo(gDir);
      writeFileSync(join(gDir, 'src', 'TSK-a.ts'), '// dirty but must not disappear\n');
      const branch = execSync('git symbolic-ref HEAD', { cwd: gDir, encoding: 'utf-8' }).trim();
      writeFileSync(join(gDir, '.git', branch), `${'1'.repeat(40)}\n`);
      try {
        const result = await withCwd(gDir, () => mod.run(argv('--group-scope', 'TSK-a')));
        assert.strictEqual(result.ok, false);
        if (!result.ok) {
          assert.strictEqual(result.code, 'ERR_CLI_SDD_TASK_SCOPE_EVIDENCE');
          assert.match(result.message, /git .*failed \(exit \d+\)/);
          assert.doesNotMatch(result.message, /^files:/m);
        }
      } finally {
        rmSync(gDir, { recursive: true, force: true });
      }
    });

    it('--group-scope refuses a malformed v2 sibling instead of silently omitting it', async () => {
      const gDir = mkdtempSync(join(tmpdir(), 'sdd-task-scope-corpus-'));
      writeFileSync(join(gDir, 'core.spec.md'), '# Core\n');
      writeFileSync(join(gDir, 'core.task.TSK-a.md'), groupTicket('TSK-a', '[x] DONE'));
      writeFileSync(join(gDir, 'core.task.TSK-broken.md'), 'truncated\n');
      try {
        const result = await withCwd(gDir, () => mod.run(argv('--group-scope', 'TSK-a')));
        assert.strictEqual(result.ok, false);
        if (!result.ok) {
          assert.strictEqual(result.code, 'ERR_CLI_SDD_TASK_SCOPE_EVIDENCE');
          assert.match(result.message, /core\.task\.TSK-broken\.md/);
          assert.match(result.message, /no readable ticket structure/);
        }
      } finally {
        rmSync(gDir, { recursive: true, force: true });
      }
    });

    it('coverage-gates preserves a custom required command byte-for-byte, including a spaced path', async () => {
      const gDir = mkdtempSync(join(tmpdir(), 'sdd-task-scope-cov-'));
      writeFileSync(join(gDir, 'core.spec.md'), '# Core\n', 'utf-8');
      writeFileSync(
        join(gDir, 'core.task.TSK-c.md'),
        [
          '<!--SECTION:META-->',
          '- **Task-ID:** TSK-c',
          '- **Status:** [ ] TODO',
          '<!--/SECTION:META-->',
          '<!--SECTION:PHASES_OVERVIEW-->',
          '| ID | Kind | Deps | Status |',
          '|----|------|------|--------|',
          '| P1 | impl | — | [ ] |',
          '<!--/SECTION:PHASES_OVERVIEW-->',
          '<!--SECTION:PHASE_P1-->',
          '- **Target Files:**',
          '  - src/my module.ts',
          '<!--/SECTION:PHASE_P1-->',
          '<!--SECTION:VERIFICATION-->',
          '<!--COVERAGE_POLICY:v1-->',
          '- **Coverage Policy:** required',
          '- **Coverage Owner Phase:** P1',
          '| Command | Required by | Role |',
          '|---------|-------------|------|',
          `| go tool cover -func='coverage reports/profile one.out' | GO-COVER | coverage |`,
          '<!--/SECTION:VERIFICATION-->',
          '<!--SECTION:EXECUTION_LOG-->',
          '<!--/SECTION:EXECUTION_LOG-->',
        ].join('\n'),
        'utf-8'
      );
      materializeTargets(gDir, 'src/my module.ts');
      execSync('git init -q', { cwd: gDir });
      try {
        const r = await withCwd(gDir, () => mod.run(argv('--group-scope', 'TSK-c')));
        assert.strictEqual(r.ok, true);
        if (!r.ok) return;
        assert.match(
          r.text,
          /^ {2}TSK-c: required \(owner P1\) — go tool cover -func='coverage reports\/profile one\.out'$/m
        );
        assert.doesNotMatch(r.text, /testcov|--min=80/);
      } finally {
        rmSync(gDir, { recursive: true, force: true });
      }
    });

    it('--group-scope rejects a malformed Verification row before emitting review context', async () => {
      const gDir = mkdtempSync(join(tmpdir(), 'sdd-task-scope-malformed-verification-'));
      writeFileSync(join(gDir, 'core.spec.md'), '# Core\n', 'utf-8');
      const verification = [
        '<!--SECTION:VERIFICATION-->',
        '| Command | Required by | Role |',
        '|---|---|---|',
        '| printf `x` | grep x | RULE | extra |',
        '<!--/SECTION:VERIFICATION-->',
      ];
      writeFileSync(
        join(gDir, 'core.task.TSK-a.md'),
        groupTicket('TSK-a', '[x] DONE', 'None', verification),
        'utf-8'
      );
      try {
        const outcome = await withCwd(gDir, () => mod.run(argv('--group-scope', 'TSK-a')));
        assert.strictEqual(outcome.ok, false);
        if (outcome.ok) return;
        assert.strictEqual(outcome.code, 'ERR_CLI_SDD_TASK_VERIFICATION_INVALID');
        assert.match(outcome.message, /expected exactly 3 cells/);
        assert.doesNotMatch(outcome.message, /^files:|^coverage-gates:/m);
      } finally {
        rmSync(gDir, { recursive: true, force: true });
      }
    });

    it('mixed group emits each explicit required/N-A policy without blending or defaulting', async () => {
      const gDir = mkdtempSync(join(tmpdir(), 'sdd-task-scope-mixed-cov-'));
      writeFileSync(join(gDir, 'core.spec.md'), '# Core\n', 'utf-8');
      const required = [
        '<!--SECTION:VERIFICATION-->',
        '<!--COVERAGE_POLICY:v1-->',
        '- **Coverage Policy:** required',
        '- **Coverage Owner Phase:** P1',
        '| Command | Required by | Role |',
        '|---|---|---|',
        '| xcrun llvm-cov report --instr-profile "reports/app profile.profdata" | IOS-COVER | coverage |',
        '<!--/SECTION:VERIFICATION-->',
      ];
      const notApplicable = [
        '<!--SECTION:VERIFICATION-->',
        '<!--COVERAGE_POLICY:v1-->',
        '- **Coverage Policy:** not-applicable',
        '- **Coverage Reason:** edits TypeScript package metadata only; no executable behavior',
        '| Command | Required by | Role |',
        '|---|---|---|',
        '| — | — | extra |',
        '<!--/SECTION:VERIFICATION-->',
      ];
      writeFileSync(
        join(gDir, 'core.task.TSK-a.md'),
        groupTicket('TSK-a', '[x] DONE', 'None', required),
        'utf-8'
      );
      writeFileSync(
        join(gDir, 'core.task.TSK-config.md'),
        groupTicket('TSK-config', '[x] DONE', 'None', notApplicable),
        'utf-8'
      );
      materializeTargets(gDir, 'src/TSK-a.ts', 'src/TSK-config.ts');
      execSync('git init -q', { cwd: gDir });
      try {
        const r = await withCwd(gDir, () => mod.run(argv('--group-scope', 'TSK-a')));
        assert.strictEqual(r.ok, true);
        if (!r.ok) return;
        assert.match(
          r.text,
          /^ {2}TSK-a: required \(owner P1\) — xcrun llvm-cov report --instr-profile "reports\/app profile\.profdata"$/m
        );
        assert.match(
          r.text,
          /^ {2}TSK-config: not-applicable — edits TypeScript package metadata only; no executable behavior$/m
        );
        assert.doesNotMatch(r.text, /testcov|--min=80/);
      } finally {
        rmSync(gDir, { recursive: true, force: true });
      }
    });

    it('--task-scope limits tickets and same-directory git files to one ready-made context', async () => {
      const gDir = mkdtempSync(join(tmpdir(), 'sdd-task-scope-single-'));
      writeFileSync(join(gDir, 'core.spec.md'), '# Core\n', 'utf-8');
      writeFileSync(join(gDir, 'core.task.TSK-a.md'), groupTicket('TSK-a', '[x] DONE'), 'utf-8');
      writeFileSync(join(gDir, 'core.task.TSK-b.md'), groupTicket('TSK-b', '[x] DONE'), 'utf-8');
      mkdirSync(join(gDir, 'src'), { recursive: true });
      writeFileSync(join(gDir, 'src', 'TSK-a.ts'), '// a\n', 'utf-8');
      writeFileSync(join(gDir, 'src', 'TSK-b.ts'), '// b\n', 'utf-8');
      initGitRepo(gDir);
      writeFileSync(join(gDir, 'src', 'helper.ts'), '// helper\n', 'utf-8');
      try {
        const r = await withCwd(gDir, () => mod.run(argv('--task-scope', 'TSK-a')));
        assert.strictEqual(r.ok, true);
        if (!r.ok) return;
        assert.match(r.text, /^ {2}TSK-a /m);
        assert.doesNotMatch(r.text, /^ {2}TSK-b /m);
        assert.match(r.text, /^ {2}src\/helper\.ts$/m);
        assert.match(r.text, /^contract-anchors: core\.spec\.md#core-contract$/m);
      } finally {
        rmSync(gDir, { recursive: true, force: true });
      }
    });

    it('normalizes ticket-relative anchors and collapses nested code roots', async () => {
      const gDir = mkdtempSync(join(tmpdir(), 'sdd-task-scope-normalized-'));
      const ticketDir = join(gDir, 'tasks', 'core');
      mkdirSync(ticketDir, { recursive: true });
      mkdirSync(join(gDir, 'tasks', 'src', 'sub'), { recursive: true });
      writeFileSync(join(ticketDir, 'core.spec.md'), '# Core\n', 'utf-8');
      const content = groupTicket('TSK-a', '[x] DONE')
        .replace('core.spec.md#core-contract', './core.spec.md#core-contract')
        .replace('  - src/TSK-a.ts', '  - tasks/src/a.ts\n  - tasks/src/sub/b.ts');
      writeFileSync(join(ticketDir, 'core.task.TSK-a.md'), content, 'utf-8');
      materializeTargets(gDir, 'tasks/src/a.ts', 'tasks/src/sub/b.ts', 'src/TSK-a.ts');
      execSync('git init -q', { cwd: gDir });
      try {
        const r = await withCwd(gDir, () => mod.run(argv('--group-scope', 'TSK-a')));
        assert.strictEqual(r.ok, true);
        if (!r.ok) return;
        assert.match(r.text, /^contract-anchors: tasks\/core\/core\.spec\.md#core-contract$/m);
        assert.match(r.text, /^code-roots: tasks\/src$/m);
        assert.doesNotMatch(r.text, /^code-roots: .*tasks\/src\/sub/m);
      } finally {
        rmSync(gDir, { recursive: true, force: true });
      }
    });

    it('--group-scope on an unborn branch with no Target Files → exact spec/ticket evidence, never false-empty', async () => {
      const gDir = mkdtempSync(join(tmpdir(), 'sdd-task-scope-empty-'));
      writeFileSync(join(gDir, 'core.spec.md'), '# Core\n', 'utf-8');
      const bare = [
        '# Task: TSK-bare',
        '<!--SECTION:META-->',
        '- **Task-ID:** TSK-bare',
        '- **Status:** [ ] TODO',
        '<!--/SECTION:META-->',
        '<!--SECTION:VERIFICATION-->',
        '| Command | Required by | Role |',
        '|---|---|---|',
        '<!--/SECTION:VERIFICATION-->',
        '<!--SECTION:EXECUTION_LOG-->',
        '<!--/SECTION:EXECUTION_LOG-->',
      ].join('\n');
      writeFileSync(join(gDir, 'core.task.TSK-bare.md'), bare, 'utf-8');
      writeFileSync(join(gDir, 'unrelated.md'), '# Not part of the core group\n', 'utf-8');
      execSync('git init -q', { cwd: gDir });
      try {
        const r = await withCwd(gDir, () => mod.run(argv('--group-scope', 'TSK-bare')));
        assert.strictEqual(r.ok, true);
        if (!r.ok) return;
        assert.match(r.text, /^files:\n {2}core\.spec\.md\n {2}core\.task\.TSK-bare\.md$/m);
        assert.doesNotMatch(r.text, /^ {2}unrelated\.md$/m);
        assert.doesNotMatch(r.text, /область обзора построить не из чего/);
        assert.match(
          r.text,
          /^git: bounded empty tree vs индекс \+ рабочее дерево \(exact group files \+ private target roots; включая staged\/intent-to-add\/untracked\) — 2 файл\(ов\)$/m
        );
        assert.match(r.text, /^handoff:$/m);
        assert.match(r.text, /Handoff-строки с артефактами/);
      } finally {
        rmSync(gDir, { recursive: true, force: true });
      }
    });
  });

  describe('--phase infra gate (ERR_CLI_SDD_TASK_INFRA_NOT_READY)', () => {
    function withCwd<T>(dir: string, fn: () => Promise<T>): Promise<T> {
      const orig = process.cwd();
      process.chdir(dir);
      return fn().finally(() => process.chdir(orig));
    }

    it('impl phase on a bare project (no package.json) → refused with the not-ready cause', async () => {
      const gateDir = mkdtempSync(join(tmpdir(), 'sdd-task-gate-'));
      writeDeclaredPhaseTargets(gateDir);
      writeFileSync(join(gateDir, 'ticket.md'), TICKET, 'utf-8');
      try {
        const r = await withCwd(gateDir, () => mod.run(argv('ticket.md', '--phase', 'P1')));
        assert.strictEqual(r.ok, false);
        if (r.ok) return;
        assert.match(r.message, /ERR_CLI_SDD_TASK_INFRA_NOT_READY/);
        assert.match(r.message, /kind=impl/);
        assert.match(r.message, /not-ready/);
      } finally {
        rmSync(gateDir, { recursive: true, force: true });
      }
    });

    it('test phase on echo-stub infra → refused, names the stubbed scripts', async () => {
      const gateDir = mkdtempSync(join(tmpdir(), 'sdd-task-gate-'));
      writeDeclaredPhaseTargets(gateDir);
      writeFileSync(
        join(gateDir, 'ticket.md'),
        TICKET.replace('| P1 | impl | — | [ ] |', '| P1 | impl | — | [x] |'),
        'utf-8'
      );
      writeExecutionReadyInfra(gateDir);
      // Downgrade test/test:coverage to echo-stubs — bootstrap-legal, execution-illegal.
      writeFileSync(
        join(gateDir, 'package.json'),
        JSON.stringify({
          name: 'fixture-app',
          scripts: {
            'type-check': 'tsc --noEmit',
            test: "echo 'TODO: настроить инфраструктуру (test runner)' >&2",
            'test:coverage': "echo 'TODO: настроить инфраструктуру (coverage)' >&2",
            format: 'prettier --check .',
            'format:fix': 'prettier --write',
            lint: 'gennady lint src/',
            'lint:fix': 'eslint --fix',
            fix: 'npm run format:fix -- . && npm run lint:fix -- src/',
          },
        }),
        'utf-8'
      );
      try {
        const r = await withCwd(gateDir, () => mod.run(argv('ticket.md', '--phase', 'P2')));
        assert.strictEqual(r.ok, false);
        if (r.ok) return;
        assert.match(r.message, /ERR_CLI_SDD_TASK_INFRA_NOT_READY/);
        assert.match(r.message, /заглушки/);
        assert.match(r.message, /test, test:coverage/);
      } finally {
        rmSync(gateDir, { recursive: true, force: true });
      }
    });

    it('impl phase on execution-ready infra → passes the gate, phase context is emitted', async () => {
      const gateDir = mkdtempSync(join(tmpdir(), 'sdd-task-gate-'));
      writeDeclaredPhaseTargets(gateDir);
      writeFileSync(join(gateDir, 'ticket.md'), TICKET, 'utf-8');
      writeExecutionReadyInfra(gateDir);
      try {
        const r = await withCwd(gateDir, () => mod.run(argv('ticket.md', '--phase', 'P1')));
        assert.strictEqual(r.ok, true, r.ok ? '' : r.message);
      } finally {
        rmSync(gateDir, { recursive: true, force: true });
      }
    });

    it('an impl phase whose OWN ticket is in the infra gate queue is exempt — otherwise the flow deadlocks against its own remedy', async () => {
      const gateDir = mkdtempSync(join(tmpdir(), 'sdd-task-gate-'));
      writeDeclaredPhaseTargets(gateDir);
      mkdirSync(join(gateDir, 'specs'), { recursive: true });
      writeFileSync(
        join(gateDir, 'specs', 'README.md'),
        [
          '# Demo Project',
          '',
          '## Scopes',
          '',
          '| Scope | Type | Status | Description |',
          '|---|---|---|---|',
          '| [`infra-core`](./infra-core/infra-core.spec.md) | infrastructure | ✅ | bootstrap tooling |',
          '',
        ].join('\n'),
        'utf-8'
      );
      writeInfraGateContract(gateDir);
      // The ticket lives in the infra scope and is TODO → it IS the gate queue. No package.json at
      // all, so readiness is not-ready — the harshest state the exemption must survive. The
      // EXECUTION_LOG anchor is what makes `collectTicketRefs` see the file as a ticket at all.
      writeFileSync(
        join(gateDir, 'ticket.md'),
        [
          claimAllReadinessGates(TICKET.replace('- **Scope:** cli', '- **Scope:** infra-core')),
          '<!--SECTION:EXECUTION_LOG-->',
          '<!--/SECTION:EXECUTION_LOG-->',
        ].join('\n'),
        'utf-8'
      );
      try {
        const r = await withCwd(gateDir, () => mod.run(argv('ticket.md', '--phase', 'P1')));
        assert.strictEqual(r.ok, true, r.ok ? '' : r.message);
        if (!r.ok) return;
        assert.match(r.text, /INFRA_QUEUE_EXEMPTION/);
        assert.match(r.text, /Верификация здесь ЧАСТИЧНАЯ/);

        writeFileSync(
          join(gateDir, 'ticket.md'),
          [
            claimAllReadinessGates(
              TICKET.replace('- **Scope:** cli', '- **Scope:** infra-core').replace(
                '- **Status:** [ ] TODO',
                '- **Status:** [x] DONE'
              )
            ),
            '<!--SECTION:EXECUTION_LOG-->',
            '<!--/SECTION:EXECUTION_LOG-->',
          ].join('\n'),
          'utf-8'
        );
        const expired = await withCwd(gateDir, () => mod.run(argv('ticket.md', '--phase', 'P1')));
        assert.strictEqual(expired.ok, false);
        if (!expired.ok) assert.match(expired.message, /ERR_CLI_SDD_TASK_INFRA_NOT_READY/);

        writeFileSync(
          join(gateDir, 'ticket.md'),
          [
            claimAllReadinessGates(TICKET.replace('- **Scope:** cli', '- **Scope:** product-app')),
            '<!--SECTION:EXECUTION_LOG-->',
            '<!--/SECTION:EXECUTION_LOG-->',
          ].join('\n'),
          'utf-8'
        );
        const productClaim = await withCwd(gateDir, () =>
          mod.run(argv('ticket.md', '--phase', 'P1'))
        );
        assert.strictEqual(productClaim.ok, false);
        if (!productClaim.ok)
          assert.match(productClaim.message, /ERR_CLI_SDD_TASK_INFRA_NOT_READY/);
      } finally {
        rmSync(gateDir, { recursive: true, force: true });
      }
    });

    it('the exemption survives the orchestrator opening the Round — an IN_PROGRESS ticket is still in the queue', async () => {
      const gateDir = mkdtempSync(join(tmpdir(), 'sdd-task-gate-'));
      writeDeclaredPhaseTargets(gateDir);
      mkdirSync(join(gateDir, 'specs'), { recursive: true });
      writeFileSync(
        join(gateDir, 'specs', 'README.md'),
        [
          '# Demo Project',
          '',
          '## Scopes',
          '',
          '| Scope | Type | Status | Description |',
          '|---|---|---|---|',
          '| [`infra-core`](./infra-core/infra-core.spec.md) | infrastructure | ✅ | bootstrap tooling |',
          '',
        ].join('\n'),
        'utf-8'
      );
      writeInfraGateContract(gateDir);
      // Exactly the state the flow is really in at the first phase dispatch: the orchestrator has
      // already flipped Status to IN_PROGRESS via `sdd-log round`.
      writeFileSync(
        join(gateDir, 'ticket.md'),
        [
          claimAllReadinessGates(
            TICKET.replace('- **Scope:** cli', '- **Scope:** infra-core')
          ).replace('- **Status:** [ ] TODO', '- **Status:** [~] IN_PROGRESS'),
          '<!--SECTION:EXECUTION_LOG-->',
          '<!--/SECTION:EXECUTION_LOG-->',
        ].join('\n'),
        'utf-8'
      );
      try {
        const r = await withCwd(gateDir, () => mod.run(argv('ticket.md', '--phase', 'P1')));
        assert.strictEqual(r.ok, true, r.ok ? '' : r.message);
        if (!r.ok) return;
        assert.match(r.text, /INFRA_QUEUE_EXEMPTION/);
      } finally {
        rmSync(gateDir, { recursive: true, force: true });
      }
    });

    it('a NON-queued ticket gets no exemption — the escape hatch is only for the tickets building the gates', async () => {
      const gateDir = mkdtempSync(join(tmpdir(), 'sdd-task-gate-'));
      writeDeclaredPhaseTargets(gateDir);
      mkdirSync(join(gateDir, 'specs'), { recursive: true });
      writeFileSync(
        join(gateDir, 'specs', 'README.md'),
        [
          '# Demo Project',
          '',
          '## Scopes',
          '',
          '| Scope | Type | Status | Description |',
          '|---|---|---|---|',
          '| [`infra-core`](./infra-core/infra-core.spec.md) | infrastructure | ✅ | bootstrap tooling |',
          '',
        ].join('\n'),
        'utf-8'
      );
      // Scope `cli` is a product scope — not in the infra queue, so the gate still refuses.
      writeFileSync(join(gateDir, 'ticket.md'), TICKET, 'utf-8');
      try {
        const r = await withCwd(gateDir, () => mod.run(argv('ticket.md', '--phase', 'P1')));
        assert.strictEqual(r.ok, false);
        if (r.ok) return;
        assert.match(r.message, /ERR_CLI_SDD_TASK_INFRA_NOT_READY/);
      } finally {
        rmSync(gateDir, { recursive: true, force: true });
      }
    });

    it('bootstrap-kind phase is never blocked by the gate — it exists to build the infra', async () => {
      const gateDir = mkdtempSync(join(tmpdir(), 'sdd-task-gate-'));
      writeDeclaredPhaseTargets(gateDir);
      const bootstrapTicket = TICKET.replace(
        '| P1 | impl | — | [ ] |',
        '| P1 | bootstrap | — | [ ] |'
      );
      writeFileSync(join(gateDir, 'ticket.md'), bootstrapTicket, 'utf-8');
      try {
        const r = await withCwd(gateDir, () => mod.run(argv('ticket.md', '--phase', 'P1')));
        assert.strictEqual(r.ok, true, r.ok ? '' : r.message);
      } finally {
        rmSync(gateDir, { recursive: true, force: true });
      }
    });
  });
});
