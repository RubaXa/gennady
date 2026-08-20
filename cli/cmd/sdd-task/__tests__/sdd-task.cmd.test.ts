// @file: Integration tests for SddTaskCommand#run — planning surface, manifests, gate-matching, exit codes.
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
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
});
