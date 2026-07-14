// @file: Unit tests for inbox-eval gates G1..G10 — one green case and one red case (with evidence
//   assertion) per gate, per ticket TSK-118 §4 BDD.
// @consumers: node:test runner
// @tasks: TSK-118

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateBaseShaSource,
  evaluateScaffoldCleanup,
  evaluateEnrichedValid,
  evaluateFilledValid,
  evaluateSectionNameExact,
  evaluateTablePipeEscaped,
  evaluateMermaidValid,
  evaluateLineInDiffHunk,
  evaluateBodySizeUnderWaf,
  evaluatePostIdempotent,
  DEFAULT_WAF_BODY_THRESHOLD_BYTES,
} from '../gates.ts';
import type { ValidateResult } from '../../inbox-roles/artifact-validator.ts';
import type { EffectResult, ProposedAction } from '../../inbox-roles/effect-executor.ts';
import type { DiffHunkMap } from '../diff-hunk.ts';

describe('G1 — base-sha-source', () => {
  it('GIVEN usedBaseSha === contextBaseSha WHEN evaluateBaseShaSource THEN pass=true', () => {
    const result = evaluateBaseShaSource({ usedBaseSha: 'abc123', contextBaseSha: 'abc123' });
    assert.strictEqual(result.pass, true);
    assert.strictEqual(result.gate, 'G1');
  });

  it('GIVEN base !== diff_refs.base_sha (пересчитанный merge-base) WHEN evaluateBaseShaSource THEN pass=false + evidence с обоими SHA', () => {
    const result = evaluateBaseShaSource({
      usedBaseSha: 'recomputed999',
      contextBaseSha: 'abc123',
    });
    assert.strictEqual(result.pass, false);
    assert.match(result.evidence, /recomputed999/);
    assert.match(result.evidence, /abc123/);
  });
});

describe('G2 — scaffold-cleanup', () => {
  it('GIVEN присутствующие треки == ожидаемым WHEN evaluateScaffoldCleanup THEN pass=true', () => {
    const result = evaluateScaffoldCleanup({
      presentTracks: ['logic', 'ui'],
      expectedTracks: ['logic', 'ui'],
    });
    assert.strictEqual(result.pass, true);
  });

  it('GIVEN присутствует stale-трек от предыдущего (wrong-base) прогона WHEN evaluateScaffoldCleanup THEN pass=false + evidence перечисляет stale', () => {
    const result = evaluateScaffoldCleanup({
      presentTracks: ['logic', 'ui', 'stale-track'],
      expectedTracks: ['logic', 'ui'],
    });
    assert.strictEqual(result.pass, false);
    assert.match(result.evidence, /stale-track/);
  });
});

describe('G3 — enriched-valid (обёртка над ValidateResult)', () => {
  it('GIVEN validate(enriched) ok=true WHEN evaluateEnrichedValid THEN pass=true', () => {
    const result = evaluateEnrichedValid({ ok: true });
    assert.strictEqual(result.gate, 'G3');
    assert.strictEqual(result.pass, true);
  });

  it('GIVEN validate(enriched) ok=false WHEN evaluateEnrichedValid THEN pass=false + evidence с файлом/ошибкой', () => {
    const validateResult: ValidateResult = {
      ok: false,
      errors: [{ file: 'tasks/logic.task.md', error: 'coverage ledger: src/foo.ts не упомянут' }],
    };
    const result = evaluateEnrichedValid(validateResult);
    assert.strictEqual(result.pass, false);
    assert.match(result.evidence, /tasks\/logic\.task\.md/);
    assert.match(result.evidence, /coverage ledger/);
  });
});

describe('G5 — filled-valid (обёртка над ValidateResult)', () => {
  it('GIVEN validate(filled) ok=true WHEN evaluateFilledValid THEN pass=true', () => {
    const result = evaluateFilledValid({ ok: true });
    assert.strictEqual(result.gate, 'G5');
    assert.strictEqual(result.pass, true);
  });

  it('GIVEN validate(filled) ok=false (coverage ledger gap) WHEN evaluateFilledValid THEN pass=false + evidence', () => {
    const validateResult: ValidateResult = {
      ok: false,
      errors: [
        { file: 'tasks/logic.task.md', error: 'tool-call сверка: src/foo.ts не открывался' },
      ],
    };
    const result = evaluateFilledValid(validateResult);
    assert.strictEqual(result.pass, false);
    assert.match(result.evidence, /tool-call сверка/);
  });
});

describe('G6 — section-name-exact (обёртка над ValidateResult)', () => {
  it('GIVEN validate(README) ok=true WHEN evaluateSectionNameExact THEN pass=true', () => {
    const result = evaluateSectionNameExact({ ok: true });
    assert.strictEqual(result.gate, 'G6');
    assert.strictEqual(result.pass, true);
  });

  it('GIVEN заголовок "## Архитектура (C4)" вместо канонического "## Архитектура" WHEN evaluateSectionNameExact THEN pass=false + evidence', () => {
    const validateResult: ValidateResult = {
      ok: false,
      errors: [
        {
          file: 'README.md',
          error: 'section name mismatch: "## Архитектура (C4)" ожидалось "## Архитектура"',
        },
      ],
    };
    const result = evaluateSectionNameExact(validateResult);
    assert.strictEqual(result.pass, false);
    assert.match(result.evidence, /Архитектура \(C4\)/);
  });
});

describe('G4 — table-pipe-escaped', () => {
  it('GIVEN все строки таблицы с одинаковым числом ячеек WHEN evaluateTablePipeEscaped THEN pass=true', () => {
    const result = evaluateTablePipeEscaped([
      {
        file: 'README.md',
        content: '| A | B |\n| --- | --- |\n| 1 | 2 |\n',
      },
    ]);
    assert.strictEqual(result.gate, 'G4');
    assert.strictEqual(result.pass, true);
  });

  it('GIVEN необрамленный `|` в ячейке (например "readonly unknown[] | undefined") WHEN evaluateTablePipeEscaped THEN pass=false + file/line', () => {
    const result = evaluateTablePipeEscaped([
      {
        file: 'README.md',
        content: '| A | B |\n| --- | --- |\n| 1 | readonly unknown[] | undefined |\n',
      },
    ]);
    assert.strictEqual(result.pass, false);
    assert.match(result.evidence, /README\.md:3/);
  });
});

describe('G7 — mermaid-valid', () => {
  it('GIVEN validate() без mermaid-ошибок (ok=true) WHEN evaluateMermaidValid THEN pass=true', () => {
    const result = evaluateMermaidValid({ ok: true });
    assert.strictEqual(result.gate, 'G7');
    assert.strictEqual(result.pass, true);
  });

  it('GIVEN validate() с ошибкой `mermaid:`-префиксом WHEN evaluateMermaidValid THEN pass=false + evidence', () => {
    const validateResult: ValidateResult = {
      ok: false,
      errors: [{ file: 'README.md', error: 'mermaid: unexpected token' }],
    };
    const result = evaluateMermaidValid(validateResult);
    assert.strictEqual(result.pass, false);
    assert.match(result.evidence, /mermaid: unexpected token/);
  });
});

describe('G8 — line-in-diff-hunk', () => {
  const diffHunks: DiffHunkMap = new Map([
    [
      'src/foo.ts',
      { newLines: new Set([5, 6, 11, 12, 13]), ranges: [{ newStart: 5, newCount: 2 }] },
    ],
  ]);

  it('GIVEN newLine входит в diff-hunk WHEN evaluateLineInDiffHunk THEN pass=true', () => {
    const result = evaluateLineInDiffHunk(diffHunks, [{ file: 'src/foo.ts', newLine: 5 }]);
    assert.strictEqual(result.gate, 'G8');
    assert.strictEqual(result.pass, true);
  });

  it('GIVEN newLine вне diff-hunk WHEN evaluateLineInDiffHunk THEN pass=false + hunk-диапазоны в evidence', () => {
    const result = evaluateLineInDiffHunk(diffHunks, [{ file: 'src/foo.ts', newLine: 20 }]);
    assert.strictEqual(result.pass, false);
    assert.match(result.evidence, /src\/foo\.ts:20/);
    assert.match(result.evidence, /5,2/);
  });
});

describe('G9 — body-size-under-waf', () => {
  it('GIVEN тело строго меньше порога WHEN evaluateBodySizeUnderWaf THEN pass=true', () => {
    const result = evaluateBodySizeUnderWaf('short body');
    assert.strictEqual(result.gate, 'G9');
    assert.strictEqual(result.pass, true);
  });

  it('GIVEN тело >8192 байт WHEN evaluateBodySizeUnderWaf THEN pass=false + размер в evidence', () => {
    const bigBody = 'x'.repeat(DEFAULT_WAF_BODY_THRESHOLD_BYTES + 1);
    const result = evaluateBodySizeUnderWaf(bigBody);
    assert.strictEqual(result.pass, false);
    assert.match(result.evidence, new RegExp(`size=${DEFAULT_WAF_BODY_THRESHOLD_BYTES + 1}B`));
  });
});

describe('G10 — post-idempotent', () => {
  const baseAction: ProposedAction = { type: 'react', commentId: 'c1', emoji: '👍' };

  it('GIVEN повторный dry-run не применил новых действий WHEN evaluatePostIdempotent THEN pass=true (newly_applied=0)', () => {
    const secondRun: EffectResult = {
      outcomes: [{ action: baseAction, status: 'skipped_idempotent' }],
    };
    const result = evaluatePostIdempotent(secondRun);
    assert.strictEqual(result.gate, 'G10');
    assert.strictEqual(result.pass, true);
    assert.match(result.evidence, /newly_applied=0/);
  });

  it('GIVEN повторный dry-run снова применил действие (double-post) WHEN evaluatePostIdempotent THEN pass=false', () => {
    const secondRun: EffectResult = {
      outcomes: [{ action: baseAction, status: 'applied' }],
    };
    const result = evaluatePostIdempotent(secondRun);
    assert.strictEqual(result.pass, false);
    assert.match(result.evidence, /newly_applied=1/);
  });
});
