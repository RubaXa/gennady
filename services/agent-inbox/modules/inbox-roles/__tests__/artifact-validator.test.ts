// @file: Unit tests for inbox-roles ArtifactValidator — coverage ledger (every Scope file needs
//   findings or an explicit no-findings statement), tool-call cross-check (telemetry vs Scope),
//   injection-coverage-ledger grounding for review_needed lens sessions (D-86 override, TSK-137),
//   and real mermaid parsing (valid diagram passes, malformed diagram is rejected).
// @consumers: node:test runner
// @tasks: TSK-113, TSK-137

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ArtifactValidator } from '../artifact-validator.ts';
import type { ToolCall } from '../../inbox-opencode/opencode.port.ts';
import type { InjectedEntity } from '../../inbox-core/context-builder.ts';
import {
  buildReviewPlan,
  scaffoldReviewReports,
} from '../../../../../cli/cmd/inbox-review-plan/inbox-review-plan.cmd.ts';

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
    /** @purpose Кандидаты data rows (post header+separator) — override to drive
     * injection-coverage grounding scenarios (TSK-137). */
    candidateRows?: string[];
  } = {}
): string {
  const {
    files = ['src/foo.ts'],
    headSha = 'abc1234',
    status = 'filled',
    findings = 'Найдено N проблем.',
    candidateRows = [EMPTY_CANDIDATES_ROW],
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
${candidateRows.join('\n')}

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

// #region START_INTEGRATION_GIT_HELPERS — real git repo builder for the injection-coverage
// integration scenario (TSK-137, D-116): buildTrackContext spawns real git subprocesses with no
// injection seam, so grounding the gate against the SAME producer pass requires a real temp repo
// (mirrors context-builder.test.ts's own makeGitRepo/commitAll convention).

function makeIntegrationGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'inbox-artifact-validator-integration-'));
  execFileSync('git', ['-C', dir, 'init'], { stdio: 'ignore' });
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'test@test.com'], { stdio: 'ignore' });
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'Test'], { stdio: 'ignore' });
  return dir;
}

function commitAllIntegration(dir: string, message: string): void {
  execFileSync('git', ['-C', dir, 'add', '.'], { stdio: 'ignore' });
  execFileSync('git', ['-C', dir, 'commit', '-m', message], { stdio: 'ignore' });
}

// #endregion END_INTEGRATION_GIT_HELPERS

describe('ArtifactValidator — injection-coverage grounding (TSK-137, D-86 override for review_needed lenses)', () => {
  it('verifyInjectionCoverage rejects unlisted reference', async () => {
    // contract: a candidate row referencing a listed injected entity produces no
    // injection-coverage error for that finding; one referencing an absent entity does, typed and
    // file-scoped.
    const dir = setupReportDir({
      files: ['src/foo.ts'],
      findings: 'В файле src/foo.ts обнаружена находка.',
      candidateRows: [
        '| C1 | `src/foo.ts` | 10 | Ошибка обработки | NAT | new-line-comment | low |',
        '| C2 | `src/missing.ts` | 5 | Утечка данных | SEC | new-line-comment | high |',
      ],
    });
    const injectedEntities: InjectedEntity[] = [{ file: 'src/foo.ts', line: 10, symbol: 'foo' }];

    const result = await validator.validate(dir, 'filled', {
      sessionKind: 'track',
      injectedEntities,
    });

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(
        !result.errors.some(
          (e) => e.error.includes('injection-coverage') && e.error.includes('src/foo.ts')
        ),
        `listed reference must not error: ${JSON.stringify(result.errors)}`
      );
      assert.ok(
        result.errors.some(
          (e) => e.error.includes('injection-coverage') && e.error.includes('src/missing.ts')
        ),
        `unlisted reference must error: ${JSON.stringify(result.errors)}`
      );
    }
  });

  it('validate skips tool-call check for review_needed lenses', async () => {
    // Given: injection sessionKind, zero tool calls (D-86 override's whole reason for existing —
    // a low-round injection session would otherwise always fail «мало инструментов»).
    const dir = setupReportDir({
      files: ['src/foo.ts'],
      findings: 'В файле src/foo.ts обнаружена находка.',
      candidateRows: ['| C1 | `src/other.ts` | 3 | Проблема | NAT | new-line-comment | low |'],
    });

    const result = await validator.validate(dir, 'filled', {
      sessionKind: 'track',
      toolCalls: [],
      injectedEntities: [],
    });

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(
        !result.errors.some((e) => e.error.includes('tool-call сверка')),
        `tool-call cross-check must not run: ${JSON.stringify(result.errors)}`
      );
      assert.ok(
        result.errors.some((e) => e.error.includes('injection-coverage')),
        `injection-coverage must run instead: ${JSON.stringify(result.errors)}`
      );
    }
  });

  it('validate fails on finding outside injected context', async () => {
    const dir = setupReportDir({
      files: ['src/foo.ts'],
      findings: 'В файле src/foo.ts обнаружена находка.',
      candidateRows: ['| C1 | `src/foo.ts` | 10 | Проблема | NAT | new-line-comment | low |'],
    });
    const injectedEntities: InjectedEntity[] = [{ file: 'src/other.ts' }];

    const result = await validator.validate(dir, 'filled', {
      sessionKind: 'track',
      injectedEntities,
    });

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.errors.some(
          (e) => e.error.includes('injection-coverage') && e.error.includes('src/foo.ts')
        )
      );
    }
  });

  it('validate still requires explicit no-findings', async () => {
    // D-86 guarantee (coverage ledger — every Scope file needs findings or explicit no-findings)
    // must survive regardless of which grounding branch validate() dispatches to.
    const dir = setupReportDir({
      files: ['src/foo.ts'],
      findings: 'Ничего не написано про этот файл.',
    });
    const injectedEntities: InjectedEntity[] = [{ file: 'src/foo.ts' }];

    const result = await validator.validate(dir, 'filled', {
      sessionKind: 'track',
      injectedEntities,
    });

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.errors.some(
          (e) => e.error.includes('coverage ledger') && e.error.includes('src/foo.ts')
        )
      );
    }
  });

  it('validate keeps legacy tool-call check for thread_triage', async () => {
    // out-of-scope sessionKind (§5.3.1 boundary) — pre-TSK-137 tool-call cross-check unchanged.
    const dir = setupReportDir({
      files: ['src/foo.ts'],
      findings: 'В файле src/foo.ts обнаружена проблема.',
    });
    const toolCalls: ToolCall[] = [{ tool: 'read', path: 'src/other.ts' }];

    const result = await validator.validate(dir, 'filled', {
      sessionKind: 'thread_triage',
      toolCalls,
    });

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.errors.some(
          (e) => e.error.includes('tool-call сверка') && e.error.includes('src/foo.ts')
        )
      );
    }
  });

  it('validate grounds against real injectedEntities from buildTrackContext on real fs', async () => {
    // integration [D-116]: real tmpdir, real scaffoldReviewReports + buildTrackContext call
    // producing real ## Контекст + real injectedEntities, real findings appended to the task
    // file on real fs, real validate() against real fs — no in-memory string fixture, no
    // snapshot review.json.
    const repo = makeIntegrationGitRepo();
    let reportDir: string | undefined;
    try {
      writeFileSync(join(repo, 'src.ts'), '// filler\n');
      commitAllIntegration(repo, 'base');
      writeFileSync(join(repo, 'src.ts'), '// filler\nexport function realFn() {}\n');
      commitAllIntegration(repo, 'change');

      const changeset = {
        files: [{ path: 'src.ts', status: 'M', plus: 1, minus: 0 }],
        totals: { files: 1, plus: 1, minus: 0 },
      };
      const plan = buildReviewPlan(changeset);
      reportDir = mkdtempSync(join(tmpdir(), 'inbox-artifact-validator-report-'));
      const scaffold = await scaffoldReviewReports(
        reportDir,
        'group/project!1',
        'headsha1',
        'HEAD~1',
        plan,
        changeset,
        repo
      );

      const trackKey = Object.keys(scaffold.injectedEntities)[0];
      const injectedEntities = scaffold.injectedEntities[trackKey];
      assert.ok(
        injectedEntities && injectedEntities.length > 0,
        'buildTrackContext should have produced injectedEntities'
      );

      const taskPath = scaffold.tasks[0];
      const scaffolded = readFileSync(taskPath, 'utf8');
      assert.match(scaffolded, /## Контекст/);
      assert.match(scaffolded, /realFn/, 'real Context markdown must mention the real new symbol');

      // problem cell intentionally omits the symbol name — grounding here must come from the
      // file reference alone, not fall back to the symbol-substring match path.
      const goodRow =
        '| C1 | `src.ts` | 2 | Обработка ошибок не покрыта | NAT | new-line-comment | low |';
      const badRow =
        '| C1 | `does-not-exist.ts` | 2 | Обработка ошибок не покрыта | NAT | new-line-comment | low |';

      const filled = scaffolded
        .replace('status: scaffolded', 'status: filled')
        .replace(
          '<!-- FILL: agent -->\n\n## Кандидаты',
          'В файле `src.ts` обнаружена находка по символу realFn.\n\n## Кандидаты'
        )
        .replace(
          `${CANDIDATES_HEADER}\n${CANDIDATES_SEPARATOR}\n`,
          `${CANDIDATES_HEADER}\n${CANDIDATES_SEPARATOR}\n${goodRow}\n`
        )
        .replace(/## Вердикт\n\n<!-- FILL: agent -->\n$/, '## Вердикт\n\nОдобрено.\n');
      writeFileSync(taskPath, filled);
      writeFileSync(join(reportDir, 'README.md'), readmeWithMermaid());

      const okResult = await validator.validate(reportDir, 'filled', {
        sessionKind: 'track',
        injectedEntities,
      });
      assert.strictEqual(okResult.ok, true, `expected ok, got ${JSON.stringify(okResult)}`);

      writeFileSync(taskPath, filled.replace(goodRow, badRow));

      const failResult = await validator.validate(reportDir, 'filled', {
        sessionKind: 'track',
        injectedEntities,
      });
      assert.strictEqual(failResult.ok, false);
      if (!failResult.ok) {
        assert.ok(
          failResult.errors.some(
            (e) => e.error.includes('injection-coverage') && e.error.includes('does-not-exist.ts')
          )
        );
      }
    } finally {
      rmSync(repo, { recursive: true, force: true });
      if (reportDir) rmSync(reportDir, { recursive: true, force: true });
    }
  });
});
