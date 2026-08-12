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
});
