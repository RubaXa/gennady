// @file: Types, error codes, and finding formatting for the sdd-check command.
// @consumers: SddCheckCommand
// @tasks: N/A

import { relative, resolve } from 'node:path';
import type { Finding, TicketRef } from '../../../shared/sdd/check.ts';
import { unreadableTicketHint } from '../../../shared/sdd/ticket-resolve.ts';
import { normalizeSddToolFailure } from '../../../shared/sdd/tool-guidance.ts';

/** @purpose Neither --task nor --all was given. */
export const ERR_CLI_SDD_CHECK_BAD_INVOCATION = 'ERR_CLI_SDD_CHECK_BAD_INVOCATION' as const;
/** @purpose The --task ticket file does not exist or cannot be read. */
export const ERR_CLI_SDD_CHECK_FILE = 'ERR_CLI_SDD_CHECK_FILE' as const;
/** @purpose --task argument has Task-ID shape but no ticket in the tree carries that Meta Task-ID. */
export const ERR_CLI_SDD_CHECK_UNKNOWN_ID = 'ERR_CLI_SDD_CHECK_UNKNOWN_ID' as const;
/** @purpose More than one ticket carries the same Meta Task-ID (a project-wide collision). */
export const ERR_CLI_SDD_CHECK_AMBIGUOUS_ID = 'ERR_CLI_SDD_CHECK_AMBIGUOUS_ID' as const;
/** @purpose A selected file or directory could not be observed, so the audit cannot claim clean. */
export const ERR_CLI_SDD_CHECK_READ_FAILED = 'ERR_CLI_SDD_CHECK_READ_FAILED' as const;
/** @purpose Outcome of a check run: the report plus the process exit code. */
export type CheckResult = {
  /** @purpose The ESLint-style report (findings + summary) for stdout. */
  text: string;
  /** @purpose Exit code — 0 clean, 1 errors found, 4 bad invocation. */
  exitCode: number;
};

/** @purpose Wrap one sdd-check command failure in the common flow-tool schema. */
function guidedCheckFailure(
  code: string,
  exitCode: number,
  message: string,
  object: string,
  action: string,
  example: string
): CheckResult {
  return {
    text: normalizeSddToolFailure({ tool: 'sdd-check', code, object, action, example }, message),
    exitCode,
  };
}

/** @purpose Stable machine-facing projection of one finding with repair guidance kept separate. */
type StructuredFinding = {
  severity: Finding['severity'];
  code: string;
  file: string;
  line: number | null;
  section: string;
  reason: string;
  next: string;
  example: string;
};

/** @purpose Infer the owning document section from stable authoring codes/messages. */
function findingSection(finding: Finding): string {
  const explicit = /^\[([A-Z0-9_]+)\]/.exec(finding.message)?.[1];
  const named = /\bSection ([A-Z0-9_]+)/.exec(finding.message)?.[1];
  if (explicit || named) return explicit ?? named ?? 'DOCUMENT';
  if (finding.code.includes('REQUIREMENT') || finding.code.includes('LIST_REQUIRED'))
    return 'REQUIREMENTS_AND_CONSTRAINTS';
  if (finding.code.includes('PLACEHOLDER')) return 'DOCUMENT';
  if (finding.code.includes('AUTO_FIXED')) return 'DOCUMENT_FORMAT';
  return 'DOCUMENT';
}

/** @purpose Supply one copy-ready example for common authoring findings without changing semantics. */
function findingExample(finding: Finding, section: string): string {
  const embedded = /\bExample:\s*([^\n]+)/.exec(finding.message)?.[1];
  if (embedded) return embedded;
  if (finding.code === 'SDD_REQUIREMENT_ID_MISSING') return '### FIB-REQ-1 [должен]';
  if (finding.code === 'SDD_AUTHORING_LIST_REQUIRED') return '- Explicit excluded behavior';
  if (finding.code === 'SDD_AUTHORING_PLACEHOLDER')
    return 'Replace <!-- skeleton guidance --> with authored content and remove the comment.';
  if (finding.code === 'SDD_AUTHORING_HEADING_LEVEL')
    return `Use the heading level already present in the ${section} skeleton section.`;
  if (finding.code === 'SDD_SPEC_SECTION_MISSING')
    return `Keep <!--SECTION:${section}--> and replace its local guidance with authored content.`;
  if (finding.code === 'SDD_AUTHORING_AUTO_FIXED')
    return 'No action required; rerun the same check.';
  return 'Apply the reported repair at the named file and section.';
}

/** @purpose Convert one prose finding into the stable JSON findings schema. */
function structureFinding(finding: Finding): StructuredFinding {
  const section = findingSection(finding);
  return {
    severity: finding.severity,
    code: finding.code,
    file: finding.file,
    line: finding.line ?? null,
    section,
    reason: finding.message,
    next: `Repair ${section} in ${finding.file}, then rerun the same sdd-check command.`,
    example: findingExample(finding, section),
  };
}

/**
 * @purpose Format findings ESLint-style and derive the exit code.
 * @invariant Exit 1 iff at least one error-severity finding is present; warnings alone exit 0.
 * @param findings All findings collected across checked files.
 * @param fileCount Number of files checked (for the summary line).
 * @param [options] Optional output bound and mode-specific repair instruction.
 * @returns The report text and exit code.
 */
export function formatFindings(
  findings: Finding[],
  fileCount: number,
  options: {
    maxFindings?: number;
    repairHint?: string;
    format?: 'text' | 'json';
    authoring?: boolean;
  } = {}
): CheckResult {
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warns = findings.length - errors;
  if (options.format === 'json') {
    return {
      text: JSON.stringify(
        {
          schema: 'gennady.sdd-check.findings.v1',
          ok: errors === 0,
          fileCount,
          summary: { errors, warnings: warns },
          ...(options.authoring
            ? {
                authoring: {
                  writeMode: 'whole-document',
                  completion: findings.length === 0 ? 'ready' : 'blocked',
                  requirement: 'sdd-log authoring-complete requires zero remaining findings',
                  next:
                    findings.length === 0
                      ? 'run sdd-log authoring-complete for this exact spec path'
                      : 'repair the named sections, rewrite the whole document once, then rerun this JSON check',
                },
              }
            : {}),
          findings: findings.map(structureFinding),
        },
        null,
        2
      ),
      exitCode: errors > 0 ? 1 : 0,
    };
  }
  if (findings.length === 0) {
    return {
      text: [
        `[sdd-check] ✅ clean — ${fileCount} file(s) checked`,
        ...(options.authoring
          ? ['authoring-boundary: ready — run sdd-log authoring-complete for this exact spec path']
          : []),
      ].join('\n'),
      exitCode: 0,
    };
  }
  const visible = findings.slice(0, options.maxFindings ?? findings.length);
  const lines = visible.map(
    (f) =>
      `${f.file}${f.line !== undefined ? `:${f.line}` : ''}: ${f.severity}: ${f.code}  ${f.message}`
  );
  const summary = `[sdd-check] ${errors} error(s), ${warns} warning(s) across ${fileCount} file(s)`;
  const omitted = findings.length - visible.length;

  // next: structural findings stay with the current artifact owner. Reconcile is reserved for
  // drift in already-approved artifacts, not ordinary authoring/phase repair.
  const hasLanguage = findings.some((f) => f.code === 'SDD_LANGUAGE_CALQUE');
  const hasStructural = findings.some((f) => f.code !== 'SDD_LANGUAGE_CALQUE');
  const next: string[] = options.repairHint ? [`next: ${options.repairHint}`] : [];
  if (!options.repairHint && hasStructural)
    next.push(
      'next: исправь перечисленные файлы в текущем владеющем шаге и повтори ту же команду; `/sdd-reconcile` нужен только для drift уже утверждённых артефактов.'
    );
  if (!options.repairHint && hasLanguage)
    next.push(
      'next: язык — калька за калькой, по месту (`file:line`) правь всё предложение целиком.'
    );

  return {
    text: [
      ...lines,
      ...(omitted > 0
        ? [`… ${omitted} more finding(s) omitted; fix the shown rows, then rerun the same command.`]
        : []),
      '',
      summary,
      ...next,
    ].join('\n'),
    exitCode: errors > 0 ? 1 : 0,
  };
}

/**
 * @purpose Build the bad-invocation result.
 * @param [detail] Parser or mode-grammar failure; defaults to a generic invalid-arguments detail.
 * @returns Result with exit 4.
 */
export function badInvocation(detail = 'invalid arguments'): CheckResult {
  return guidedCheckFailure(
    ERR_CLI_SDD_CHECK_BAD_INVOCATION,
    4,
    [
      `[sdd-check] ${ERR_CLI_SDD_CHECK_BAD_INVOCATION}`,
      `  problem: ${detail}`,
      '  usage: gennady sdd-check (--task <ticket> [--authoring [--phase P<N>]] | --spec <path> --authoring | --all [project-root] | --changed [project-root])',
    ].join('\n'),
    'sdd-check invocation',
    'select one check mode and supply its exact path argument',
    'npx gennady sdd-check --spec specs/fibonacci/fibonacci.spec.md --authoring --format json'
  );
}

/**
 * @purpose Build a fail-closed git-evidence result with the original operation/status/stderr.
 * @param operation Human-readable failed git operation.
 * @param exitCode Process exit status, or null on spawn failure.
 * @param stderr Preserved process diagnostic.
 * @returns Exit-1 result that cannot be mistaken for clean.
 */
export function gitEvidenceError(
  operation: string,
  exitCode: number | null,
  stderr: string
): CheckResult {
  return guidedCheckFailure(
    'ERR_CLI_SDD_CHECK_GIT_EVIDENCE',
    1,
    [
      '[sdd-check] ERR_CLI_SDD_CHECK_GIT_EVIDENCE',
      `  problem: git ${operation} failed (exit ${exitCode ?? 'spawn'}): ${stderr || 'no stderr'}`,
      '  repair the repository/HEAD evidence, then rerun the same sdd-check command; an empty clean result was not emitted.',
    ].join('\n'),
    `git ${operation}`,
    'repair repository HEAD/index evidence, then repeat the same check',
    'git status --short; npx gennady sdd-check --changed .'
  );
}

/**
 * @purpose Build the file-error result — tool-teaches: points a path-shaped argument at the map.
 * @param ticket The ticket path or Task-ID that could not be resolved.
 * @returns Result with exit 1.
 */
export function fileError(ticket: string): CheckResult {
  return guidedCheckFailure(
    ERR_CLI_SDD_CHECK_FILE,
    1,
    `[sdd-check] ${ERR_CLI_SDD_CHECK_FILE}: ${ticket}\n  ${unreadableTicketHint(ticket)}`,
    ticket,
    'use the exact existing ticket path returned by sdd-new',
    'npx gennady sdd-check --task specs/demo/core/core.task.DEM-work.md'
  );
}

/** @purpose Build one fail-closed filesystem-observation result with the exact path and retained reason. | @param path Selected or in-scope path that could not be read. | @param reason Original filesystem diagnostic. | @returns Exit-1 result that cannot be mistaken for clean. */
export function readFailed(path: string, reason: string): CheckResult {
  return guidedCheckFailure(
    ERR_CLI_SDD_CHECK_READ_FAILED,
    1,
    `[sdd-check] ${ERR_CLI_SDD_CHECK_READ_FAILED}: ${path}\n  ${reason}`,
    path,
    'restore readable regular repository evidence, then repeat the same check',
    `npx gennady sdd-check --all ${path}`
  );
}

/**
 * @purpose Build the unknown-Task-ID result — the --task argument has Task-ID shape but scanning the
 * tree found no ticket carrying that Meta Task-ID.
 * @param id The requested Task-ID.
 * @param refs Every ticket's graph ref found while scanning (for the "known Task-IDs" hint).
 * @returns Result with exit 2.
 */
export function unknownIdError(id: string, refs: TicketRef[]): CheckResult {
  const known = refs.map((r) => r.taskId).filter((t): t is string => t != null);
  return guidedCheckFailure(
    ERR_CLI_SDD_CHECK_UNKNOWN_ID,
    2,
    [
      `[sdd-check] ${ERR_CLI_SDD_CHECK_UNKNOWN_ID}: ${id}`,
      known.length
        ? `  known Task-IDs: ${known.join(', ')}`
        : '  очередь пуста — тикетов с Task-ID в дереве не найдено.',
    ].join('\n'),
    id,
    'select an exact known Task-ID or its existing ticket path',
    known.length ? `npx gennady sdd-check --task ${known[0]}` : 'npx gennady sdd-check --all .'
  );
}

/**
 * @purpose Build the ambiguous-Task-ID result — two or more tickets share one Meta Task-ID.
 * @param id The requested Task-ID.
 * @param matches Every ticket ref whose Task-ID equals `id`.
 * @param root Absolute project root (candidate paths are printed relative to it).
 * @returns Result with exit 2.
 */
export function ambiguousIdError(id: string, matches: TicketRef[], root: string): CheckResult {
  return guidedCheckFailure(
    ERR_CLI_SDD_CHECK_AMBIGUOUS_ID,
    2,
    [
      `[sdd-check] ${ERR_CLI_SDD_CHECK_AMBIGUOUS_ID}: ${id} matches ${matches.length} tickets`,
      ...matches.map((m) => `  - ${relative(root, resolve(m.file))}`),
    ].join('\n'),
    id,
    'resolve the duplicate Task-ID, then select one exact ticket path',
    `npx gennady sdd-check --task ${relative(root, resolve(matches[0]?.file ?? 'ticket.md'))}`
  );
}
