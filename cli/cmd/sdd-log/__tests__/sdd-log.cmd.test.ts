// @file: Integration tests for SddLogCommand#run — append-only, timestamps, round numbering, placeholder rejection.
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli } from '../../../__tests__/tool-behavior/run-cli.ts';
import { readScratchPayloadFile } from '../../../../shared/common/scratch-payload-file.ts';
import { checkPhaseDependencies } from '../../../../shared/sdd/phase-dependencies.ts';
import {
  formatPhaseReceipt,
  phaseReceiptPlanState,
  type PhaseReceipt,
  type PhaseReceiptPlan,
} from '../../../../shared/sdd/phase-receipt.ts';

type LogModule = typeof import('../sdd-log.cmd.ts');

let mod: LogModule;
let origExit: typeof process.exit;
let origArgv: string[];
let origCwd: string;
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

function receipt(phase: string): PhaseReceipt {
  const plan: PhaseReceiptPlan = {
    ticket: 'ticket.md',
    phase,
    profile: 'code',
    profileBasis: 'phase-kind',
    targets: [`src/${phase}.ts`],
    deletedFiles: [],
    verification: [],
    producesCoverage: false,
    environmentState: `sha256:${'1'.repeat(64)}`,
  };
  return {
    schema: 1,
    ...plan,
    planState: phaseReceiptPlanState(plan),
    targetState: `sha256:${'2'.repeat(64)}`,
    commands: [],
  };
}

function completableTicket(receiptPhase: string | null = 'P1'): string {
  return [
    '# t',
    '<!--SECTION:META-->',
    '- **Task-ID:** cli-foo',
    '- **Status:** [~] IN_PROGRESS',
    '<!--/SECTION:META-->',
    '',
    '<!--SECTION:PHASES_OVERVIEW-->',
    '## Phases Overview',
    '| ID | Kind | Deps | Status |',
    '|----|------|------|--------|',
    '| P1 | impl | — | [ ] |',
    '| P2 | test | P1 | [ ] |',
    '<!--/SECTION:PHASES_OVERVIEW-->',
    '',
    '<!--SECTION:EXECUTION_LOG-->',
    '## Execution Log',
    '### Round 1 — 2026-06-20, initial',
    '#### P1',
    '- [x] `2026-06-20T10:00:00.000Z` DONE',
    '**Handoff →** artifacts: [src/old.ts]; decisions: [none]; open: [none]; deviations: []',
    '#### Round close',
    '- [ ] `<ts>` DONE',
    '',
    '### Round 2 — 2026-06-21, retry',
    '#### P1',
    '- [ ] `<ts>` DONE',
    '**Handoff →** artifacts: [...]; decisions: [...]; open: [...]',
    '#### Round close',
    '- [ ] `<ts>` DONE',
    '<!--PHASE_RECEIPTS:v1-->',
    ...(receiptPhase ? [formatPhaseReceipt(receipt(receiptPhase))] : []),
    '<!--/SECTION:EXECUTION_LOG-->',
  ].join('\n');
}

function argv(...rest: string[]): string[] {
  return [
    'node',
    'gennady',
    'sdd-log',
    ...rest.map((value) => (isAbsolute(value) ? relative(dir, value) : value)),
  ];
}

describe('SddLogCommand', () => {
  before(async () => {
    origExit = process.exit;
    origArgv = process.argv;
    origCwd = process.cwd();
    process.exit = ((_code?: number) => undefined) as typeof process.exit;
    process.argv = ['node', 'gennady', 'sdd-log'];
    dir = mkdtempSync(join(tmpdir(), 'sdd-log-'));
    ticket = join(dir, 'ticket.md');
    process.chdir(dir);
    const loaded = await import('../sdd-log.cmd.ts');
    mod = {
      ...loaded,
      run: (rawArgs, now, projectRoot, checkAuthoring) =>
        loaded.run(
          rawArgs,
          now,
          projectRoot ??
            (/^[A-Z][A-Z0-9]*-[A-Za-z0-9]/.test(rawArgs[3] ?? '') ? process.cwd() : dir),
          checkAuthoring
        ),
    };
  });

  beforeEach(() => {
    process.chdir(dir);
    writeFileSync(ticket, BASE, 'utf-8');
  });

  after(() => {
    process.exit = origExit;
    process.argv = origArgv;
    process.chdir(origCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  it('opens a round, numbered and dated, before the close marker', async () => {
    const outcome = await mod.run(argv(ticket, 'round', 'initial'), CLOCK);
    assert.strictEqual(outcome.ok, true, outcome.ok ? '' : outcome.message);
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

  it('gives three typical failures the common object/reason/next/example schema', async () => {
    const outcomes = [
      await mod.run(argv(ticket, 'unknown-mode'), CLOCK),
      await mod.run(argv(ticket, 'line', '<value>'), CLOCK),
      await mod.run(argv('missing.md', 'line', 'verified'), CLOCK),
    ];
    for (const outcome of outcomes) {
      assert.strictEqual(outcome.ok, false);
      if (outcome.ok) continue;
      assert.match(outcome.message, /^\[sdd-log\] ERR_CLI_SDD_LOG_/);
      for (const field of ['object', 'reason', 'action', 'example']) {
        assert.match(outcome.message, new RegExp(`^\\s*${field}:`, 'm'));
      }
    }
  });

  it('rejects absolute/outside and symlink ticket paths without mutating the external victim', async () => {
    const victimDir = mkdtempSync(join(tmpdir(), 'sdd-log-victim-'));
    const victim = join(victimDir, 'ticket.md');
    writeFileSync(victim, BASE, 'utf-8');
    symlinkSync(victim, join(dir, 'linked-ticket.md'));
    try {
      const absolute = await mod.run(
        ['node', 'gennady', 'sdd-log', victim, 'line', 'PWNED'],
        CLOCK
      );
      const linked = await mod.run(argv('linked-ticket.md', 'line', 'PWNED'), CLOCK);
      assert.strictEqual(absolute.ok, false);
      assert.strictEqual(linked.ok, false);
      assert.strictEqual(readFileSync(victim, 'utf-8'), BASE);
    } finally {
      rmSync(join(dir, 'linked-ticket.md'));
      rmSync(victimDir, { recursive: true, force: true });
    }
  });

  it('appends the round-close block', async () => {
    const outcome = await mod.run(argv(ticket, 'close'), CLOCK);
    assert.strictEqual(outcome.ok, true);
    assert.match(
      readFileSync(ticket, 'utf-8'),
      /#### Round close\n- \[x\] `2026-06-21T10:00:00\.000Z` DONE/
    );
  });

  describe('authoring-complete mode — one durable spec receipt', () => {
    const scopeSpec = [
      '# Demo: Scope Specification',
      '<!--SECTION:SCOPE_TYPE-->',
      '## scope-type',
      'library',
      '<!--/SECTION:SCOPE_TYPE-->',
      '<!--SECTION:DECISION_LOG-->',
      '## Decision Log',
      '<details>',
      '<summary>Полные записи Decision Log</summary>',
      '',
      'DEM-DL-1 2026-06-20 — выбрана библиотека (почему: минимальный API)',
      '',
      '</details>',
      '<!--/SECTION:DECISION_LOG-->',
    ].join('\n');

    it('atomically records and echoes the next scope completion receipt', async () => {
      const spec = join(dir, 'demo.spec.md');
      writeFileSync(spec, scopeSpec, 'utf-8');

      const outcome = await mod.run(argv(spec, 'authoring-complete'), CLOCK, dir, () => []);

      assert.strictEqual(outcome.ok, true, outcome.ok ? '' : outcome.message);
      if (outcome.ok) {
        assert.match(
          outcome.text,
          /DEM-DL-2 2026-06-21 — scope draft complete \(почему: sdd-check --spec demo\.spec\.md --authoring прошёл без замечаний\)/
        );
      }
      assert.match(readFileSync(spec, 'utf-8'), /DEM-DL-2 2026-06-21 — scope draft complete/);
    });

    it('uses the module Decision Log and records a module receipt', async () => {
      const spec = join(dir, 'widget.spec.md');
      writeFileSync(
        spec,
        [
          '# Module: Widget',
          '<!--SECTION:MODULE_VISION-->',
          '## Module Vision',
          'Widget owns one operation.',
          '<!--/SECTION:MODULE_VISION-->',
          '<!--SECTION:MODULE_DECISION_LOG-->',
          '## Module Decision Log',
          '<details>',
          '<summary>Полные записи Decision Log</summary>',
          '',
          '</details>',
          '<!--/SECTION:MODULE_DECISION_LOG-->',
        ].join('\n'),
        'utf-8'
      );

      const outcome = await mod.run(argv(spec, 'authoring-complete'), CLOCK, dir, () => []);

      assert.strictEqual(outcome.ok, true, outcome.ok ? '' : outcome.message);
      assert.match(readFileSync(spec, 'utf-8'), /WID-DL-1 2026-06-21 — module draft complete/);
    });

    it('rejects an incomplete draft and a repeated receipt without changing bytes', async () => {
      const spec = join(dir, 'demo.spec.md');
      writeFileSync(spec, scopeSpec, 'utf-8');
      const incomplete = await mod.run(argv(spec, 'authoring-complete'), CLOCK, dir);
      assert.strictEqual(incomplete.ok, false);
      if (!incomplete.ok) assert.match(incomplete.message, /authoring hint\(s\) remain/);
      assert.strictEqual(readFileSync(spec, 'utf-8'), scopeSpec);

      const first = await mod.run(argv(spec, 'authoring-complete'), CLOCK, dir, () => []);
      assert.strictEqual(first.ok, true);
      const completed = readFileSync(spec, 'utf-8');
      const repeated = await mod.run(argv(spec, 'authoring-complete'), CLOCK, dir, () => []);
      assert.strictEqual(repeated.ok, false);
      assert.strictEqual(readFileSync(spec, 'utf-8'), completed);
    });
  });

  it('replaces one scaffolded Round-close skeleton and rejects a repeated close without mutation', async () => {
    const scaffolded = completableTicket();
    writeFileSync(ticket, scaffolded, 'utf-8');

    const first = await mod.run(argv(ticket, 'close'), CLOCK);
    assert.strictEqual(first.ok, true, first.ok ? '' : first.message);
    const closed = readFileSync(ticket, 'utf-8');
    const currentRound = closed.slice(closed.indexOf('### Round 2'));
    assert.strictEqual(currentRound.match(/^#### Round close$/gm)?.length, 1);
    assert.doesNotMatch(currentRound, /#### Round close\n- \[ \] `<ts>` DONE/);
    assert.match(currentRound, /- \[x\] `2026-06-21T10:00:00\.000Z` DONE/);
    assert.match(currentRound, /<!--PHASE_RECEIPTS:v1-->/);

    const second = await mod.run(argv(ticket, 'close'), CLOCK);
    assert.strictEqual(second.ok, false);
    if (!second.ok) assert.match(second.message, /ERR_CLI_SDD_LOG_CLOSE_STATE/);
    assert.strictEqual(readFileSync(ticket, 'utf-8'), closed);
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

  describe('complete mode — one verified phase-state transition', () => {
    const payload = 'artifacts: [src/P1.ts]; decisions: [api=stable]; open: [none]; deviations: []';

    it('closes only P1 in the current Round and makes the P2 dependency gate pass', async () => {
      writeFileSync(ticket, completableTicket(), 'utf-8');
      const before = readFileSync(ticket, 'utf-8');
      assert.match(
        checkPhaseDependencies(before, 'P2', () => null) ?? '',
        /dependency P1 is not checked complete/
      );

      const outcome = await mod.run(argv(ticket, 'complete', payload, '--phase', 'P1'), CLOCK);
      assert.strictEqual(outcome.ok, true, outcome.ok ? '' : outcome.message);
      const body = readFileSync(ticket, 'utf-8');
      assert.strictEqual(
        checkPhaseDependencies(body, 'P2', () => null),
        null
      );
      assert.match(body, /\| P1 \| impl \| — \| \[x\] \|/);
      assert.match(body, /\| P2 \| test \| P1 \| \[ \] \|/);
      assert.match(body, /- \*\*Status:\*\* \[~\] IN_PROGRESS/);
      assert.match(
        body,
        /### Round 1[\s\S]*- \[x\] `2026-06-20T10:00:00\.000Z` DONE[\s\S]*artifacts: \[src\/old\.ts\]/
      );
      assert.match(
        body,
        /### Round 2[\s\S]*#### P1\n- \[x\] `2026-06-21T10:00:00\.000Z` DONE\n\*\*Handoff →\*\* artifacts: \[src\/P1\.ts\]; decisions: \[api=stable\]; open: \[none\]; deviations: \[\]/
      );
      assert.strictEqual((body.match(/- \[ \] `<ts>` DONE/g) ?? []).length, 2);
    });

    it('fails without this phase receipt and leaves every byte untouched', async () => {
      const original = completableTicket(null);
      writeFileSync(ticket, original, 'utf-8');
      const outcome = await mod.run(argv(ticket, 'complete', payload, '--phase', 'P1'), CLOCK);
      assert.strictEqual(outcome.ok, false);
      if (!outcome.ok) {
        assert.strictEqual(outcome.code, 'ERR_CLI_SDD_LOG_COMPLETE_STATE');
        assert.match(outcome.message, /P1 has no CLI-owned SDD_PHASE_RECEIPT/);
      }
      assert.strictEqual(readFileSync(ticket, 'utf-8'), original);
    });

    it('rejects a receipt owned by another phase', async () => {
      const original = completableTicket('P2');
      writeFileSync(ticket, original, 'utf-8');
      const outcome = await mod.run(argv(ticket, 'complete', payload, '--phase', 'P1'), CLOCK);
      assert.strictEqual(outcome.ok, false);
      if (!outcome.ok) assert.match(outcome.message, /P1 has no CLI-owned SDD_PHASE_RECEIPT/);
      assert.strictEqual(readFileSync(ticket, 'utf-8'), original);
    });

    it('rejects a second completion without changing the completed state', async () => {
      writeFileSync(ticket, completableTicket(), 'utf-8');
      const first = await mod.run(argv(ticket, 'complete', payload, '--phase', 'P1'), CLOCK);
      assert.strictEqual(first.ok, true);
      const completed = readFileSync(ticket, 'utf-8');
      const repeated = await mod.run(argv(ticket, 'complete', payload, '--phase', 'P1'), CLOCK);
      assert.strictEqual(repeated.ok, false);
      if (!repeated.ok) assert.match(repeated.message, /status is not the incomplete \[ \] state/);
      assert.strictEqual(readFileSync(ticket, 'utf-8'), completed);
    });

    it('requires --phase and the canonical four-field Handoff payload', async () => {
      const original = completableTicket();
      writeFileSync(ticket, original, 'utf-8');
      const noPhase = await mod.run(argv(ticket, 'complete', payload), CLOCK);
      assert.strictEqual(noPhase.ok, false);
      if (!noPhase.ok) assert.strictEqual(noPhase.exitCode, 4);
      const incompletePayload = await mod.run(
        argv(
          ticket,
          'complete',
          'artifacts: [src/P1.ts]; decisions: []; open: []',
          '--phase',
          'P1'
        ),
        CLOCK
      );
      assert.strictEqual(incompletePayload.ok, false);
      if (!incompletePayload.ok) assert.strictEqual(incompletePayload.exitCode, 4);
      assert.strictEqual(readFileSync(ticket, 'utf-8'), original);
    });

    it('accepts and consumes a newline-terminated agent-safe content file', async () => {
      writeFileSync(ticket, completableTicket(), 'utf-8');
      mkdirSync(join(dir, '.claude', 'tmp'), { recursive: true });
      const payloadPath = join(dir, '.claude', 'tmp', 'complete.txt');
      writeFileSync(payloadPath, `${payload}\n`, 'utf-8');
      const outcome = await mod.run(
        argv(ticket, 'complete', '--content-file', '.claude/tmp/complete.txt', '--phase', 'P1'),
        CLOCK
      );
      assert.strictEqual(outcome.ok, true, outcome.ok ? '' : outcome.message);
      assert.strictEqual(existsSync(payloadPath), false);
      assert.match(readFileSync(ticket, 'utf-8'), /\*\*Handoff →\*\* artifacts: \[src\/P1\.ts\]/);
    });

    it('keeps meaningful nested brackets inside typed fields instead of forcing lossy retries', async () => {
      writeFileSync(ticket, completableTicket(), 'utf-8');
      const nested =
        'artifacts: [src/P1.ts]; decisions: [error=[slugify] Input must be text, regex=[^a-z]]; open: []; deviations: []';
      const outcome = await mod.run(argv(ticket, 'complete', nested, '--phase', 'P1'), CLOCK);
      assert.strictEqual(outcome.ok, true, outcome.ok ? '' : outcome.message);
      assert.match(readFileSync(ticket, 'utf-8'), /error=\[slugify\].*regex=\[\^a-z\]/);
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

  describe('--phase (explicit ownership across historical and re-run phase blocks)', () => {
    it('without --phase, a line always lands under whichever phase header opened LAST', async () => {
      // A malformed/historical ticket can contain phase blocks out of order. A bare `line` has no
      // ownership pointer and therefore follows the last heading; lifecycle modes reject this shape.
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

    it('rejects a bare backticked placeholder but accepts angle brackets inside longer code', async () => {
      await mod.run(argv(ticket, 'phase', 'P1'), CLOCK);
      const rejected = await mod.run(argv(ticket, 'line', '`<cmd>`', '--phase', 'P1'), CLOCK);
      assert.strictEqual(rejected.ok, false);
      if (!rejected.ok) assert.strictEqual(rejected.exitCode, 2);

      const accepted = await mod.run(
        argv(ticket, 'line', 'returns `Promise<TodoStore>`', '--phase', 'P1'),
        CLOCK
      );
      assert.strictEqual(accepted.ok, true);
    });

    it('accepts an inline-code path containing placeholder-shaped segments', async () => {
      await mod.run(argv(ticket, 'phase', 'P1'), CLOCK);
      const outcome = await mod.run(
        argv(ticket, 'line', 'loaded `steps/<step-id>.xml`', '--phase', 'P1'),
        CLOCK
      );
      assert.strictEqual(outcome.ok, true);
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
    await mod.run(argv(ticket, 'phase', 'P1'), CLOCK);
    const outcome = await mod.run(
      argv(
        ticket,
        'blocker',
        'network blocked',
        '--axiom',
        'AX_BLOCKER_ESCALATION',
        '--unblock',
        'grant network access',
        '--phase',
        'P1'
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
    const noAxiom = await mod.run(
      argv(ticket, 'blocker', 'reason', '--unblock', 'do x', '--phase', 'P1'),
      CLOCK
    );
    assert.strictEqual(noAxiom.ok, false);
    if (!noAxiom.ok) assert.strictEqual(noAxiom.exitCode, 4);
    const noUnblock = await mod.run(
      argv(ticket, 'blocker', 'reason', '--axiom', 'AX_X', '--phase', 'P1'),
      CLOCK
    );
    assert.strictEqual(noUnblock.ok, false);
    if (!noUnblock.ok) assert.strictEqual(noUnblock.exitCode, 4);
  });

  describe('file-backed payloads (agent-safe shell boundary)', () => {
    async function inFixture<T>(fn: () => Promise<T> | T): Promise<T> {
      const before = process.cwd();
      process.chdir(dir);
      try {
        mkdirSync(join(dir, '.claude', 'tmp'), { recursive: true });
        return await fn();
      } finally {
        process.chdir(before);
      }
    }

    it('logs quotes, command substitutions, backticks, and newline literally; executes nothing; consumes the file', async () => {
      const payloadPath = join(dir, '.claude', 'tmp', 'event.txt');
      const pwnedPath = join(dir, '.claude', 'tmp', 'PWNED');
      const content =
        'quoted "value" $(touch .claude/tmp/PWNED) `touch .claude/tmp/PWNED`\nnext line';
      const outcome = await inFixture(async () => {
        writeFileSync(payloadPath, content, 'utf-8');
        return mod.run(argv(ticket, 'line', '--content-file', '.claude/tmp/event.txt'), CLOCK);
      });
      assert.strictEqual(outcome.ok, true);
      assert.ok(readFileSync(ticket, 'utf-8').includes(content));
      assert.strictEqual(existsSync(pwnedPath), false, 'payload bytes must never execute');
      assert.strictEqual(
        existsSync(payloadPath),
        false,
        'successful append consumes exact payload'
      );
    });

    it('proves the same boundary through the real CLI entry point', () => {
      mkdirSync(join(dir, '.claude', 'tmp'), { recursive: true });
      const payloadPath = join(dir, '.claude', 'tmp', 'real-cli.txt');
      const pwnedPath = join(dir, '.claude', 'tmp', 'PWNED');
      const content = '"quoted" $(touch .claude/tmp/PWNED) `touch .claude/tmp/PWNED`\nreal CLI';
      writeFileSync(payloadPath, content, 'utf-8');
      const result = runCli(
        ['sdd-log', 'ticket.md', 'line', '--content-file', '.claude/tmp/real-cli.txt'],
        dir
      );
      assert.strictEqual(result.exitCode, 0, result.stdout + result.stderr);
      assert.ok(readFileSync(ticket, 'utf-8').includes(content));
      assert.strictEqual(existsSync(pwnedPath), false);
      assert.strictEqual(existsSync(payloadPath), false);
    });

    it('accepts a strict blocker JSON payload and consumes it only after append', async () => {
      await mod.run(argv(ticket, 'phase', 'P1'), CLOCK);
      const payloadPath = join(dir, '.claude', 'tmp', 'blocker.json');
      const outcome = await inFixture(async () => {
        writeFileSync(
          payloadPath,
          JSON.stringify({
            reason: 'tool says "no" and contains $() literally',
            axiom: 'AX_BLOCKER_ESCALATION',
            unblock: 'operator approves `npm install`',
          }),
          'utf-8'
        );
        return mod.run(
          argv(ticket, 'blocker', '--payload-file', '.claude/tmp/blocker.json', '--phase', 'P1'),
          CLOCK
        );
      });
      assert.strictEqual(outcome.ok, true);
      const body = readFileSync(ticket, 'utf-8');
      assert.match(body, /BLOCKED: tool says "no" and contains \$\(\) literally/);
      assert.match(body, /axiom: AX_BLOCKER_ESCALATION/);
      assert.match(body, /unblock: operator approves `npm install`/);
      assert.strictEqual(existsSync(payloadPath), false);
    });

    it('rejects outside, symlink, oversize, and malformed blocker payloads without consuming them', async () => {
      await mod.run(argv(ticket, 'phase', 'P1'), CLOCK);
      await inFixture(async () => {
        writeFileSync(join(dir, 'outside.txt'), 'outside', 'utf-8');
        const outside = await mod.run(
          argv(ticket, 'line', '--content-file', 'outside.txt', '--phase', 'P1'),
          CLOCK
        );
        assert.strictEqual(outside.ok, false);

        writeFileSync(join(dir, '.claude', 'tmp', 'target.txt'), 'target', 'utf-8');
        symlinkSync('target.txt', join(dir, '.claude', 'tmp', 'link.txt'));
        const symlink = await mod.run(
          argv(ticket, 'line', '--content-file', '.claude/tmp/link.txt', '--phase', 'P1'),
          CLOCK
        );
        assert.strictEqual(symlink.ok, false);

        writeFileSync(join(dir, '.claude', 'tmp', 'large.txt'), 'x'.repeat(32 * 1024 + 1));
        const oversize = await mod.run(
          argv(ticket, 'line', '--content-file', '.claude/tmp/large.txt', '--phase', 'P1'),
          CLOCK
        );
        assert.strictEqual(oversize.ok, false);

        writeFileSync(join(dir, '.claude', 'tmp', 'invalid.txt'), Buffer.from([0xff]));
        const invalidUtf8 = await mod.run(
          argv(ticket, 'line', '--content-file', '.claude/tmp/invalid.txt', '--phase', 'P1'),
          CLOCK
        );
        assert.strictEqual(invalidUtf8.ok, false);

        writeFileSync(join(dir, '.claude', 'tmp', 'bad.json'), '{not-json', 'utf-8');
        const malformed = await mod.run(
          argv(ticket, 'blocker', '--payload-file', '.claude/tmp/bad.json', '--phase', 'P1'),
          CLOCK
        );
        assert.strictEqual(malformed.ok, false);
        if (!malformed.ok) assert.match(malformed.code, /PAYLOAD_FILE/);
        assert.ok(existsSync(join(dir, '.claude', 'tmp', 'bad.json')));
      });
    });

    it('rejects unknown/repeated payload flags and inline+file ambiguity', async () => {
      await inFixture(async () => {
        writeFileSync(join(dir, '.claude', 'tmp', 'event.txt'), 'safe', 'utf-8');
        for (const outcome of [
          await mod.run(argv(ticket, 'line', '--unknown', 'x'), CLOCK),
          await mod.run(
            argv(
              ticket,
              'line',
              '--content-file',
              '.claude/tmp/event.txt',
              '--content-file',
              '.claude/tmp/event.txt'
            ),
            CLOCK
          ),
          await mod.run(
            argv(ticket, 'line', 'inline', '--content-file', '.claude/tmp/event.txt'),
            CLOCK
          ),
        ]) {
          assert.strictEqual(outcome.ok, false);
          if (!outcome.ok) assert.strictEqual(outcome.exitCode, 4);
        }
      });
    });

    it('consumes only the inode that was read and never a same-path replacement', async () => {
      await inFixture(() => {
        const relativePayload = '.claude/tmp/identity.txt';
        const payloadPath = join(dir, relativePayload);
        const originalPath = join(dir, '.claude', 'tmp', 'original.txt');
        writeFileSync(payloadPath, 'same bytes', 'utf-8');
        const read = readScratchPayloadFile(dir, relativePayload);
        assert.strictEqual(read.ok, true);
        if (!read.ok) return;

        renameSync(payloadPath, originalPath);
        writeFileSync(payloadPath, 'same bytes', 'utf-8');
        const failure = read.payload.consume();

        assert.match(failure ?? '', /identity changed/);
        assert.strictEqual(readFileSync(payloadPath, 'utf-8'), 'same bytes');
        assert.strictEqual(readFileSync(originalPath, 'utf-8'), 'same bytes');
      });
    });

    it('refuses a same-path symlink replacement and leaves both replacement and target intact', async () => {
      await inFixture(() => {
        const relativePayload = '.claude/tmp/identity-link.txt';
        const payloadPath = join(dir, relativePayload);
        const targetPath = join(dir, '.claude', 'tmp', 'replacement-target.txt');
        writeFileSync(payloadPath, 'old bytes', 'utf-8');
        const read = readScratchPayloadFile(dir, relativePayload);
        assert.strictEqual(read.ok, true);
        if (!read.ok) return;

        unlinkSync(payloadPath);
        writeFileSync(targetPath, 'old bytes', 'utf-8');
        symlinkSync('replacement-target.txt', payloadPath);
        const failure = read.payload.consume();

        assert.ok(failure);
        assert.strictEqual(readFileSync(payloadPath, 'utf-8'), 'old bytes');
        assert.strictEqual(readFileSync(targetPath, 'utf-8'), 'old bytes');
      });
    });

    it('removes an unchanged original payload and reports a missing original fail-closed', async () => {
      await inFixture(() => {
        const consumedPath = join(dir, '.claude', 'tmp', 'consume.txt');
        writeFileSync(consumedPath, 'consume me', 'utf-8');
        const consumed = readScratchPayloadFile(dir, '.claude/tmp/consume.txt');
        assert.strictEqual(consumed.ok, true);
        if (consumed.ok) {
          assert.strictEqual(consumed.payload.consume(), null);
          assert.strictEqual(existsSync(consumedPath), false);
        }

        const missingPath = join(dir, '.claude', 'tmp', 'missing.txt');
        writeFileSync(missingPath, 'remove first', 'utf-8');
        const missing = readScratchPayloadFile(dir, '.claude/tmp/missing.txt');
        assert.strictEqual(missing.ok, true);
        unlinkSync(missingPath);
        if (missing.ok) {
          assert.match(missing.payload.consume() ?? '', /path is missing|does not exist|ENOENT/);
          assert.strictEqual(existsSync(missingPath), false);
        }
      });
    });
  });

  describe('resolved mode — paired close for blocker', () => {
    it('writes the canonical ✅ RESOLVED line, checked and timestamped', async () => {
      await mod.run(argv(ticket, 'phase', 'P1'), CLOCK);
      const outcome = await mod.run(
        argv(
          ticket,
          'resolved',
          'maxBuffer added to sdd-verify.cmd.ts (02f1b35f)',
          '--phase',
          'P1'
        ),
        CLOCK
      );
      assert.strictEqual(outcome.ok, true);
      const body = readFileSync(ticket, 'utf-8');
      assert.match(
        body,
        /- \[x\] `2026-06-21T10:00:00\.000Z` ✅ RESOLVED: maxBuffer added to sdd-verify\.cmd\.ts \(02f1b35f\)/
      );
    });

    it('requires justification text — exits 4 with no content', async () => {
      const outcome = await mod.run(argv(ticket, 'resolved'), CLOCK);
      assert.strictEqual(outcome.ok, false);
      if (!outcome.ok) assert.strictEqual(outcome.exitCode, 4);
    });

    it('rejects an unreplaced placeholder in the justification text (exit 2)', async () => {
      await mod.run(argv(ticket, 'phase', 'P1'), CLOCK);
      const outcome = await mod.run(
        argv(ticket, 'resolved', 'fixed via <commit>', '--phase', 'P1'),
        CLOCK
      );
      assert.strictEqual(outcome.ok, false);
      if (!outcome.ok) assert.strictEqual(outcome.exitCode, 2);
    });

    it('honors --phase the same way blocker/handoff do', async () => {
      await mod.run(argv(ticket, 'phase', 'P2'), CLOCK);
      await mod.run(argv(ticket, 'phase', 'P1'), CLOCK);
      const outcome = await mod.run(
        argv(ticket, 'resolved', 'p2 blocker fixed', '--phase', 'P2'),
        CLOCK
      );
      assert.strictEqual(outcome.ok, true);
      const body = readFileSync(ticket, 'utf-8');
      const p2At = body.indexOf('#### P2');
      const p1At = body.indexOf('#### P1');
      const resolvedAt = body.indexOf('RESOLVED: p2 blocker fixed');
      assert.ok(p2At < resolvedAt && resolvedAt < p1At, body);
    });

    it('never touches Meta Status', async () => {
      const withStatus = BASE.replace(
        '<!--/SECTION:META-->',
        '- **Status:** [ ] TODO   <!-- [ ] TODO | [~] IN_PROGRESS | [x] DONE | [!] BLOCKED -->\n<!--/SECTION:META-->'
      );
      writeFileSync(ticket, withStatus, 'utf-8');
      await mod.run(argv(ticket, 'phase', 'P1'), CLOCK);
      await mod.run(argv(ticket, 'resolved', 'fixed', '--phase', 'P1'), CLOCK);
      const body = readFileSync(ticket, 'utf-8');
      assert.match(body, /- \*\*Status:\*\* \[ \] TODO   <!--/);
    });

    it('requires --phase on both blocker lifecycle transitions', async () => {
      const opened = await mod.run(
        argv(ticket, 'blocker', 'reason', '--axiom', 'AX_X', '--unblock', 'do x'),
        CLOCK
      );
      assert.strictEqual(opened.ok, false);
      if (!opened.ok) assert.match(opened.message, /requires --phase <PhaseID>/);

      const closed = await mod.run(argv(ticket, 'resolved', 'fixed'), CLOCK);
      assert.strictEqual(closed.ok, false);
      if (!closed.ok) assert.match(closed.message, /requires --phase <PhaseID>/);
    });
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
