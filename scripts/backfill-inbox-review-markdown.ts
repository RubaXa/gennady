// @file: Backfill readable review documents for legacy JSON-only agent-inbox reports.
// @consumers: one-shot operator migration; new pipeline runs write the same files directly.

import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

type Finding = {
  file?: unknown;
  line?: unknown;
  summary?: unknown;
  severity?: unknown;
};

type WorkerResult = {
  taskId?: unknown;
  type?: unknown;
  runId?: unknown;
  model?: unknown;
  files?: unknown;
  findings?: unknown;
};

function findingLines(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0)
    return ['Замечаний, требующих публикации, не найдено.'];
  return value.map((candidate, index) => {
    const finding = candidate as Finding;
    const location = [finding.file, finding.line]
      .filter((part) => part !== undefined && part !== '')
      .join(':');
    return `${index + 1}. **${String(finding.severity ?? 'info').toUpperCase()}**${location ? ` \`${location}\`` : ''} — ${String(finding.summary ?? 'Без описания')}`;
  });
}

function workerMarkdown(result: WorkerResult, name: string): string {
  const files = Array.isArray(result.files) ? result.files : [];
  return [
    `# ${String(result.type ?? name).replaceAll('_', ' ')}`,
    '',
    `> Сессия: \`${String(result.runId ?? 'legacy')}\` · модель: \`${String(result.model ?? 'unknown')}\``,
    '',
    '## Проверенный scope',
    '',
    ...(files.length ? files.map((file) => `- \`${String(file)}\``) : ['- Нет применимых файлов']),
    '',
    '## Находки',
    '',
    ...findingLines(result.findings),
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const argument = process.argv[2];
  if (!argument) throw new Error('Usage: backfill-inbox-review-markdown.ts <absolute-report-dir>');
  const reportDir = resolve(argument);
  if (basename(reportDir) !== 'report')
    throw new Error('Target must be an explicit report directory');
  const reviewPath = join(reportDir, 'review.json');
  if (!existsSync(reviewPath)) throw new Error(`Missing ${reviewPath}`);

  const tasksDir = join(reportDir, 'tasks');
  await mkdir(tasksDir, { recursive: true });
  const names = (await readdir(tasksDir)).filter(
    (name) => /^(track|lens)_.+\.result\.json$/.test(name) && !name.includes('.opencode-')
  );
  const reports: Array<{ type: string; path: string; findings: number; runId: string }> = [];
  for (const name of names) {
    const result = JSON.parse(await readFile(join(tasksDir, name), 'utf8')) as WorkerResult;
    const type = String(result.type ?? name.replace(/\.result\.json$/, ''));
    const target = join(tasksDir, `${type}.md`);
    await writeFile(target, workerMarkdown(result, type), 'utf8');
    reports.push({
      type,
      path: `tasks/${type}.md`,
      findings: Array.isArray(result.findings) ? result.findings.length : 0,
      runId: String(result.runId ?? 'legacy'),
    });
  }

  const review = JSON.parse(await readFile(reviewPath, 'utf8')) as Record<string, unknown>;
  const finalMarkdown = [
    '# Итог ревью',
    '',
    `> Вердикт: **${String(review.verdict ?? 'COMMENT')}** · ревизия ${String(review.revision ?? 1)}`,
    '',
    '## Синтезированные находки',
    '',
    ...findingLines(review.findings),
    '',
    '## Результаты дорожек и линз',
    '',
    ...reports.map(
      (item) =>
        `- [${item.type.replaceAll('_', ' ')}](${item.path}) — ${item.findings} находок · сессия \`${item.runId}\``
    ),
    '',
  ].join('\n');
  await writeFile(join(reportDir, 'REVIEW.md'), finalMarkdown, 'utf8');
  process.stdout.write(`Materialized REVIEW.md and ${reports.length} worker reports\n`);
}

await main();
