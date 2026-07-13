// @file: Unit tests for inbox-roles ArtifactValidator — coverage ledger (every Scope file needs
//   findings or an explicit no-findings statement), tool-call cross-check (telemetry vs Scope), and
//   real mermaid parsing (valid diagram passes, malformed diagram is rejected).
// @consumers: node:test runner
// @tasks: TSK-113

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ArtifactValidator } from '../artifact-validator.ts';
import type { ToolCall } from '../../inbox-opencode/opencode.port.ts';

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

/** @purpose Build a valid README with a mermaid block; the block body is overridable to test malformed diagrams. */
function readmeWithMermaid(mermaidBody = 'flowchart TD\n  A[Middleware] --> B[Store]'): string {
  return `# Review Report

## Обзор

Небольшой MR.

## Архитектура

\`\`\`mermaid
${mermaidBody}
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
}

function setupReportDir(
  taskOverrides: Parameters<typeof taskContent>[0] = {},
  withReadme = true,
  readme = readmeWithMermaid()
): string {
  const dir = mkdtempSync(join(tmpdir(), 'inbox-artifact-validator-'));
  mkdirSync(join(dir, 'tasks'), { recursive: true });
  writeFileSync(join(dir, 'PLAN.md'), planContent());
  writeFileSync(join(dir, 'tasks', 'logic.task.md'), taskContent(taskOverrides));
  if (withReadme) writeFileSync(join(dir, 'README.md'), readme);
  return dir;
}

const validator = new ArtifactValidator();

describe('ArtifactValidator — coverage ledger (Scope file без находок требует явное no-findings)', () => {
  it('GIVEN Scope-файл не упомянут в находках и нет явного no-findings WHEN validate(filled) THEN coverage-ledger error', async () => {
    const dir = setupReportDir({
      files: ['src/foo.ts'],
      findings: 'Ничего особенного не обнаружено.',
    });

    const result = await validator.validate(dir, 'filled');
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.errors.some(
          (e) => e.error.includes('coverage ledger') && e.error.includes('src/foo.ts')
        )
      );
    }
  });

  it('GIVEN явное блэнкет "нет находок" WHEN validate(filled) THEN coverage-ledger error отсутствует', async () => {
    const dir = setupReportDir({
      files: ['src/foo.ts'],
      findings: 'Файл src/foo.ts проверен — нет находок.',
    });

    const result = await validator.validate(dir, 'filled');
    if (!result.ok) {
      assert.ok(!result.errors.some((e) => e.error.includes('coverage ledger')));
    }
  });

  it('GIVEN находки явно упоминают Scope-файл WHEN validate(filled) THEN coverage-ledger error отсутствует', async () => {
    const dir = setupReportDir({
      files: ['src/foo.ts'],
      findings: 'В файле src/foo.ts обнаружена проблема с обработкой ошибок.',
    });

    const result = await validator.validate(dir, 'filled');
    if (!result.ok) {
      assert.ok(!result.errors.some((e) => e.error.includes('coverage ledger')));
    }
  });

  it('GIVEN stage=enriched WHEN validate THEN coverage ledger не проверяется', async () => {
    const dir = setupReportDir(
      { files: ['src/foo.ts'], status: 'enriched', findings: 'Ничего не найдено.' },
      false
    );

    const result = await validator.validate(dir, 'enriched');
    if (!result.ok) {
      assert.ok(!result.errors.some((e) => e.error.includes('coverage ledger')));
    }
  });
});

describe('ArtifactValidator — tool-call cross-check (Scope vs telemetry)', () => {
  it('GIVEN агент не открывал Scope-файл (toolCalls не содержит его путь) WHEN validate(filled) THEN warning', async () => {
    const dir = setupReportDir({
      files: ['src/foo.ts'],
      findings: 'В файле src/foo.ts обнаружена проблема.',
    });
    const toolCalls: ToolCall[] = [{ tool: 'read', path: 'src/other.ts' }];

    const result = await validator.validate(dir, 'filled', toolCalls);
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.errors.some(
          (e) => e.error.includes('tool-call сверка') && e.error.includes('src/foo.ts')
        )
      );
    }
  });

  it('GIVEN toolCalls содержит путь Scope-файла WHEN validate(filled) THEN warning отсутствует', async () => {
    const dir = setupReportDir({
      files: ['src/foo.ts'],
      findings: 'В файле src/foo.ts обнаружена проблема.',
    });
    const toolCalls: ToolCall[] = [{ tool: 'read', path: 'src/foo.ts' }];

    const result = await validator.validate(dir, 'filled', toolCalls);
    if (!result.ok) {
      assert.ok(!result.errors.some((e) => e.error.includes('tool-call сверка')));
    }
  });

  it('GIVEN telemetry недоступна (toolCalls=[]) WHEN validate(filled) THEN cross-check пропускается (не ложный вызов)', async () => {
    const dir = setupReportDir({
      files: ['src/foo.ts'],
      findings: 'В файле src/foo.ts обнаружена проблема.',
    });

    const result = await validator.validate(dir, 'filled', []);
    if (!result.ok) {
      assert.ok(!result.errors.some((e) => e.error.includes('tool-call сверка')));
    }
  });
});

describe('ArtifactValidator — mermaid validity (via mermaid parser, spec §4)', () => {
  it('GIVEN валидная mermaid-диаграмма WHEN validate THEN mermaid-ошибок нет', async () => {
    const dir = setupReportDir(
      { files: ['src/foo.ts'], findings: 'В файле src/foo.ts обнаружена проблема.' },
      true,
      readmeWithMermaid('sequenceDiagram\n  Alice->>Bob: Привет\n  Bob-->>Alice: Ответ')
    );

    const result = await validator.validate(dir, 'filled');
    if (!result.ok) {
      assert.ok(
        !result.errors.some((e) => e.error.startsWith('mermaid:')),
        `valid mermaid should not error: ${JSON.stringify(result.errors)}`
      );
    }
  });

  it('GIVEN синтаксически битая mermaid-диаграмма WHEN validate THEN mermaid-ошибка (парсер отклонил)', async () => {
    const dir = setupReportDir(
      { files: ['src/foo.ts'], findings: 'В файле src/foo.ts обнаружена проблема.' },
      true,
      readmeWithMermaid('graph TD\n  A --> ')
    );

    const result = await validator.validate(dir, 'filled');
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.errors.some((e) => e.error.startsWith('mermaid:')),
        `malformed mermaid should error: ${JSON.stringify(result.errors)}`
      );
    }
  });

  it('GIVEN неизвестный тип диаграммы WHEN validate THEN mermaid-ошибка', async () => {
    const dir = setupReportDir(
      { files: ['src/foo.ts'], findings: 'В файле src/foo.ts обнаружена проблема.' },
      true,
      readmeWithMermaid('grahp TD\n  A --> B')
    );

    const result = await validator.validate(dir, 'filled');
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some((e) => e.error.startsWith('mermaid:')));
    }
  });
});
