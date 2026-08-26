// @file: Pure markdown/comment string builders for worker reports, synthesis reports, and posted findings.
// @consumers: PipelineRuntime
// @tasks: TSK-157

import type { ReviewJson } from '../gate-verdict.ts';
import type { ModelResult } from '../synthesize.ts';

/**
 * @purpose Render a durable readable fallback for seeded/legacy workers without prose output.
 * @param taskType Concrete worker type for the fallback header.
 * @param files Files implicated by the findings.
 * @param findings Findings to render as markdown lines.
 * @returns Readable markdown report.
 */
export function renderWorkerReport(
  taskType: string,
  files: string[],
  findings: ModelResult['findings']
): string {
  const findingLines = findings.length
    ? findings.map(
        (finding) =>
          `- **${finding.severity.toUpperCase()}** \`${finding.file}:${finding.line}\` — ${finding.summary}`
      )
    : ['- Замечаний, требующих публикации, не найдено.'];
  return [
    `# ${taskType.replaceAll('_', ' ')}`,
    '',
    '## Проверенный scope',
    '',
    ...(files.length ? files.map((file) => `- \`${file}\``) : ['- Нет применимых файлов']),
    '',
    '## Находки',
    '',
    ...findingLines,
    '',
  ].join('\n');
}

/**
 * @purpose Materialize the final synthesized review as the primary human-readable artifact.
 * @param review Final synthesized review JSON.
 * @param modelResults Model results whose report is being rendered.
 * @returns Human-readable markdown artifact body.
 */
export function renderSynthesisReport(review: ReviewJson, modelResults: ModelResult[]): string {
  const findings = Array.isArray(review.findings) ? review.findings : [];
  const findingLines = findings.length
    ? findings.map((finding, index) => {
        const item = finding as unknown as Record<string, unknown>;
        const location = [item.file, item.line].filter((value) => value !== undefined).join(':');
        return `${index + 1}. **${String(item.severity ?? 'info').toUpperCase()}**${location ? ` \`${location}\`` : ''} — ${String(item.summary ?? 'Без описания')}`;
      })
    : ['Замечаний, требующих публикации, не найдено.'];
  return [
    '# Итог ревью',
    '',
    `> Вердикт: **${String(review.verdict ?? 'COMMENT')}** · ревизия ${String(review.revision ?? 1)}`,
    '',
    '## Синтезированные находки',
    '',
    ...findingLines,
    '',
    '## Результаты дорожек',
    '',
    ...modelResults.map(
      (result) =>
        `- [${result.track.replaceAll('_', ' ')}](tasks/${result.track}.md) — ${result.findings.length} находок · сессия \`${result.runId}\``
    ),
    '',
  ].join('\n');
}

/**
 * @purpose Format one review finding as a GitLab comment body — 🤖 prefix, severity badge,
 *   summary, and a `file:line` anchor (posting-rules AX_POSTING_BOT_PREFIX).
 * @param finding A `review.json` finding (accepts both `summary` and legacy `message`).
 * @returns Markdown comment body.
 */
export function formatFindingComment(finding: Record<string, unknown>): string {
  const severity = String(finding.severity ?? '').toUpperCase();
  const summary = String(finding.summary ?? finding.message ?? '').trim();
  const file = finding.file ? String(finding.file) : '';
  const line = finding.line != null ? String(finding.line) : '';
  const location = file ? (line ? `${file}:${line}` : file) : '';
  const badge = severity ? `**[${severity}]**` : '';
  const head = `🤖 ${badge}${badge ? ' ' : ''}${summary}`.trim();
  return location ? `${head}\n\n\`${location}\`` : head;
}
