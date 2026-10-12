// @file: Tests for check.sh [LOG] — Execution Log token vocabulary and Round-close shape.
// @consumers: CI
// @tasks: TSK-96, TSK-97

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPTS_DIR = path.join(REPO_ROOT, 'ai', 'skills', 'sdd-execute', 'scripts');
const CHECK_SH = path.join(SCRIPTS_DIR, 'check.sh');

const TS = '2026-01-01T00:00:00Z';

/**
 * @purpose Extract the data rows of one TSV section, independent of section ordering.
 * @param lines All output lines.
 * @param header Section header line, e.g. `[LOG]`.
 * @returns Rows between that header and the next one, minus blanks and comments.
 */
function sectionRows(lines: string[], header: string): string[] {
  const start = lines.indexOf(header);
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const next = rest.findIndex((line) => /^\[[A-Z_]+\]$/.test(line));
  return (next === -1 ? rest : rest.slice(0, next)).filter(
    (line) => line.trim() !== '' && !line.startsWith('#')
  );
}

/** @purpose Assemble a ticket whose Execution Log holds the given P1 and Round-close lines. */
function ticket(
  p1Lines: string[],
  closeLines: string[] = [`- [x] \`${TS}\` DONE`],
  taskId = 'TSK-01'
): string {
  return [
    '## 1. Meta',
    '',
    `- **Task-ID:** ${taskId}`,
    '- **Status:** [x] DONE',
    '',
    '## 7. Execution Log',
    '',
    '### Round 1 — 2026-01-01, initial',
    '',
    '#### P1',
    '',
    ...p1Lines,
    '',
    '#### Round close',
    '',
    ...closeLines,
    '',
  ].join('\n');
}

/** @purpose Run check.sh over a one-ticket project and return its [LOG] rows and findings count. */
function runLog(
  body: string,
  taskMode = false
): {
  rows: string[];
  reopens: string[];
  findings: string;
  ruleFindings: string;
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-log-'));
  try {
    const taskId = body.match(/Task-ID:\*\*\s*(TSK-(?:[A-Z][A-Z0-9]*-)?[0-9]+)/)?.[1] ?? 'TSK-01';
    const trackerStatus = body.includes('- **Status:** [~] IN_PROGRESS')
      ? '`[~]` IN_PROGRESS'
      : body.includes('- **Status:** [!] BLOCKED')
        ? '`[!]` BLOCKED'
        : body.includes('- **Status:** [ ] TODO')
          ? '`[ ]` TODO'
          : '`[x]` DONE';
    fs.mkdirSync(path.join(dir, 'tasks', 'demo'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'tasks', 'demo', `demo.${taskId}.md`), body);
    fs.writeFileSync(
      path.join(dir, 'tasks', 'demo', 'README.md'),
      `| Task | Status |\n| --- | --- |\n| [${taskId}](demo.${taskId}.md) | ${trackerStatus} |\n`
    );

    const args = taskMode ? [CHECK_SH, '--task', taskId, dir] : [CHECK_SH, dir];
    const proc = spawnSync('bash', args, { cwd: dir, encoding: 'utf-8' });
    const lines = `${proc.stdout}${proc.stderr}`.split('\n');
    const rows = sectionRows(lines, '[LOG]');

    const summary = Object.fromEntries(
      lines
        .slice(lines.indexOf('[SUMMARY]') + 1)
        .map((line) => line.split('='))
        .filter((pair) => pair.length === 2)
    ) as Record<string, string>;

    return {
      rows,
      reopens: sectionRows(lines, '[REOPENS]'),
      findings: summary.findings,
      ruleFindings: summary.rule_findings,
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** @purpose Add Reopens metadata and canonical persisted audit records to a valid ticket. */
function ticketWithAuditReopens(reopens: number, triggered: Array<string | 'none'>): string {
  const base = ticket([`- [x] \`${TS}\` ver \`npm test\` → pass exit=0`, `- [x] \`${TS}\` DONE`]);
  const extraRounds = Array.from({ length: triggered.length }, (_, index) => index + 2)
    .map(
      (round) =>
        `### Round ${round} — 2026-01-01, audit-driven fix\n\n` +
        `#### P1 — re-run\n\n- [x] \`${TS}\` ver \`npm test\` → pass exit=0\n` +
        `- [x] \`${TS}\` DONE\n\n#### Round close\n\n- [x] \`${TS}\` DONE`
    )
    .join('\n\n');
  const audits = triggered
    .map((value, index) => {
      const finding =
        value === 'none'
          ? ''
          : '\nF-01 | sev=M | type=COMPLETENESS_GAP | conf=H | loc=src/a.ts:1 | phase=P1 | src=ticket | route=ticket-reopen | act=исправить';
      return (
        `### Audit Round ${index + 1} — 2026-01-01, after Execution Round ${index + 1}\n\n` +
        `\`\`\`text\n@audit task=TSK-01 round=${index + 1} after-exec-round=${index + 1} ` +
        `triggered-reopen=${value} status=${value === 'none' ? 'PASS' : 'FAIL'} counts=B0·M0·m0·I0${finding}\n\`\`\``
      );
    })
    .join('\n\n');

  return `${base.replace('- **Status:** [x] DONE', `- **Status:** [x] DONE\n- **Reopens:** ${reopens}`).replace('\n#### Round close', `\n#### Round close`)}\n${extraRounds}\n\n## Audit Rounds\n\n${audits}\n`;
}

describe('check.sh [LOG]', () => {
  it('accepts a log using only canonical tokens', () => {
    // #region START_CANONICAL_TOKENS_SETUP_EXECUTION_LOG
    const { rows, findings } = runLog(
      ticket([
        `- [x] \`${TS}\` intro \`Thing\` ← нужна новая сущность`,
        `- [x] \`${TS}\` decision module=esm ← package runtime requires ESM`,
        `- [x] \`${TS}\` ver \`npm test\` → pass exit=0`,
        `- [x] \`${TS}\` DONE`,
      ])
    );
    // #endregion END_CANONICAL_TOKENS_SETUP_EXECUTION_LOG

    // #region START_CANONICAL_TOKENS_ASSERT_NO_FINDINGS
    assert.deepEqual(rows, []);
    assert.equal(findings, '0');
    // #endregion END_CANONICAL_TOKENS_ASSERT_NO_FINDINGS
  });

  it('flags a token outside the vocabulary', () => {
    const { rows, findings } = runLog(
      ticket([`- [x] \`${TS}\` frobnicate something`, `- [x] \`${TS}\` DONE`])
    );

    assert.equal(rows.length, 1, rows.join('\n'));
    assert.match(rows[0], /unknown-token\tfrobnicate/);
    assert.equal(findings, '1');
  });

  it('reports a retired token as history, not as a finding — rounds are append-only', () => {
    const { rows, findings } = runLog(
      ticket([`- [x] \`${TS}\` DONE`], [`- [x] \`${TS}\` sync demo+root`, `- [x] \`${TS}\` DONE`])
    );

    assert.equal(rows.length, 1, rows.join('\n'));
    assert.match(rows[0], /retired-token\tsync/);
    assert.equal(findings, '0');
  });

  it('treats a trailing colon as cosmetic rather than a different token', () => {
    const { rows } = runLog(
      ticket([`- [x] \`${TS}\` insight: спека молчит про retry`, `- [x] \`${TS}\` DONE`])
    );

    assert.deepEqual(rows, []);
  });

  it('does not mistake blocker lifecycle markers for action tokens', () => {
    const { rows, findings } = runLog(
      ticket([
        `- [x] \`${TS}\` 🛑 BLOCKED: нет доступа к реестру`,
        `- [x] \`${TS}\` ✅ RESOLVED Round-1: реестр доступен`,
        `- [x] \`${TS}\` DONE`,
      ])
    );

    assert.deepEqual(rows, []);
    assert.equal(findings, '0');
  });

  it('flags a Round close whose DONE is not ticked — the round never actually closed', () => {
    const { rows, findings } = runLog(ticket([`- [x] \`${TS}\` DONE`], [`- - [ ] TODO`]));

    assert.equal(rows.length, 1, rows.join('\n'));
    assert.match(rows[0], /unclosed-round/);
    assert.equal(findings, '1');
  });

  // A [ ] TODO ticket carries the scaffolder's untouched skeleton: unticked lines everywhere,
  // including the Round close. That is the normal state of work that has not started, not a defect.
  it('says nothing about a round that never ran', () => {
    const { rows, findings } = runLog(
      ticket(
        ['- [ ] `<ts>` ver `npm test` → <pass|fail> exit=<code>', '- [ ] `<ts>` DONE'],
        ['- [ ] DONE']
      )
    );

    assert.deepEqual(rows, []);
    assert.equal(findings, '0');
  });

  it('demotes a ticked DONE missing only its timestamp to informational', () => {
    const { rows, findings } = runLog(ticket([`- [x] \`${TS}\` DONE`], ['- [x] DONE']));

    assert.equal(rows.length, 1, rows.join('\n'));
    assert.match(rows[0], /round-close-no-timestamp/);
    assert.equal(findings, '0');
  });

  it('counts only audit-triggered reopens', () => {
    const { reopens, findings } = runLog(ticketWithAuditReopens(2, ['Round-2', 'none', 'Round-4']));

    assert.equal(reopens.length, 1, reopens.join('\n'));
    assert.match(reopens[0], /TSK-01\t2\t2\tOK$/);
    assert.equal(findings, '0');
  });

  it('flags Reopens metadata that counts unrelated execution rounds', () => {
    const { reopens, findings } = runLog(ticketWithAuditReopens(2, ['Round-2', 'none']));

    assert.equal(reopens.length, 1, reopens.join('\n'));
    assert.match(reopens[0], /TSK-01\t2\t1\tMISMATCH$/);
    assert.equal(findings, '1');
  });

  it('flags a fabricated checked line that still contains scaffold placeholders', () => {
    const { rows, findings } = runLog(
      ticket(['- [x] `<ts>` ver `<cmd>` → <pass|fail> exit=<code>', `- [x] \`${TS}\` DONE`])
    );

    assert.equal(rows.length, 1, rows.join('\n'));
    assert.match(rows[0], /fabricated-placeholder/);
    assert.equal(findings, '1');
  });

  it('flags token-specific event placeholders without treating all angle brackets as markers', () => {
    const { rows, findings } = runLog(
      ticket([
        `- [x] \`${TS}\` verified \`<tool>@<version>\` <summary>`,
        `- [x] \`${TS}\` ver \`npm test\` → pass exit=0`,
        `- [x] \`${TS}\` DONE`,
      ])
    );

    assert.equal(rows.length, 1, rows.join('\n'));
    assert.match(rows[0], /fabricated-placeholder\tverified/);
    assert.equal(findings, '1');
  });

  it('allows scaffold-like literals in checked engineering event prose', () => {
    const { rows, findings } = runLog(
      ticket([
        `- [x] \`${TS}\` insight literal \`<cmd>\` is documentation syntax`,
        `- [x] \`${TS}\` ver \`npm test\` → pass exit=0`,
        `- [x] \`${TS}\` DONE`,
      ])
    );

    assert.deepEqual(rows, []);
    assert.equal(findings, '0');
  });

  it('discovers current prefixed Task-IDs independently of legacy ticket filenames', () => {
    const { findings } = runLog(
      ticket(
        [`- [x] \`${TS}\` ver \`npm test\` → pass exit=0`, `- [x] \`${TS}\` DONE`],
        undefined,
        'TSK-AIS-001'
      ),
      true
    );

    assert.equal(findings, '0');
  });

  it('does not return clean for a well-formed but nonexistent prefixed Task-ID', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-missing-task-'));
    try {
      // The scope must hold at least one ticket: check.sh exits 2 (NO_TICKETS_FOUND) over an
      // empty one, and "nonexistent id" is only a meaningful case against a populated tree.
      fs.mkdirSync(path.join(dir, 'tasks', 'demo'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'tasks', 'demo', 'demo.task-01.md'), ticket([]));
      fs.writeFileSync(
        path.join(dir, 'tasks', 'demo', 'README.md'),
        '| Task | Status |\n| --- | --- |\n| [TSK-01](demo.task-01.md) | `[x]` DONE |\n'
      );
      const proc = spawnSync('bash', [CHECK_SH, '--task', 'TSK-ZZZ-999', dir], {
        cwd: dir,
        encoding: 'utf-8',
      });

      assert.equal(proc.status, 3);
      assert.match(proc.stdout, /missing\tTSK-ZZZ-999\tno ticket declares this Meta Task-ID/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags a triggered reopen whose target round is not caused by the preceding audit', () => {
    const body = ticketWithAuditReopens(1, ['Round-2']).replace(
      'triggered-reopen=Round-2',
      'triggered-reopen=Round-99'
    );
    const { reopens, findings } = runLog(body);

    assert.match(reopens[0], /MISMATCH$/);
    assert.equal(findings, '1');
  });

  it('flags a phase-owned audit finding that falsely declares no reopen', () => {
    const body = ticketWithAuditReopens(0, ['none']).replace(
      'counts=B0·M0·m0·I0',
      'counts=B0·M1·m0·I0\nF-01 | sev=M | type=COMPLETENESS_GAP | conf=H | loc=src/a.ts:1 | phase=P1 | src=ticket | route=ticket-reopen | act=исправить'
    );
    const { reopens, findings } = runLog(body);

    assert.match(reopens[0], /MISMATCH$/);
    assert.equal(findings, '1');
  });

  it('reports the latest causative audit as pending until its declared Round is created', () => {
    const body = ticketWithAuditReopens(1, ['Round-2'])
      .replace('- **Status:** [x] DONE', '- **Status:** [~] IN_PROGRESS')
      .replace('### Round 2 —', '### Planned Round 2 —');
    const { reopens, findings } = runLog(body);

    assert.match(reopens[0], /PENDING$/);
    assert.equal(findings, '0');
  });
});

const EARLIER = '2026-01-01T08:00:00Z';
const LATER = '2026-01-01T09:00:00Z';

/**
 * @purpose A two-round ticket whose second round's body and close block are caller-supplied.
 * @param round2Entry The `#### P1` lines of Round 2.
 * @param round2Close The `#### Round close` lines of Round 2.
 * @returns The ticket text.
 */
function twoRoundTicket(round2Entry: string[], round2Close: string[]): string {
  return [
    '## 1. Meta',
    '',
    '- **Task-ID:** TSK-01',
    '- **Status:** [x] DONE',
    '',
    '## 7. Execution Log',
    '',
    '### Round 1 — 2026-01-01, initial',
    '',
    '#### P1',
    '',
    `- [x] \`${EARLIER}\` DONE`,
    '',
    '#### Round close',
    '',
    `- [x] \`${EARLIER}\` DONE`,
    '',
    '### Round 2 — 2026-01-01, fix',
    '',
    '#### P1',
    '',
    ...round2Entry,
    '',
    '#### Round close',
    '',
    ...round2Close,
    '',
  ].join('\n');
}

/**
 * @purpose A `## Critic Rounds` section exactly as critic.directive.xml STEP_4 RECORD writes it.
 * @returns The section text, including its `### Round N` heading.
 */
function criticRounds(): string {
  return [
    '',
    '## Critic Rounds',
    '',
    '### Round 9 — 2026-01-01',
    '',
    '- Mode: baseline',
    '- Verdict: NEEDS_WORK',
    `- [x] \`${LATER}\` frobnicate a critic entry shape that does not exist yet`,
    '',
  ].join('\n');
}

describe('check.sh [LOG] — post-close integrity', () => {
  it('flags an entry stamped after its own Round close', () => {
    const { rows, findings } = runLog(
      twoRoundTicket(
        [`- [x] \`${LATER}\` decision late=yes ← дописано после закрытия`],
        [`- [x] \`${EARLIER}\` DONE`]
      )
    );

    assert.equal(rows.length, 1, rows.join('\n'));
    assert.match(rows[0], /entry-after-close/);
    assert.match(rows[0], new RegExp(LATER));
    assert.equal(findings, '1');
  });

  it('stays silent when every entry precedes the close', () => {
    const { rows, findings } = runLog(
      twoRoundTicket(
        [`- [x] \`${EARLIER}\` decision ordered=yes ← по порядку`],
        [`- [x] \`${LATER}\` DONE`]
      )
    );

    assert.deepEqual(rows, []);
    assert.equal(findings, '0');
  });

  // Some projects stamp seconds and some do not. As strings `Z` (0x5A) sorts above `:` (0x3A), so
  // `09:00Z` compares as LATER than `09:00:59Z` of the same minute — a false finding on every
  // minute-precision entry inside a second-precision round.
  it('does not read a minute-precision entry as later than a close in the same minute', () => {
    const { rows, findings } = runLog(
      twoRoundTicket(
        ['- [x] `2026-01-01T09:00Z` decision precision=mixed ← раньше закрытия'],
        ['- [x] `2026-01-01T09:00:59Z` DONE']
      )
    );

    assert.deepEqual(rows, []);
    assert.equal(findings, '0');
  });

  it('still catches a genuinely later entry across the two precisions', () => {
    const { rows, findings } = runLog(
      twoRoundTicket(
        ['- [x] `2026-01-01T09:01Z` decision late=yes ← дописано после закрытия'],
        ['- [x] `2026-01-01T09:00:59Z` DONE']
      )
    );

    assert.equal(rows.length, 1, rows.join('\n'));
    assert.match(rows[0], /entry-after-close/);
    // Stamps are reported verbatim, not in the padded form used for the comparison.
    assert.match(rows[0], /2026-01-01T09:01Z/);
    assert.equal(findings, '1');
  });

  // The structural twin: a line physically inside the close block is never a candidate for the
  // round's max stamp, so a valid token parked there passed every timestamp comparison.
  it('flags a live-token entry sitting inside the close block', () => {
    const { rows, findings } = runLog(
      twoRoundTicket(
        [`- [x] \`${EARLIER}\` DONE`],
        [
          `- [x] \`${EARLIER}\` DONE`,
          `- [x] \`${LATER}\` decision late=yes ← внутри блока закрытия`,
        ]
      )
    );

    assert.equal(rows.length, 1, rows.join('\n'));
    assert.match(rows[0], /extra-close-entry\tdecision/);
    assert.equal(findings, '1');
  });

  it('stays silent on a close block that carries only its DONE', () => {
    const { rows, findings } = runLog(
      twoRoundTicket([`- [x] \`${EARLIER}\` DONE`], [`- [x] \`${LATER}\` DONE`])
    );

    assert.deepEqual(rows, []);
    assert.equal(findings, '0');
  });

  // Rounds are append-only, so a shape rule written later cannot retroactively fail an old round.
  it('leaves a retired token in the close block informational', () => {
    const { rows, findings } = runLog(
      ticket([`- [x] \`${TS}\` DONE`], [`- [x] \`${TS}\` DONE`, `- [x] \`${TS}\` sync demo+root`])
    );

    assert.equal(rows.length, 1, rows.join('\n'));
    assert.match(rows[0], /retired-token\tsync/);
    assert.equal(findings, '0');
  });
});

describe('check.sh [LOG] — the Execution Log region is scoped, not the whole file', () => {
  // `### Round N` is not unique to the Execution Log: critic.directive.xml STEP_4 RECORD writes the
  // same heading into `## Critic Rounds`. That heading is unnumbered, so a numbered-only region exit
  // kept the parser inside the log and reset its round state on a critic round.
  it('leaves the critic section out of the log parse', () => {
    const { rows, findings } = runLog(`${ticket([`- [x] \`${TS}\` DONE`])}${criticRounds()}`);

    assert.deepEqual(rows, []);
    assert.equal(findings, '0');
  });

  it('ends the region at a numbered section too', () => {
    const { rows, findings } = runLog(
      [
        ticket([`- [x] \`${TS}\` DONE`]),
        '## 8. Notes',
        '',
        `- [x] \`${TS}\` frobnicate a shape that is not a log entry`,
        '',
      ].join('\n')
    );

    assert.deepEqual(rows, []);
    assert.equal(findings, '0');
  });

  // A guard on the round attribution itself: the `round` column must come from the Execution Log,
  // so a critic round trailing the log cannot renumber the finding that precedes it.
  it('attributes a finding to its execution round, not to an intervening critic round', () => {
    const { rows, findings } = runLog(
      [
        twoRoundTicket(
          [`- [x] \`${LATER}\` decision late=yes ← после закрытия`],
          [`- [x] \`${EARLIER}\` DONE`]
        ),
        criticRounds(),
      ].join('\n')
    );

    assert.equal(rows.length, 1, rows.join('\n'));
    assert.match(rows[0], /\t2\t\d+\tentry-after-close/);
    assert.equal(findings, '1');
  });
});
