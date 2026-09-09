// @file: Unit tests for the canonical Execution Log token vocabulary (B2-03).
// @consumers: execution-log
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TOKEN_VOCABULARY,
  TOKEN_VOCABULARY_TOKENS,
  isVocabularyToken,
  formatTokenVocabulary,
  parseExecutionLog,
  nextRoundNumber,
} from '../execution-log.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FROZEN_TASK_57 = path.join(
  HERE,
  'fixtures',
  'round-close',
  'cli-sync-skills.task-57.frozen.md'
);

/** @purpose Build a minimal ticket carrying only META + EXECUTION_LOG, for parseExecutionLog tests. */
function ticket(executionLog: string): string {
  return [
    '<!--SECTION:META-->',
    '- **Task-ID:** cli-foo',
    '<!--/SECTION:META-->',
    '<!--SECTION:EXECUTION_LOG-->',
    executionLog,
    '<!--/SECTION:EXECUTION_LOG-->',
  ].join('\n');
}

describe('TOKEN_VOCABULARY', () => {
  it('is a closed set with no duplicate tokens', () => {
    assert.strictEqual(TOKEN_VOCABULARY_TOKENS.length, new Set(TOKEN_VOCABULARY_TOKENS).size);
  });

  it('includes every token that drifted out of the collected table (case #23): ver, yagni, env-fix, correction', () => {
    for (const token of ['ver', 'yagni', 'env-fix', 'correction']) {
      assert.ok(TOKEN_VOCABULARY_TOKENS.includes(token), `vocabulary is missing "${token}"`);
    }
  });

  it('includes "fix" — the board-named token backing 34 live corpus event lines (V-BATCH-04, B2-03)', () => {
    assert.ok(TOKEN_VOCABULARY_TOKENS.includes('fix'), 'vocabulary is missing "fix"');
  });

  it('still carries the original nine tokens (intro/decision/tried/discovery/insight/verified/SDD_PHASE_RECEIPT/BLOCKED/DONE)', () => {
    for (const token of [
      'intro',
      'decision',
      'tried',
      'discovery',
      'insight',
      'verified',
      'SDD_PHASE_RECEIPT',
      'BLOCKED',
      'DONE',
    ]) {
      assert.ok(TOKEN_VOCABULARY_TOKENS.includes(token), `vocabulary is missing "${token}"`);
    }
  });

  it('no grammar re-wraps itself in backticks (formatTokenVocabulary wraps each entry exactly once)', () => {
    for (const entry of TOKEN_VOCABULARY) {
      assert.doesNotMatch(
        entry.grammar,
        /`/,
        `"${entry.token}" grammar must not contain backticks`
      );
    }
  });
});

describe('isVocabularyToken', () => {
  it('accepts every canonical token', () => {
    for (const token of TOKEN_VOCABULARY_TOKENS) assert.strictEqual(isVocabularyToken(token), true);
  });

  it('accepts "correction:" — the live-corpus form with a trailing colon (issue #23)', () => {
    assert.strictEqual(isVocabularyToken('correction:'), true);
  });

  it('rejects an unknown first word', () => {
    assert.strictEqual(isVocabularyToken('padding'), false);
  });

  it('rejects other tokens with a trailing colon — only "correction:" is special-cased', () => {
    assert.strictEqual(isVocabularyToken('intro:'), false);
    assert.strictEqual(isVocabularyToken('ver:'), false);
  });

  it('is case-sensitive (DONE is not done)', () => {
    assert.strictEqual(isVocabularyToken('done'), false);
  });
});

describe('formatTokenVocabulary', () => {
  it('renders one middle-dot-joined line with each grammar backtick-wrapped exactly once', () => {
    const line = formatTokenVocabulary();
    const parts = line.split(' · ');
    assert.strictEqual(parts.length, TOKEN_VOCABULARY.length);
    for (const [i, part] of parts.entries()) {
      assert.strictEqual(part, `\`${TOKEN_VOCABULARY[i]!.grammar}\``);
    }
  });

  it('is deterministic across calls', () => {
    assert.strictEqual(formatTokenVocabulary(), formatTokenVocabulary());
  });
});

// B2-01: the one structural parser — Round → PhaseBlock/RoundClose/trailing.
describe('parseExecutionLog', () => {
  it('is null when EXECUTION_LOG is not a single clean section', () => {
    assert.strictEqual(parseExecutionLog('no section markers here at all'), null);
  });

  it('case 1: nextRoundNumber ignores a `### Round N` heading outside EXECUTION_LOG (## Critic Rounds)', () => {
    const content =
      ticket('### Round 1 — 2026-06-20, initial') + '\n\n## Critic Rounds\n### Round 7 — old';
    assert.strictEqual(nextRoundNumber(content), 2);
  });

  it('V-BATCH-14 blocking #1 (frozen fixture): never repeats the existing `### Round 1` on cli-sync-skills.task-57.md, whose EXECUTION_LOG close marker sits right after the "## 7. Execution Log" heading — before the real Round content, not after it', () => {
    const content = readFileSync(FROZEN_TASK_57, 'utf-8');
    // Sanity on the frozen fixture itself: the section parses `ok` and (misleadingly) empty of
    // Round headings — this is exactly the regression's precondition, not an incidental detail.
    assert.strictEqual(
      /^#{3}\s+Round\s+\d+/m.test(content.split('<!--/SECTION:EXECUTION_LOG-->')[0] ?? ''),
      false,
      'fixture drifted: EXECUTION_LOG now contains a Round heading before its own close marker'
    );
    assert.strictEqual(
      nextRoundNumber(content),
      2,
      'must never re-emit the `### Round 1` this ticket already has'
    );
  });

  it(
    'general case: a `### Round N` heading leaked past a well-formed close marker (misplaced anchor) is still counted, but a later unrelated `## Critic Rounds`' +
      ' Round is still ignored',
    () => {
      const content = [
        '<!--SECTION:META-->',
        '- **Task-ID:** cli-foo',
        '<!--/SECTION:META-->',
        '<!--SECTION:EXECUTION_LOG-->',
        '',
        '## 7. Execution Log',
        '',
        '<!--/SECTION:EXECUTION_LOG-->',
        '',
        '### Round 1 — 2026-01-01, initial',
        '#### P1',
        '- [x] `<ts>` DONE',
        '#### Round close',
        '- [x] `<ts>` DONE',
        '',
        '## Critic Rounds',
        '',
        '### Round 9 — old',
      ].join('\n');
      assert.strictEqual(nextRoundNumber(content), 2);
    }
  );

  it('case 2: a checked line appended after Round close → trailing.length === 1', () => {
    const log = parseExecutionLog(
      ticket(
        [
          '### Round 1 — 2026-06-21, initial',
          '#### P1',
          '- [x] `2026-06-21T10:00:00Z` DONE',
          '#### Round close',
          '- [x] `2026-06-21T10:00:01Z` DONE',
          '- [x] `2026-06-21T11:00:00Z` insight sneaked in after close',
        ].join('\n')
      )
    );
    assert.ok(log);
    assert.strictEqual(log?.rounds.length, 1);
    assert.strictEqual(log?.rounds[0]?.trailing.length, 1);
    assert.strictEqual(log?.rounds[0]?.trailing[0]?.token, 'insight');
  });

  it('case 3: a `#### P3 — re-run:` block opened after close lands in trailing, not phases', () => {
    const log = parseExecutionLog(
      ticket(
        [
          '### Round 1 — 2026-06-21, initial',
          '#### P3',
          '- [x] `2026-06-21T10:00:00Z` DONE',
          '#### Round close',
          '- [x] `2026-06-21T10:00:01Z` DONE',
          '#### P3 — re-run: fix',
          '- [x] `2026-06-21T11:00:00Z` DONE',
        ].join('\n')
      )
    );
    assert.ok(log);
    const round = log?.rounds[0];
    assert.strictEqual(round?.phases.length, 1);
    assert.strictEqual(round?.phases[0]?.rerun, null);
    assert.ok(round?.trailing.some((e) => e.checked && e.token === 'DONE'));
  });

  it('case 4: `T09:00Z` and `T09:00:00Z` parse as valid timestamps for the same instant', () => {
    const log = parseExecutionLog(
      ticket(
        ['### Round 1 — 2026-06-21, initial', '#### P1', '- [x] `2026-06-21T09:00Z` DONE'].join(
          '\n'
        )
      )
    );
    const ts = log?.rounds[0]?.phases[0]?.done?.ts;
    assert.strictEqual(ts, '2026-06-21T09:00Z');
    assert.strictEqual(
      new Date(ts as string).getTime(),
      new Date('2026-06-21T09:00:00Z').getTime()
    );
  });

  it('case 9: a pristine Round 1 skeleton with no checked lines parses cleanly (anti-false-positive)', () => {
    const log = parseExecutionLog(
      ticket(
        [
          '### Round 1 — 2026-06-21, initial',
          '#### P1',
          '- [ ] `<ts>` DONE',
          '**Handoff →** artifacts: [...]; decisions: [...]; open: [...]; deviations: [...]',
          '#### Round close',
          '- [ ] `<ts>` DONE',
        ].join('\n')
      )
    );
    assert.ok(log);
    const round = log?.rounds[0];
    assert.strictEqual(round?.phases.length, 1);
    assert.strictEqual(round?.phases[0]?.done, null);
    assert.strictEqual(round?.close?.done, null);
    assert.deepStrictEqual(round?.trailing, []);
  });

  it('parses the Round heading number, and null for an unparseable one', () => {
    const log = parseExecutionLog(ticket('### Round 3 — 2026-06-21, fix\n#### P1'));
    assert.strictEqual(log?.rounds[0]?.n, 3);
  });
});
