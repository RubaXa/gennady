// @file: Integration tests for SddTaskCommand#run — planning surface, manifests, gate-matching, exit codes.
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

type TaskModule = typeof import('../sdd-task.cmd.ts');

let mod: TaskModule;
let origExit: typeof process.exit;
let origArgv: string[];
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
  '| Command | Required by |',
  '|---------|-------------|',
  '| npm run type-check | typescript-rules |',
  '| npm run test | node-test |',
  '<!--/SECTION:VERIFICATION-->',
].join('\n');

function argv(...rest: string[]): string[] {
  return ['node', 'gennady', 'sdd-task', ...rest];
}

describe('SddTaskCommand', () => {
  before(async () => {
    origExit = process.exit;
    origArgv = process.argv;
    process.exit = ((_code?: number) => undefined) as typeof process.exit;
    process.argv = ['node', 'gennady', 'sdd-task'];
    dir = mkdtempSync(join(tmpdir(), 'sdd-task-'));
    ticket = join(dir, 'ticket.md');
    writeFileSync(ticket, TICKET, 'utf-8');
    mod = await import('../sdd-task.cmd.ts');
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

  it('map emits a root line and a per-line `<id> → <path>` for the pickable ticket', async () => {
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
      assert.match(r.text, /pickable \(ready now\):\n {2}cli-foo → ticket\.md$/m);
    } finally {
      process.chdir(origCwd);
      rmSync(mapDir, { recursive: true, force: true });
    }
  });

  it("a positional project root (no chdir needed) shows that root's map — symmetric with `sdd-state [project-root]`", async () => {
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
      assert.match(r.text, /pickable \(ready now\):\n {2}cli-foo → ticket\.md$/m);
    } finally {
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
      '| Command | Required by |',
      '|---------|-------------|',
      '| npm run type-check | typescript-rules |',
      '| npm run test | node-test |',
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
      assert.doesNotMatch(text, /npm run type-check/);
      assert.match(text, /exit:        all scenarios pass/);
      assert.match(text, /READ rules:  ai\/directives\/testing\/node-test\.xml/);
      assert.match(text, /READ files:  src\/foo\.test\.ts/);
      assert.match(text, /DO NOT READ/);
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
  });

  it('execution map with nothing pickable → next: hint points at unblocking', async () => {
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
      assert.match(r.text, /next: pickable пуст/);
    } finally {
      process.chdir(origCwd);
      rmSync(soloDir, { recursive: true, force: true });
    }
  });

  describe('gate line — гейты: отсутствуют · их строят тикеты очереди', () => {
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
          /гейты: отсутствуют · их строят тикеты очереди \(infra-1\) — для исполнения это штатно, начинай с них/
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
        assert.doesNotMatch(r.text, /гейты:/);
      } finally {
        process.chdir(origCwd);
        rmSync(readyDir, { recursive: true, force: true });
      }
    });
  });

  describe('--audit-group / --group-scope', () => {
    const groupTicket = (id: string, status: string, deps = 'None') =>
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

    it('--group-scope with a git HEAD → files: union of Target Files + diff, git: names the comparison', async () => {
      const gDir = mkdtempSync(join(tmpdir(), 'sdd-task-scope-git-'));
      writeFileSync(join(gDir, 'core.spec.md'), '# Core\n', 'utf-8');
      writeFileSync(join(gDir, 'core.task.TSK-a.md'), groupTicket('TSK-a', '[x] DONE'), 'utf-8');
      writeFileSync(join(gDir, 'core.task.TSK-b.md'), groupTicket('TSK-b', '[x] DONE'), 'utf-8');
      initGitRepo(gDir);
      // an untracked source file the diff scan should pick up beyond the tickets' own Target Files
      writeFileSync(join(gDir, 'extra.ts'), '// untracked\n', 'utf-8');
      // a non-source file — must also surface now that the scan carries no extension filter
      writeFileSync(join(gDir, 'notes.md'), '# untracked notes\n', 'utf-8');
      try {
        const r = await withCwd(gDir, () => mod.run(argv('--group-scope', 'TSK-a')));
        assert.strictEqual(r.ok, true);
        if (!r.ok) return;
        assert.match(r.text, /^files:$/m);
        assert.match(r.text, /^ {2}src\/TSK-a\.ts$/m);
        assert.match(r.text, /^ {2}src\/TSK-b\.ts$/m);
        assert.match(r.text, /^ {2}extra\.ts$/m);
        assert.match(r.text, /^ {2}notes\.md$/m);
        assert.match(
          r.text,
          /^git: HEAD vs рабочее дерево \(включая untracked, все типы файлов кроме node_modules\) — \d+ файл\(ов\)$/m
        );
        assert.match(r.text, /^handoff:$/m);
        assert.match(r.text, /^ {2}src\/TSK-a\.ts$/m);
      } finally {
        rmSync(gDir, { recursive: true, force: true });
      }
    });

    it('--group-scope with no git HEAD → honest "no git refs" line, files: from Target Files alone', async () => {
      const gDir = mkdtempSync(join(tmpdir(), 'sdd-task-scope-nogit-'));
      writeFileSync(join(gDir, 'core.spec.md'), '# Core\n', 'utf-8');
      writeFileSync(join(gDir, 'core.task.TSK-a.md'), groupTicket('TSK-a', '[x] DONE'), 'utf-8');
      try {
        const r = await withCwd(gDir, () => mod.run(argv('--group-scope', 'TSK-a')));
        assert.strictEqual(r.ok, true);
        if (!r.ok) return;
        assert.match(r.text, /^files:$/m);
        assert.match(r.text, /^ {2}src\/TSK-a\.ts$/m);
        assert.match(r.text, /^contract-anchors: core\.spec\.md#core-contract$/m);
        assert.match(r.text, /^lint-files:\n {2}src\/TSK-a\.ts$/m);
        assert.match(r.text, /^code-roots: src$/m);
        assert.match(
          r.text,
          /^git: git-ссылок нет — область обзора построена по Target Files тикетов$/m
        );
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

    it('--group-scope with an empty scope (no Target Files, no git) → a clear "nothing to build from" message', async () => {
      const gDir = mkdtempSync(join(tmpdir(), 'sdd-task-scope-empty-'));
      writeFileSync(join(gDir, 'core.spec.md'), '# Core\n', 'utf-8');
      const bare = [
        '# Task: TSK-bare',
        '<!--SECTION:META-->',
        '- **Task-ID:** TSK-bare',
        '- **Status:** [ ] TODO',
        '<!--/SECTION:META-->',
        '<!--SECTION:EXECUTION_LOG-->',
        '<!--/SECTION:EXECUTION_LOG-->',
      ].join('\n');
      writeFileSync(join(gDir, 'core.task.TSK-bare.md'), bare, 'utf-8');
      try {
        const r = await withCwd(gDir, () => mod.run(argv('--group-scope', 'TSK-bare')));
        assert.strictEqual(r.ok, true);
        if (!r.ok) return;
        assert.match(r.text, /область обзора построить не из чего/);
        assert.match(r.text, /^handoff:$/m);
        assert.match(r.text, /Handoff-строки с артефактами/);
      } finally {
        rmSync(gDir, { recursive: true, force: true });
      }
    });
  });
});
