// @file: Unit tests for inbox-roles ArtifactValidator — coverage ledger (every Scope file needs
//   findings or an explicit no-findings statement) and tool-call cross-check (telemetry vs Scope).
// @consumers: node:test runner
// @tasks: TSK-113

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ToolCall } from '../../inbox-opencode/opencode.port.ts';

// ─── Import guard ───────────────────────────────────────────────────────────────
// purpose: artifact-validator.ts statically imports validateReviewReports from
// cli/cmd/inbox-review-plan/inbox-review-plan.cmd.ts, which ends with an unconditional top-level
// `process.exit(await run())` (no entrypoint guard) — a pre-existing bug in that file, exercised
// here only because this is the first test to import artifact-validator.ts at all. A dynamic
// import with process.exit patched during load sidesteps it without touching that impl file
// (same pattern as cli/cmd/vcs-reply/__tests__/vcs-reply.resolve.test.ts for the analogous bug
// in vcs-reply.cmd.ts).
const _origExit = process.exit;
process.exit = ((_code?: number) => undefined as never) as typeof process.exit;
const { ArtifactValidator } = await import('../artifact-validator.ts');
process.exit = _origExit;

// ─── Fixture builders (mirrors cli/cmd/inbox-review-plan/inbox-review-plan.test.ts's own
// hand-built report-dir fixtures — the pipeline only ever reads back documents it generated
// itself, so a small hand-written fixture is enough to drive validateReviewReports' gate). ───────

const CANDIDATES_HEADER = '| ID | Файл | Строка | Проблема | Ось | Вид | Важность |';
const CANDIDATES_SEPARATOR = '| --- | --- | --- | --- | --- | --- | --- |';
const EMPTY_CANDIDATES_ROW = '| - | - | - | - | - | - | - |';

function taskContent(
  opts: {
    files?: string[];
    headSha?: string;
    status?: string;
    findings?: string;
  } = {}
): string {
  const {
    files = ['src/foo.ts'],
    headSha = 'abc1234',
    status = 'filled',
    findings = 'Найдено N проблем.',
  } = opts;

  return `---
ref: group/project!1
headSha: ${headSha}
track: logic
files:
${files.map((f) => `  - ${f}`).join('\n')}
status: ${status}
---

## Контекст

Контекст задачи.

## Находки

${findings}

## Кандидаты

${CANDIDATES_HEADER}
${CANDIDATES_SEPARATOR}
${EMPTY_CANDIDATES_ROW}

## Вердикт

Одобрено.
`;
}

function planContent(headSha = 'abc1234'): string {
  return `---
ref: group/project!1
headSha: ${headSha}
base: HEAD~1
mode: fan_out
createdAt: 2026-01-01T00:00:00.000Z
---

# План ревью — group/project!1
`;
}

const VALID_README = `# Review Report

## Обзор

Небольшой MR.

## Архитектура

\`\`\`mermaid
flowchart TD
  A[Middleware] --> B[Store]
\`\`\`

## Поведение

n/a — тривиально

## Сценарии

n/a — тривиально

## Вердикты

1 ✅

## Кандидаты

нет

## Треды

нет
`;

function setupReportDir(
  taskOverrides: Parameters<typeof taskContent>[0] = {},
  withReadme = true
): string {
  const dir = mkdtempSync(join(tmpdir(), 'inbox-artifact-validator-'));
  mkdirSync(join(dir, 'tasks'), { recursive: true });
  writeFileSync(join(dir, 'PLAN.md'), planContent());
  writeFileSync(join(dir, 'tasks', 'logic.task.md'), taskContent(taskOverrides));
  if (withReadme) writeFileSync(join(dir, 'README.md'), VALID_README);
  return dir;
}

const validator = new ArtifactValidator();

describe('ArtifactValidator — coverage ledger (Scope file без находок требует явное no-findings)', () => {
  it('GIVEN Scope-файл не упомянут в находках и нет явного no-findings WHEN validate(filled) THEN coverage-ledger error', () => {
    const dir = setupReportDir({
      files: ['src/foo.ts'],
      findings: 'Ничего особенного не обнаружено.',
    });

    const result = validator.validate(dir, 'filled');
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.errors.some(
          (e) => e.error.includes('coverage ledger') && e.error.includes('src/foo.ts')
        )
      );
    }
  });

  it('GIVEN явное блэнкет "нет находок" WHEN validate(filled) THEN coverage-ledger error отсутствует', () => {
    const dir = setupReportDir({
      files: ['src/foo.ts'],
      findings: 'Файл src/foo.ts проверен — нет находок.',
    });

    const result = validator.validate(dir, 'filled');
    if (!result.ok) {
      assert.ok(!result.errors.some((e) => e.error.includes('coverage ledger')));
    }
  });

  it('GIVEN находки явно упоминают Scope-файл WHEN validate(filled) THEN coverage-ledger error отсутствует', () => {
    const dir = setupReportDir({
      files: ['src/foo.ts'],
      findings: 'В файле src/foo.ts обнаружена проблема с обработкой ошибок.',
    });

    const result = validator.validate(dir, 'filled');
    if (!result.ok) {
      assert.ok(!result.errors.some((e) => e.error.includes('coverage ledger')));
    }
  });

  it('GIVEN stage=enriched WHEN validate THEN coverage ledger не проверяется', () => {
    const dir = setupReportDir(
      { files: ['src/foo.ts'], status: 'enriched', findings: 'Ничего не найдено.' },
      false
    );

    const result = validator.validate(dir, 'enriched');
    if (!result.ok) {
      assert.ok(!result.errors.some((e) => e.error.includes('coverage ledger')));
    }
  });
});

describe('ArtifactValidator — tool-call cross-check (Scope vs telemetry)', () => {
  it('GIVEN агент не открывал Scope-файл (toolCalls не содержит его путь) WHEN validate(filled) THEN warning', () => {
    const dir = setupReportDir({
      files: ['src/foo.ts'],
      findings: 'В файле src/foo.ts обнаружена проблема.',
    });
    const toolCalls: ToolCall[] = [{ tool: 'read', path: 'src/other.ts' }];

    const result = validator.validate(dir, 'filled', toolCalls);
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.errors.some(
          (e) => e.error.includes('tool-call сверка') && e.error.includes('src/foo.ts')
        )
      );
    }
  });

  it('GIVEN toolCalls содержит путь Scope-файла WHEN validate(filled) THEN warning отсутствует', () => {
    const dir = setupReportDir({
      files: ['src/foo.ts'],
      findings: 'В файле src/foo.ts обнаружена проблема.',
    });
    const toolCalls: ToolCall[] = [{ tool: 'read', path: 'src/foo.ts' }];

    const result = validator.validate(dir, 'filled', toolCalls);
    if (!result.ok) {
      assert.ok(!result.errors.some((e) => e.error.includes('tool-call сверка')));
    }
  });

  it('GIVEN telemetry недоступна (toolCalls=[]) WHEN validate(filled) THEN cross-check пропускается (не ложный вызов)', () => {
    const dir = setupReportDir({
      files: ['src/foo.ts'],
      findings: 'В файле src/foo.ts обнаружена проблема.',
    });

    const result = validator.validate(dir, 'filled', []);
    if (!result.ok) {
      assert.ok(!result.errors.some((e) => e.error.includes('tool-call сверка')));
    }
  });
});
