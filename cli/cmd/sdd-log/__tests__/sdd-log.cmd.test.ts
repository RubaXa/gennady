// @file: Integration tests for SddLogCommand#run — append-only, timestamps, round numbering, placeholder rejection.
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

type LogModule = typeof import('../sdd-log.cmd.ts');

let mod: LogModule;
let origExit: typeof process.exit;
let origArgv: string[];
let dir: string;
let ticket: string;

const CLOCK = new Date('2026-06-21T10:00:00.000Z');

const BASE = [
  '# t',
  '<!--SECTION:META-->',
  '- **Task-ID:** cli-foo',
  '<!--/SECTION:META-->',
  '',
  '<!--SECTION:EXECUTION_LOG-->',
  '## 7. Execution Log',
  '<!--/SECTION:EXECUTION_LOG-->',
].join('\n');

function argv(...rest: string[]): string[] {
  return ['node', 'gennady', 'sdd-log', ...rest];
}

describe('SddLogCommand', () => {
  before(async () => {
    origExit = process.exit;
    origArgv = process.argv;
    process.exit = ((_code?: number) => undefined) as typeof process.exit;
    process.argv = ['node', 'gennady', 'sdd-log'];
    dir = mkdtempSync(join(tmpdir(), 'sdd-log-'));
    ticket = join(dir, 'ticket.md');
    mod = await import('../sdd-log.cmd.ts');
  });

  beforeEach(() => {
    writeFileSync(ticket, BASE, 'utf-8');
  });

  after(() => {
    process.exit = origExit;
    process.argv = origArgv;
    rmSync(dir, { recursive: true, force: true });
  });

  it('opens a round, numbered and dated, before the close marker', async () => {
    const outcome = await mod.run(argv(ticket, 'round', 'initial'), CLOCK);
    assert.strictEqual(outcome.ok, true);
    const body = readFileSync(ticket, 'utf-8');
    assert.match(body, /### Round 1 — 2026-06-21, initial/);
    // inserted before the close marker
    assert.ok(body.indexOf('### Round 1') < body.indexOf('<!--/SECTION:EXECUTION_LOG-->'));
  });

  it('auto-increments the round number', async () => {
    await mod.run(argv(ticket, 'round', 'initial'), CLOCK);
    await mod.run(argv(ticket, 'round', 'fix: F-001'), CLOCK);
    const body = readFileSync(ticket, 'utf-8');
    assert.match(body, /### Round 1 — /);
    assert.match(body, /### Round 2 — 2026-06-21, fix: F-001/);
  });

  it('appends a timestamped event line and preserves = in content', async () => {
    const outcome = await mod.run(argv(ticket, 'line', 'ver `npm run check` → pass exit=0'), CLOCK);
    assert.strictEqual(outcome.ok, true);
    const body = readFileSync(ticket, 'utf-8');
    assert.match(body, /- \[x\] `2026-06-21T10:00:00\.000Z` ver `npm run check` → pass exit=0/);
  });

  it('appends the round-close block', async () => {
    const outcome = await mod.run(argv(ticket, 'close'), CLOCK);
    assert.strictEqual(outcome.ok, true);
    assert.match(
      readFileSync(ticket, 'utf-8'),
      /#### Round close\n- \[x\] `2026-06-21T10:00:00\.000Z` DONE/
    );
  });

  describe('META Status (round/close drive it; tolerant when Status line is absent)', () => {
    const withStatus = [
      '# t',
      '<!--SECTION:META-->',
      '- **Task-ID:** cli-foo',
      '- **Status:** [ ] TODO   <!-- [ ] TODO | [~] IN_PROGRESS | [x] DONE | [!] BLOCKED -->',
      '<!--/SECTION:META-->',
      '',
      '<!--SECTION:EXECUTION_LOG-->',
      '## 7. Execution Log',
      '<!--/SECTION:EXECUTION_LOG-->',
    ].join('\n');

    it('round sets Meta Status to IN_PROGRESS, keeping the hint comment', async () => {
      writeFileSync(ticket, withStatus, 'utf-8');
      const outcome = await mod.run(argv(ticket, 'round', 'initial'), CLOCK);
      assert.strictEqual(outcome.ok, true);
      if (outcome.ok) assert.match(outcome.text, /status → IN_PROGRESS/);
      const body = readFileSync(ticket, 'utf-8');
      assert.match(
        body,
        /- \*\*Status:\*\* \[~\] IN_PROGRESS   <!-- \[ \] TODO \| \[~\] IN_PROGRESS \| \[x\] DONE \| \[!\] BLOCKED -->/
      );
    });

    it('close sets Meta Status to DONE, keeping the hint comment', async () => {
      writeFileSync(ticket, withStatus, 'utf-8');
      const outcome = await mod.run(argv(ticket, 'close'), CLOCK);
      assert.strictEqual(outcome.ok, true);
      if (outcome.ok) assert.match(outcome.text, /status → DONE/);
      const body = readFileSync(ticket, 'utf-8');
      assert.match(
        body,
        /- \*\*Status:\*\* \[x\] DONE   <!-- \[ \] TODO \| \[~\] IN_PROGRESS \| \[x\] DONE \| \[!\] BLOCKED -->/
      );
    });

    it('round/close on a ticket with no Status line (old ticket) — tolerant, no crash, honest note', async () => {
      // BASE (the shared fixture) has META but no Status line.
      const roundOutcome = await mod.run(argv(ticket, 'round', 'initial'), CLOCK);
      assert.strictEqual(roundOutcome.ok, true);
      if (roundOutcome.ok) {
        assert.match(roundOutcome.text, /META\/Status не найден — статус не обновлён/);
      }
      const closeOutcome = await mod.run(argv(ticket, 'close'), CLOCK);
      assert.strictEqual(closeOutcome.ok, true);
      if (closeOutcome.ok) {
        assert.match(closeOutcome.text, /META\/Status не найден — статус не обновлён/);
      }
      const body = readFileSync(ticket, 'utf-8');
      assert.doesNotMatch(body, /\*\*Status:\*\*/);
    });

    it('line/phase/handoff/blocker modes never touch Meta Status', async () => {
      writeFileSync(ticket, withStatus, 'utf-8');
      await mod.run(argv(ticket, 'line', 'DONE'), CLOCK);
      const body = readFileSync(ticket, 'utf-8');
      assert.match(body, /- \*\*Status:\*\* \[ \] TODO   <!--/);
    });
  });

  it('is append-only — prior sections are untouched', async () => {
    await mod.run(argv(ticket, 'line', 'DONE'), CLOCK);
    const body = readFileSync(ticket, 'utf-8');
    assert.match(body, /<!--SECTION:META-->\n- \*\*Task-ID:\*\* cli-foo\n<!--\/SECTION:META-->/);
    assert.match(body, /## 7\. Execution Log/);
  });

  it('rejects content with an unreplaced placeholder (exit 2)', async () => {
    const outcome = await mod.run(argv(ticket, 'line', 'ver `<cmd>` → pass'), CLOCK);
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) {
      assert.strictEqual(outcome.exitCode, 2);
      assert.match(outcome.code, /PLACEHOLDER/);
    }
    // nothing written
    assert.doesNotMatch(readFileSync(ticket, 'utf-8'), /cmd/);
  });

  it('exits 2 when there is no EXECUTION_LOG section', async () => {
    const noLog = join(dir, 'nolog.md');
    writeFileSync(noLog, '# t\n<!--SECTION:META-->\nx\n<!--/SECTION:META-->\n', 'utf-8');
    const outcome = await mod.run(argv(noLog, 'line', 'DONE'), CLOCK);
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) assert.strictEqual(outcome.exitCode, 2);
  });

  it('exits 4 on unknown mode or missing content', async () => {
    const bad = await mod.run(argv(ticket, 'frobnicate'), CLOCK);
    assert.strictEqual(bad.ok, false);
    if (!bad.ok) assert.strictEqual(bad.exitCode, 4);
    const noContent = await mod.run(argv(ticket, 'line'), CLOCK);
    assert.strictEqual(noContent.ok, false);
    if (!noContent.ok) assert.strictEqual(noContent.exitCode, 4);
  });

  it('preserves %, **, ####, and emoji verbatim in a line — no url-encoding/escaping', async () => {
    const content = 'ver `100%25-lines` **bold** #### heading 🛑🔗💬 done';
    const outcome = await mod.run(argv(ticket, 'line', content), CLOCK);
    assert.strictEqual(outcome.ok, true);
    const body = readFileSync(ticket, 'utf-8');
    assert.ok(body.includes(content), 'content must appear byte-exact');
    assert.ok(!body.includes('%2525'), 'must not double-encode %');
  });

  it('phase mode writes a bare #### <PhaseID> header', async () => {
    const outcome = await mod.run(argv(ticket, 'phase', 'P1'), CLOCK);
    assert.strictEqual(outcome.ok, true);
    const body = readFileSync(ticket, 'utf-8');
    assert.match(body, /\n#### P1\n/);
    assert.ok(body.indexOf('#### P1') < body.indexOf('<!--/SECTION:EXECUTION_LOG-->'));
  });

  it('phase mode with re-run suffix appends it verbatim after the phase id', async () => {
    const outcome = await mod.run(argv(ticket, 'phase', 'P2', '— re-run: F-003'), CLOCK);
    assert.strictEqual(outcome.ok, true);
    const body = readFileSync(ticket, 'utf-8');
    assert.match(body, /\n#### P2 — re-run: F-003\n/);
  });

  describe('--phase (per-phase-block insertion — parallel-phase attribution)', () => {
    it('without --phase, a line always lands under whichever phase header opened LAST — the bug this flag fixes', async () => {
      // P2 opens first (parallel dispatch order is not phase-number order), P1 opens after it —
      // demonstrates why a bare `line` (no pointer) is unsafe once phases run in parallel.
      await mod.run(argv(ticket, 'phase', 'P2'), CLOCK);
      await mod.run(argv(ticket, 'phase', 'P1'), CLOCK);
      const outcome = await mod.run(argv(ticket, 'line', 'p2 discovery'), CLOCK);
      assert.strictEqual(outcome.ok, true);
      const body = readFileSync(ticket, 'utf-8');
      // Misattributed: the line meant for P2 lands after P1's header, i.e. under P1's block.
      assert.ok(body.indexOf('#### P1') < body.indexOf('p2 discovery'));
    });

    it("with --phase, a line is inserted at the end of THAT phase's own block, regardless of open order", async () => {
      await mod.run(argv(ticket, 'phase', 'P2'), CLOCK);
      await mod.run(argv(ticket, 'phase', 'P1'), CLOCK);
      const outcome = await mod.run(argv(ticket, 'line', 'p2 discovery', '--phase', 'P2'), CLOCK);
      assert.strictEqual(outcome.ok, true);
      const body = readFileSync(ticket, 'utf-8');
      // Correctly attributed: the P2 line sits between the P2 and P1 headers, not after P1's.
      const p2At = body.indexOf('#### P2');
      const p1At = body.indexOf('#### P1');
      const lineAt = body.indexOf('p2 discovery');
      assert.ok(p2At < lineAt && lineAt < p1At, body);
    });

    it('handoff mode honors --phase the same way', async () => {
      await mod.run(argv(ticket, 'phase', 'P2'), CLOCK);
      await mod.run(argv(ticket, 'phase', 'P1'), CLOCK);
      const payload = 'artifacts: [a.ts]; decisions: []; open: []';
      const outcome = await mod.run(argv(ticket, 'handoff', payload, '--phase', 'P2'), CLOCK);
      assert.strictEqual(outcome.ok, true);
      const body = readFileSync(ticket, 'utf-8');
      const p2At = body.indexOf('#### P2');
      const p1At = body.indexOf('#### P1');
      const handoffAt = body.indexOf('**Handoff →**');
      assert.ok(p2At < handoffAt && handoffAt < p1At, body);
    });

    it('blocker mode honors --phase the same way', async () => {
      await mod.run(argv(ticket, 'phase', 'P2'), CLOCK);
      await mod.run(argv(ticket, 'phase', 'P1'), CLOCK);
      const outcome = await mod.run(
        argv(
          ticket,
          'blocker',
          'p2 blocked',
          '--axiom',
          'AX_X',
          '--unblock',
          'do y',
          '--phase',
          'P2'
        ),
        CLOCK
      );
      assert.strictEqual(outcome.ok, true);
      const body = readFileSync(ticket, 'utf-8');
      const p2At = body.indexOf('#### P2');
      const p1At = body.indexOf('#### P1');
      const blockedAt = body.indexOf('BLOCKED: p2 blocked');
      assert.ok(p2At < blockedAt && blockedAt < p1At, body);
    });

    it('a later line, still --phase P2, appends after the earlier P2 line, not swallowed by the P1 header pad', async () => {
      await mod.run(argv(ticket, 'phase', 'P2'), CLOCK);
      await mod.run(argv(ticket, 'phase', 'P1'), CLOCK);
      await mod.run(argv(ticket, 'line', 'p2 first', '--phase', 'P2'), CLOCK);
      await mod.run(argv(ticket, 'line', 'p2 second', '--phase', 'P2'), CLOCK);
      const body = readFileSync(ticket, 'utf-8');
      const firstAt = body.indexOf('p2 first');
      const secondAt = body.indexOf('p2 second');
      const p1At = body.indexOf('#### P1');
      assert.ok(firstAt < secondAt && secondAt < p1At, body);
    });

    it('re-run reopens the SAME phase id in a later block — --phase targets the LAST (current) one', async () => {
      await mod.run(argv(ticket, 'phase', 'P1'), CLOCK);
      await mod.run(argv(ticket, 'line', 'old attempt', '--phase', 'P1'), CLOCK);
      await mod.run(argv(ticket, 'close'), CLOCK);
      await mod.run(argv(ticket, 'round', 'fix: F-001'), CLOCK);
      await mod.run(argv(ticket, 'phase', 'P1', '— re-run: F-001'), CLOCK);
      const outcome = await mod.run(argv(ticket, 'line', 'new attempt', '--phase', 'P1'), CLOCK);
      assert.strictEqual(outcome.ok, true);
      const body = readFileSync(ticket, 'utf-8');
      // "new attempt" belongs to the SECOND (re-run) P1 block, after the Round 2 header, not the
      // first Round's closed P1 block.
      const round2At = body.indexOf('Round 2');
      const newAttemptAt = body.indexOf('new attempt');
      assert.ok(round2At < newAttemptAt, body);
    });

    it('exits 2, listing open phase blocks, when --phase names a phase with no open block', async () => {
      await mod.run(argv(ticket, 'phase', 'P1'), CLOCK);
      const outcome = await mod.run(argv(ticket, 'line', 'discovery', '--phase', 'P9'), CLOCK);
      assert.strictEqual(outcome.ok, false);
      if (outcome.ok) return;
      assert.strictEqual(outcome.exitCode, 2);
      assert.match(outcome.code, /PHASE_NOT_OPEN/);
      assert.match(outcome.message, /P9/);
      assert.match(outcome.message, /phases with an open block: P1/);
      assert.match(outcome.message, /sdd-log .* phase P9/);
    });

    it('exits 2 naming no open blocks when EXECUTION_LOG has no phase headers at all', async () => {
      const outcome = await mod.run(argv(ticket, 'line', 'discovery', '--phase', 'P1'), CLOCK);
      assert.strictEqual(outcome.ok, false);
      if (outcome.ok) return;
      assert.strictEqual(outcome.exitCode, 2);
      assert.match(outcome.message, /no phase block is open yet/);
    });

    it('exits 4 when --phase is combined with round, close, or phase mode', async () => {
      const r = await mod.run(argv(ticket, 'round', 'initial', '--phase', 'P1'), CLOCK);
      assert.strictEqual(r.ok, false);
      if (!r.ok) assert.strictEqual(r.exitCode, 4);

      const c = await mod.run(argv(ticket, 'close', '--phase', 'P1'), CLOCK);
      assert.strictEqual(c.ok, false);
      if (!c.ok) assert.strictEqual(c.exitCode, 4);

      const p = await mod.run(argv(ticket, 'phase', 'P1', '--phase', 'P1'), CLOCK);
      assert.strictEqual(p.ok, false);
      if (!p.ok) assert.strictEqual(p.exitCode, 4);
    });

    it('rejects a placeholder in --phase itself (exit 2)', async () => {
      await mod.run(argv(ticket, 'phase', 'P1'), CLOCK);
      const outcome = await mod.run(
        argv(ticket, 'line', 'discovery', '--phase', '<PhaseID>'),
        CLOCK
      );
      assert.strictEqual(outcome.ok, false);
      if (!outcome.ok) assert.strictEqual(outcome.exitCode, 2);
    });
  });

  it('handoff mode writes the **Handoff →** line verbatim, no timestamp', async () => {
    const payload = 'artifacts: [a.ts, b.ts]; decisions: [x=1]; open: []';
    const outcome = await mod.run(argv(ticket, 'handoff', payload), CLOCK);
    assert.strictEqual(outcome.ok, true);
    const body = readFileSync(ticket, 'utf-8');
    assert.ok(body.includes(`**Handoff →** ${payload}`));
    assert.doesNotMatch(
      body.split(`**Handoff →** ${payload}`)[0].slice(-40),
      /\d{4}-\d{2}-\d{2}T.*Handoff/
    );
  });

  it('blocker mode writes the full BLOCKER_FORMAT block with axiom + unblock', async () => {
    const outcome = await mod.run(
      argv(
        ticket,
        'blocker',
        'network blocked',
        '--axiom',
        'AX_BLOCKER_ESCALATION',
        '--unblock',
        'grant network access'
      ),
      CLOCK
    );
    assert.strictEqual(outcome.ok, true);
    const body = readFileSync(ticket, 'utf-8');
    assert.match(body, /- 🛑 `2026-06-21T10:00:00\.000Z` BLOCKED: network blocked/);
    assert.match(body, /  - 🔗 axiom: AX_BLOCKER_ESCALATION/);
    assert.match(body, /  - 💬 unblock: grant network access/);
  });

  it('blocker mode exits 4 when --axiom or --unblock is missing', async () => {
    const noAxiom = await mod.run(argv(ticket, 'blocker', 'reason', '--unblock', 'do x'), CLOCK);
    assert.strictEqual(noAxiom.ok, false);
    if (!noAxiom.ok) assert.strictEqual(noAxiom.exitCode, 4);
    const noUnblock = await mod.run(argv(ticket, 'blocker', 'reason', '--axiom', 'AX_X'), CLOCK);
    assert.strictEqual(noUnblock.ok, false);
    if (!noUnblock.ok) assert.strictEqual(noUnblock.exitCode, 4);
  });

  it('rejects a placeholder in phase/handoff/blocker content (exit 2)', async () => {
    const phase = await mod.run(argv(ticket, 'phase', '<PhaseID>'), CLOCK);
    assert.strictEqual(phase.ok, false);
    if (!phase.ok) assert.strictEqual(phase.exitCode, 2);
    const handoff = await mod.run(argv(ticket, 'handoff', 'artifacts: [<path>]'), CLOCK);
    assert.strictEqual(handoff.ok, false);
    if (!handoff.ok) assert.strictEqual(handoff.exitCode, 2);
  });

  it('unreadable, non-Task-ID-shaped path → tool-teaches hint points at `sdd-task`', async () => {
    const outcome = await mod.run(argv(join(dir, 'nope.md'), 'line', 'DONE'), CLOCK);
    assert.strictEqual(outcome.ok, false);
    if (outcome.ok) return;
    assert.strictEqual(outcome.exitCode, 1);
    assert.match(outcome.message, /run `sdd-task` with no arguments for the execution map/);
  });

  describe('bare Task-ID resolution (AX_TASK_RESOLUTION)', () => {
    // "cli-foo" (the shared BASE fixture) is lowercase-ACR and does not match the v2 Task-ID
    // grammar — these tests build their own grammar-conforming ticket, isolated per test dir.
    const idTicket = (id: string): string => BASE.split('cli-foo').join(id);

    it('resolves to its ticket — output is prefixed with the `[sdd-log] <id> → <path>` banner', async () => {
      const idDir = mkdtempSync(join(tmpdir(), 'sdd-log-id-'));
      writeFileSync(join(idDir, 'ticket.md'), idTicket('TSK-foo'), 'utf-8');
      const origCwd = process.cwd();
      process.chdir(idDir);
      try {
        const outcome = await mod.run(argv('TSK-foo', 'line', 'DONE'), CLOCK);
        assert.strictEqual(outcome.ok, true);
        if (!outcome.ok) return;
        assert.match(outcome.text, /^\[sdd-log\] TSK-foo → ticket\.md\n/);
        const body = readFileSync(join(idDir, 'ticket.md'), 'utf-8');
        assert.match(body, /- \[x\] `.*` DONE/);
      } finally {
        process.chdir(origCwd);
        rmSync(idDir, { recursive: true, force: true });
      }
    });

    it('an unknown but Task-ID-shaped argument → exit 2 listing known Task-IDs', async () => {
      const idDir = mkdtempSync(join(tmpdir(), 'sdd-log-id-'));
      writeFileSync(join(idDir, 'ticket.md'), idTicket('TSK-foo'), 'utf-8');
      const origCwd = process.cwd();
      process.chdir(idDir);
      try {
        const outcome = await mod.run(argv('NOPE-ghost', 'line', 'DONE'), CLOCK);
        assert.strictEqual(outcome.ok, false);
        if (outcome.ok) return;
        assert.strictEqual(outcome.exitCode, 2);
        assert.match(outcome.message, /ERR_CLI_SDD_LOG_UNKNOWN_ID: NOPE-ghost/);
        assert.match(outcome.message, /known Task-IDs:.*TSK-foo/);
      } finally {
        process.chdir(origCwd);
        rmSync(idDir, { recursive: true, force: true });
      }
    });

    it('a Task-ID matching two tickets → exit 2 listing both candidate paths', async () => {
      const dupDir = mkdtempSync(join(tmpdir(), 'sdd-log-dup-'));
      const dup = (name: string): string =>
        [
          `# ${name}`,
          '<!--SECTION:META-->',
          '- **Task-ID:** TSK-dup',
          '<!--/SECTION:META-->',
          '<!--SECTION:EXECUTION_LOG-->',
          '<!--/SECTION:EXECUTION_LOG-->',
        ].join('\n');
      writeFileSync(join(dupDir, 'a.md'), dup('a'), 'utf-8');
      writeFileSync(join(dupDir, 'b.md'), dup('b'), 'utf-8');
      const origCwd = process.cwd();
      process.chdir(dupDir);
      try {
        const outcome = await mod.run(argv('TSK-dup', 'line', 'DONE'), CLOCK);
        assert.strictEqual(outcome.ok, false);
        if (outcome.ok) return;
        assert.strictEqual(outcome.exitCode, 2);
        assert.match(outcome.message, /ERR_CLI_SDD_LOG_AMBIGUOUS_ID: TSK-dup matches 2 tickets/);
        assert.match(outcome.message, /a\.md/);
        assert.match(outcome.message, /b\.md/);
      } finally {
        process.chdir(origCwd);
        rmSync(dupDir, { recursive: true, force: true });
      }
    });

    it('an existing ticket path still works exactly as before (no resolution banner)', async () => {
      const outcome = await mod.run(argv(ticket, 'line', 'DONE'), CLOCK);
      assert.strictEqual(outcome.ok, true);
      if (!outcome.ok) return;
      assert.doesNotMatch(outcome.text, /^\[sdd-log\] cli-foo → /);
    });
  });
});
