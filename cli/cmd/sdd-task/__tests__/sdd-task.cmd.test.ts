// @file: Integration tests for SddTaskCommand#run — planning surface, manifests, gate-matching, exit codes.
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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

  it('exits 1 on a missing file', async () => {
    const missing = await mod.run(argv(join(dir, 'nope.md')));
    assert.strictEqual(missing.ok === false && missing.exitCode, 1);
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
      assert.match(r.text, /pickable \(ready now\): cli-foo/);
      assert.match(r.text, /next: возьми Task-ID из pickable и вызови `sdd-task <id>`/);
    } finally {
      process.chdir(origCwd);
    }
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
});
