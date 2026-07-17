// @file: Tests for inbox-review-plan command — deterministic track classification, plus the
//   document-pipeline scaffold/validate modes and the inbox --reset reports cleanup.
// @consumers: node:test runner
// @tasks: TSK-102, TSK-103, TSK-134

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  writeFileSync,
  mkdirSync,
  rmSync,
  mkdtempSync,
  existsSync,
  readFileSync,
  utimesSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { gcStaleReports } from '../inbox/_core/logic/state-paths.logic.ts';

function runPlan(args: string[]) {
  return spawnSync(
    'node',
    ['--import', 'tsx', 'cli/cmd/inbox-review-plan/inbox-review-plan.cmd.ts', ...args],
    {
      encoding: 'utf8',
      cwd: process.cwd(),
    }
  );
}

function runValidate(dir: string, stage?: string) {
  const args = ['--validate', dir];
  if (stage) args.push('--stage', stage);
  return runPlan(args);
}

// #region START_SCAFFOLD_TEST_HELPERS — tiny git-repo fixture builders for --scaffold tests

function makeGitRepo(prefix: string): string {
  const dir = join(process.cwd(), `.tmp-review-plan-${prefix}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['-C', dir, 'init'], { stdio: 'ignore' });
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'test@test.com'], { stdio: 'ignore' });
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'Test'], { stdio: 'ignore' });
  return dir;
}

function commitAll(dir: string, message: string): void {
  execFileSync('git', ['-C', dir, 'add', '.'], { stdio: 'ignore' });
  execFileSync('git', ['-C', dir, 'commit', '-m', message], { stdio: 'ignore' });
}

// #endregion END_SCAFFOLD_TEST_HELPERS

// #region START_VALIDATE_TEST_HELPERS — hand-built report-dir fixtures for --validate schema gate

const CANDIDATES_HEADER = '| ID | Файл | Строка | Проблема | Ось | Вид | Важность |';
const CANDIDATES_SEPARATOR = '| --- | --- | --- | --- | --- | --- | --- |';

function taskContent(
  opts: {
    headSha?: string;
    status?: string;
    context?: string;
    findings?: string;
    verdict?: string;
    candidatesRow?: string;
    mermaidBlock?: string;
  } = {}
): string {
  const {
    headSha: sha = 'abc1234',
    status = 'filled',
    context = 'Контекст задачи.',
    findings = 'Найдено N проблем.',
    verdict = 'Одобрено.',
    candidatesRow = '| C1 | foo.ts | 10 | пример проблемы | NAT | suggestion | minor |',
    mermaidBlock = '',
  } = opts;

  return `---
ref: group/project!1
headSha: ${sha}
track: logic
files:
  - foo.ts
status: ${status}
---

## Область

- \`foo.ts\`

## Контекст

${context}

## Находки

${findings}
${mermaidBlock}

## Кандидаты

${CANDIDATES_HEADER}
${CANDIDATES_SEPARATOR}
${candidatesRow}

## Вердикт

${verdict}
`;
}

function planContent(planHeadSha = 'abc1234'): string {
  return `---
ref: group/project!1
headSha: ${planHeadSha}
base: HEAD~1
mode: fan_out
createdAt: 2026-01-01T00:00:00.000Z
---

# План ревью — group/project!1

| Дорожка | Файлов | Строк | Фокус | Статус |
| --- | --- | --- | --- | --- |
| logic | 1 | 2 | focus | filled |
`;
}

// Default synthesis README: non-empty Архитектура with a closed mermaid diagram (passes the
// filled-stage README gate). Tests that probe the gate override this via `readme`.
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
  planHeadSha = 'abc1234',
  readme: string | null = VALID_README
): { dir: string; taskPath: string; readmePath: string } {
  const dir = mkdtempSync(join(tmpdir(), 'inbox-validate-'));
  mkdirSync(join(dir, 'tasks'), { recursive: true });
  writeFileSync(join(dir, 'PLAN.md'), planContent(planHeadSha));
  const taskPath = join(dir, 'tasks', 'logic.task.md');
  writeFileSync(taskPath, taskContent(taskOverrides));
  const readmePath = join(dir, 'README.md');
  if (readme !== null) writeFileSync(readmePath, readme);
  return { dir, taskPath, readmePath };
}

// #endregion END_VALIDATE_TEST_HELPERS

describe('inbox-review-plan', () => {
  it('small diff (HEAD~1) → valid plan', () => {
    const r = runPlan(['--path', '.', '--base', 'HEAD~1']);
    assert.strictEqual(r.status, 0);
    const plan = JSON.parse(r.stdout.trim());
    assert.ok(plan.mode === 'inline' || plan.mode === 'fan_out');
    assert.ok(Array.isArray(plan.tracks));
    assert.ok(typeof plan.summary.totalFiles === 'number');
    assert.ok(typeof plan.summary.totalLines === 'number');
  });

  it('--help prints usage', () => {
    const r = runPlan(['--help']);
    assert.strictEqual(r.status, 0);
    assert.ok(r.stdout.includes('inbox-review-plan'));
    assert.ok(r.stdout.includes('--path'));
    assert.ok(r.stdout.includes('--base'));
  });

  it('missing --path → INVALID_ARGS error', () => {
    const r = runPlan(['--base', 'HEAD~1']);
    assert.notStrictEqual(r.status, 0);
    const err = JSON.parse(r.stderr.trim());
    assert.strictEqual(err.error, 'INVALID_ARGS');
  });

  it('missing --base → INVALID_ARGS error', () => {
    const r = runPlan(['--path', '.']);
    assert.notStrictEqual(r.status, 0);
    const err = JSON.parse(r.stderr.trim());
    assert.strictEqual(err.error, 'INVALID_ARGS');
  });

  it('nonexistent worktree → WORKTREE error', () => {
    const r = runPlan(['--path', '/nonexistent/path/12345', '--base', 'HEAD~1']);
    assert.notStrictEqual(r.status, 0);
    const err = JSON.parse(r.stderr.trim());
    assert.strictEqual(err.error, 'WORKTREE');
  });

  it('tracks have required fields', () => {
    const r = runPlan(['--path', '.', '--base', 'HEAD~5']);
    assert.strictEqual(r.status, 0);
    const plan = JSON.parse(r.stdout.trim());
    for (const track of plan.tracks) {
      assert.ok(typeof track.name === 'string');
      assert.ok(Array.isArray(track.files));
      assert.ok(typeof track.lineCount === 'number');
      assert.ok(typeof track.focus === 'string');
      assert.ok(typeof track.directive === 'string');
    }
  });

  it('summary fields present', () => {
    const r = runPlan(['--path', '.', '--base', 'HEAD~5']);
    assert.strictEqual(r.status, 0);
    const plan = JSON.parse(r.stdout.trim());
    assert.ok(typeof plan.summary.totalFiles === 'number');
    assert.ok(typeof plan.summary.totalLines === 'number');
    assert.ok(typeof plan.summary.meaningfulTracks === 'number');
  });

  it('security file path detected in classification', () => {
    // Create a temp git repo with a security-named file and verify classification
    const tmpDir = join(process.cwd(), '.tmp-review-plan-test-' + Date.now());
    try {
      mkdirSync(tmpDir, { recursive: true });
      execFileSync('git', ['-C', tmpDir, 'init'], { stdio: 'ignore' });
      execFileSync('git', ['-C', tmpDir, 'config', 'user.email', 'test@test.com'], {
        stdio: 'ignore',
      });
      execFileSync('git', ['-C', tmpDir, 'config', 'user.name', 'Test'], { stdio: 'ignore' });

      writeFileSync(join(tmpDir, 'auth.ts'), 'export const token = "x";\n');
      writeFileSync(join(tmpDir, 'normal.ts'), 'export const x = 1;\n');
      execFileSync('git', ['-C', tmpDir, 'add', '.'], { stdio: 'ignore' });
      execFileSync('git', ['-C', tmpDir, 'commit', '-m', 'base'], { stdio: 'ignore' });

      writeFileSync(join(tmpDir, 'auth.ts'), 'export const token = "y";\n');
      writeFileSync(join(tmpDir, 'normal.ts'), 'export const x = 2;\n');
      execFileSync('git', ['-C', tmpDir, 'add', '.'], { stdio: 'ignore' });
      execFileSync('git', ['-C', tmpDir, 'commit', '-m', 'change'], { stdio: 'ignore' });

      const r = runPlan(['--path', tmpDir, '--base', 'HEAD~1']);
      assert.strictEqual(r.status, 0);
      const plan = JSON.parse(r.stdout.trim());

      const securityTrack = plan.tracks.find((t: { name: string }) => t.name === 'security');
      const logicTrack = plan.tracks.find((t: { name: string }) => t.name === 'logic');

      assert.ok(securityTrack, 'security track should exist for auth.ts');
      assert.ok(securityTrack.files.includes('auth.ts'), 'auth.ts should be in security track');
      if (logicTrack) {
        assert.ok(!logicTrack.files.includes('auth.ts'), 'auth.ts should NOT be in logic track');
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('inbox-review-plan --scaffold', () => {
  it('fan_out plan (security+logic+tests) → PLAN.md + 3 track task files + README.md + HISTORY.md (flat per-MR dir)', () => {
    const repo = makeGitRepo('fanout');
    const stateDir = mkdtempSync(join(tmpdir(), 'inbox-scaffold-'));
    try {
      writeFileSync(join(repo, 'auth.ts'), 'export const a = 1;\n');
      writeFileSync(join(repo, 'foo.ts'), 'export const b = 1;\n');
      writeFileSync(join(repo, 'foo.test.ts'), "import 'node:test';\n");
      commitAll(repo, 'base');

      writeFileSync(join(repo, 'auth.ts'), 'export const a = 2;\n');
      writeFileSync(join(repo, 'foo.ts'), 'export const b = 2;\n');
      writeFileSync(join(repo, 'foo.test.ts'), "import 'node:test';\nexport const t = 1;\n");
      commitAll(repo, 'change');

      const r = runPlan([
        '--scaffold',
        '--path',
        repo,
        '--base',
        'HEAD~1',
        '--ref',
        'group/project!42',
        '--state-dir',
        stateDir,
      ]);
      assert.strictEqual(r.status, 0);
      const result = JSON.parse(r.stdout.trim());
      assert.strictEqual(result.scaffolded, true);
      assert.ok(existsSync(result.plan));
      assert.strictEqual(result.tasks.length, 3);

      const names = result.tasks.map((t: string) => t.split('/').pop());
      assert.deepStrictEqual(
        new Set(names),
        new Set(['security.task.md', 'logic.task.md', 'tests.task.md'])
      );

      const mrDir = dirname(result.plan);
      assert.ok(existsSync(join(mrDir, 'README.md')));
      assert.ok(existsSync(join(mrDir, 'HISTORY.md')));
      // Flat per-MR dir (no headSha subfolder): PLAN sits directly under reports/<proj-iid>.
      assert.ok(mrDir.endsWith('group__project-42'));
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('inline plan → single tasks/review.task.md with all files, prefilled mechanics', () => {
    const repo = makeGitRepo('inline');
    const stateDir = mkdtempSync(join(tmpdir(), 'inbox-scaffold-'));
    try {
      writeFileSync(join(repo, 'foo.ts'), 'export const b = 1;\n');
      commitAll(repo, 'base');
      writeFileSync(join(repo, 'foo.ts'), 'export const b = 2;\n');
      commitAll(repo, 'change');

      const r = runPlan([
        '--scaffold',
        '--path',
        repo,
        '--base',
        'HEAD~1',
        '--ref',
        'group/project!7',
        '--state-dir',
        stateDir,
      ]);
      assert.strictEqual(r.status, 0);
      const result = JSON.parse(r.stdout.trim());
      assert.strictEqual(result.tasks.length, 1);
      assert.strictEqual(result.tasks[0].split('/').pop(), 'review.task.md');

      const content = readFileSync(result.tasks[0], 'utf8');
      assert.match(content, /status: scaffolded/);
      assert.match(content, /## Область[\s\S]*foo\.ts[\s\S]*\(\+1\/-1\)/);
      // --scaffold always passes worktreePath (TSK-134): ## Контекст is filled with real
      // buildTrackContext markdown (commits + hunks), the old FILL-placeholder is gone.
      assert.match(content, /## Контекст\s*\n\s*\*\*Коммитов \(1\):\*\*/);
      assert.match(content, /### `foo\.ts`/);
      assert.ok(!/## Контекст[\s\S]*<!-- FILL: orchestrator/.test(content));
      assert.match(content, /## Находки\s*\n\s*<!-- FILL: agent/);
      assert.match(content, /## Вердикт\s*\n\s*<!-- FILL: agent/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('scaffoldReviewReports injects real Context section from real git diff', () => {
    // integration: real fixture repo (≥2 real commits), real git diff/log, real fs read —
    // no mock of git/diff anywhere in this scenario (TSK-134 §5 Task-specific Completion).
    const repo = makeGitRepo('inject');
    const stateDir = mkdtempSync(join(tmpdir(), 'inbox-scaffold-'));
    try {
      writeFileSync(join(repo, 'auth.ts'), 'export const a = 1;\n');
      writeFileSync(join(repo, 'foo.ts'), 'export const b = 1;\n');
      commitAll(repo, 'base');

      writeFileSync(join(repo, 'auth.ts'), 'export const a = 2;\n');
      writeFileSync(join(repo, 'foo.ts'), 'export const b = 2;\n');
      commitAll(repo, 'change 1');
      writeFileSync(join(repo, 'foo.ts'), 'export const b = 3;\n');
      commitAll(repo, 'change 2');

      const r = runPlan([
        '--scaffold',
        '--path',
        repo,
        '--base',
        'HEAD~2',
        '--ref',
        'group/project!77',
        '--state-dir',
        stateDir,
      ]);
      assert.strictEqual(r.status, 0);
      const result = JSON.parse(r.stdout.trim());
      assert.strictEqual(result.tasks.length, 2); // security (auth.ts) + logic (foo.ts)

      for (const taskPath of result.tasks) {
        const content = readFileSync(taskPath, 'utf8');
        assert.match(content, /## Контекст\s*\n\s*\*\*Коммитов \(2\):\*\*/);
        assert.match(content, /```diff/);
      }

      // security track gets the FULL MR diff (NFC-SV-09), not just auth.ts's own hunk.
      const securityTask = result.tasks.find((t: string) => t.endsWith('security.task.md'))!;
      const securityContent = readFileSync(securityTask, 'utf8');
      assert.match(securityContent, /### `auth\.ts`/);
      assert.match(securityContent, /### `foo\.ts`/);

      const logicTask = result.tasks.find((t: string) => t.endsWith('logic.task.md'))!;
      const logicContent = readFileSync(logicTask, 'utf8');
      assert.match(logicContent, /### `foo\.ts`/);
      assert.ok(!/### `auth\.ts`/.test(logicContent), 'logic track must not see auth.ts hunks');
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('re-scaffold with task already filled → task file untouched, warning on stderr', () => {
    const repo = makeGitRepo('idempotent');
    const stateDir = mkdtempSync(join(tmpdir(), 'inbox-scaffold-'));
    try {
      writeFileSync(join(repo, 'foo.ts'), 'export const b = 1;\n');
      commitAll(repo, 'base');
      writeFileSync(join(repo, 'foo.ts'), 'export const b = 2;\n');
      commitAll(repo, 'change');

      const args = [
        '--scaffold',
        '--path',
        repo,
        '--base',
        'HEAD~1',
        '--ref',
        'group/project!9',
        '--state-dir',
        stateDir,
      ];
      const first = runPlan(args);
      const firstResult = JSON.parse(first.stdout.trim());
      const taskPath = firstResult.tasks[0];

      const filledContent = readFileSync(taskPath, 'utf8').replace(
        'status: scaffolded',
        'status: filled'
      );
      writeFileSync(taskPath, filledContent);

      const second = runPlan(args);
      assert.strictEqual(second.status, 0);
      assert.match(second.stderr, /status=filled/);
      assert.ok(second.stderr.includes(taskPath));

      const unchangedContent = readFileSync(taskPath, 'utf8');
      assert.strictEqual(unchangedContent, filledContent);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('re-scaffold on a NEW head → filled task refreshed (flat dir reused, fresh visit)', () => {
    const repo = makeGitRepo('newhead');
    const stateDir = mkdtempSync(join(tmpdir(), 'inbox-scaffold-'));
    try {
      writeFileSync(join(repo, 'foo.ts'), 'export const b = 1;\n');
      commitAll(repo, 'base');
      writeFileSync(join(repo, 'foo.ts'), 'export const b = 2;\n');
      commitAll(repo, 'change');

      const args = [
        '--scaffold',
        '--path',
        repo,
        '--base',
        'HEAD~1',
        '--ref',
        'group/project!12',
        '--state-dir',
        stateDir,
      ];
      const first = runPlan(args);
      const taskPath = JSON.parse(first.stdout.trim()).tasks[0];
      writeFileSync(
        taskPath,
        readFileSync(taskPath, 'utf8').replace('status: scaffolded', 'status: filled')
      );

      // Author pushes a new commit → new head → same flat dir, but a fresh visit.
      writeFileSync(join(repo, 'foo.ts'), 'export const b = 3;\n');
      commitAll(repo, 'new head');

      const second = runPlan(args);
      assert.strictEqual(second.status, 0);
      const refreshed = readFileSync(taskPath, 'utf8');
      assert.match(refreshed, /status: scaffolded/, 'new head must refresh the filled task');
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('gcStaleReports removes report dirs older than TTL, keeps fresh ones', () => {
    const root = mkdtempSync(join(tmpdir(), 'inbox-reports-gc-'));
    try {
      const stale = join(root, 'group__proj-1');
      const fresh = join(root, 'group__proj-2');
      mkdirSync(stale, { recursive: true });
      mkdirSync(fresh, { recursive: true });
      const now = Date.parse('2026-01-10T00:00:00Z');
      const old = new Date('2026-01-01T00:00:00Z'); // 9 days → stale (TTL 7d)
      utimesSync(stale, old, old);

      const removed = gcStaleReports(root, 7 * 24 * 60 * 60 * 1000, now);
      assert.ok(removed.includes(stale));
      assert.ok(!existsSync(stale));
      assert.ok(existsSync(fresh));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('HISTORY.md already exists → not overwritten on re-scaffold', () => {
    const repo = makeGitRepo('history');
    const stateDir = mkdtempSync(join(tmpdir(), 'inbox-scaffold-'));
    try {
      writeFileSync(join(repo, 'foo.ts'), 'export const b = 1;\n');
      commitAll(repo, 'base');
      writeFileSync(join(repo, 'foo.ts'), 'export const b = 2;\n');
      commitAll(repo, 'change');

      const args = [
        '--scaffold',
        '--path',
        repo,
        '--base',
        'HEAD~1',
        '--ref',
        'group/project!11',
        '--state-dir',
        stateDir,
      ];
      const first = runPlan(args);
      const firstResult = JSON.parse(first.stdout.trim());
      const historyPath = join(dirname(firstResult.plan), 'HISTORY.md');
      assert.ok(existsSync(historyPath));

      writeFileSync(historyPath, '# custom history entry\n');
      const second = runPlan(args);
      assert.strictEqual(second.status, 0);
      assert.strictEqual(readFileSync(historyPath, 'utf8'), '# custom history entry\n');
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(stateDir, { recursive: true, force: true });
    }
  });
});

describe('inbox-review-plan --validate', () => {
  it('all task files filled with valid tokens → {ok:true}, exit 0', () => {
    const { dir } = setupReportDir();
    try {
      const r = runValidate(dir);
      assert.strictEqual(r.status, 0);
      assert.deepStrictEqual(JSON.parse(r.stdout.trim()), { ok: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--stage enriched, task with status scaffolded → {ok:false, errors}, exit != 0', () => {
    const { dir } = setupReportDir({ status: 'scaffolded' });
    try {
      const r = runValidate(dir, 'enriched');
      assert.notStrictEqual(r.status, 0);
      const result = JSON.parse(r.stdout.trim());
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.length > 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('## Контекст empty without n/a → error names the file and section', () => {
    const { dir, taskPath } = setupReportDir({ context: '' });
    try {
      const r = runValidate(dir);
      assert.notStrictEqual(r.status, 0);
      const result = JSON.parse(r.stdout.trim());
      assert.strictEqual(result.ok, false);
      const err = result.errors.find((e: { file: string }) => e.file === taskPath);
      assert.ok(err);
      assert.match(err.error, /Контекст is empty/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('Candidates row with unknown Kind token → invalid Kind token error', () => {
    const { dir } = setupReportDir({
      candidatesRow: '| C1 | foo.ts | 10 | issue | NAT | typo-fix | minor |',
    });
    try {
      const r = runValidate(dir);
      assert.notStrictEqual(r.status, 0);
      const result = JSON.parse(r.stdout.trim());
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some((e: { error: string }) => /invalid Kind token/.test(e.error)));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('dash-only placeholder candidate row → no invalid-token error (means "no candidates")', () => {
    const { dir } = setupReportDir({ candidatesRow: '| — | — | — | — | — | — | — |' });
    try {
      const r = runValidate(dir);
      const result = JSON.parse(r.stdout.trim());
      assert.ok(
        !(result.errors ?? []).some((e: { error: string }) =>
          /invalid (Kind|Ось) token/.test(e.error)
        ),
        'dash placeholder must not raise token errors'
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('Candidates row with unknown Ось token → invalid Ось token error', () => {
    const { dir } = setupReportDir({
      candidatesRow: '| C1 | foo.ts | 10 | issue | ZZZ | suggestion | minor |',
    });
    try {
      const r = runValidate(dir);
      assert.notStrictEqual(r.status, 0);
      const result = JSON.parse(r.stdout.trim());
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some((e: { error: string }) => /invalid Ось token/.test(e.error)));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('task headSha differs from PLAN.md headSha → stale report error', () => {
    const { dir } = setupReportDir({ headSha: 'deadbeef' }, 'abc1234');
    try {
      const r = runValidate(dir);
      assert.notStrictEqual(r.status, 0);
      const result = JSON.parse(r.stdout.trim());
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some((e: { error: string }) => /stale report/.test(e.error)));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('unclosed ```mermaid block → unclosed mermaid block error', () => {
    const { dir } = setupReportDir({ mermaidBlock: '```mermaid\ngraph TD;\nA-->B;' });
    try {
      const r = runValidate(dir);
      assert.notStrictEqual(r.status, 0);
      const result = JSON.parse(r.stdout.trim());
      assert.strictEqual(result.ok, false);
      assert.ok(
        result.errors.some((e: { error: string }) => /unclosed mermaid block/.test(e.error))
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("## Находки with 'n/a — <reason>' → valid, no error", () => {
    const { dir } = setupReportDir({ findings: 'n/a — нет модификаций' });
    try {
      const r = runValidate(dir);
      assert.strictEqual(r.status, 0);
      assert.deepStrictEqual(JSON.parse(r.stdout.trim()), { ok: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('README.md missing at filled stage → synthesis-not-written error', () => {
    const { dir } = setupReportDir({}, 'abc1234', null);
    try {
      const r = runValidate(dir);
      assert.notStrictEqual(r.status, 0);
      const result = JSON.parse(r.stdout.trim());
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some((e: { error: string }) => /README\.md missing/.test(e.error)));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('README without any mermaid diagram → no diagram error (agent forgot to draw)', () => {
    const readmeNoDiagram = `# Review Report

## Обзор

Текст.

## Архитектура

Просто описание словами, без диаграммы.

## Вердикты

ок
`;
    const { dir } = setupReportDir({}, 'abc1234', readmeNoDiagram);
    try {
      const r = runValidate(dir);
      assert.notStrictEqual(r.status, 0);
      const result = JSON.parse(r.stdout.trim());
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some((e: { error: string }) => /no diagram/.test(e.error)));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('README ## Архитектура still a FILL marker → empty-section error', () => {
    const readmeFill = `# Review Report

## Архитектура

<!-- FILL: orchestrator — C4/flowchart Mermaid, ≤7 узлов, не проза -->
`;
    const { dir } = setupReportDir({}, 'abc1234', readmeFill);
    try {
      const r = runValidate(dir);
      assert.notStrictEqual(r.status, 0);
      const result = JSON.parse(r.stdout.trim());
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some((e: { error: string }) => /Архитектура is empty/.test(e.error)));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('README with a valid mermaid diagram → {ok:true}', () => {
    const { dir } = setupReportDir();
    try {
      const r = runValidate(dir);
      assert.strictEqual(r.status, 0);
      assert.deepStrictEqual(JSON.parse(r.stdout.trim()), { ok: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('README missing ## Поведение / ## Сценарии → ladder error', () => {
    const readmeNoLadder = `# Отчёт ревью

## Архитектура

\`\`\`mermaid
flowchart TD
  A --> B
\`\`\`

## Вердикты

ок
`;
    const { dir } = setupReportDir({}, 'abc1234', readmeNoLadder);
    try {
      const r = runValidate(dir);
      assert.notStrictEqual(r.status, 0);
      const result = JSON.parse(r.stdout.trim());
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some((e: { error: string }) => /Поведение/.test(e.error)));
      assert.ok(result.errors.some((e: { error: string }) => /Сценарии/.test(e.error)));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--stage enriched does NOT require README diagram (gate is filled-only)', () => {
    const { dir } = setupReportDir({ status: 'enriched' }, 'abc1234', null);
    try {
      const r = runValidate(dir, 'enriched');
      assert.strictEqual(r.status, 0);
      assert.deepStrictEqual(JSON.parse(r.stdout.trim()), { ok: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('stop-word in a task section → validation error names it and the replacement', () => {
    const { dir } = setupReportDir({ findings: 'Тут проскочила проза вместо нормального текста.' });
    try {
      const r = runValidate(dir);
      assert.notStrictEqual(r.status, 0);
      const result = JSON.parse(r.stdout.trim());
      assert.strictEqual(result.ok, false);
      assert.ok(
        result.errors.some(
          (e: { error: string }) => /стоп-слово/.test(e.error) && /текст/.test(e.error)
        )
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('inbox --reset clears reports', () => {
  it('inbox --reset removes reportsRoot(stateDir)', () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'inbox-reset-reports-'));
    try {
      const reports = join(stateDir, 'agent-inbox', 'reports');
      mkdirSync(reports, { recursive: true });
      writeFileSync(join(reports, 'marker.txt'), 'x');

      const r = spawnSync(
        'node',
        ['--import', 'tsx', 'cli/cmd/inbox/inbox.cmd.ts', '--reset', '--state-dir', stateDir],
        { encoding: 'utf8', cwd: process.cwd() }
      );

      assert.strictEqual(r.status, 0);
      assert.ok(!existsSync(reports));
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });
});
