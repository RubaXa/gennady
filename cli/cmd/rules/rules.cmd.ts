// @file: Strict read-only facade for RuleRegistry inventory and RuleSnapshot resolution.
// @spec: CLI-RULES-CLI
// @consumers: rules/index.ts

import { parseArgs } from '../../../shared/common/parse-args.ts';
import fs from 'node:fs';
import { listRules } from './rules-list.ts';
import { renderRulesReport } from './rules-report.ts';
import { resolveRules } from './rules-resolve.ts';
import { showRule } from './rules-show.ts';
import type { RulesCommandOutcome, RulesInvocation } from './rules.types.ts';

type RulesFormat = RulesInvocation['format'];

const ERR_CLI_RULES_BAD_INVOCATION = 'ERR_CLI_RULES_BAD_INVOCATION';
const ERR_CLI_RULES_FAILED = 'ERR_CLI_RULES_FAILED';

function usage(detail: string): string {
  return [
    `[rules] ${ERR_CLI_RULES_BAD_INVOCATION}: ${detail}`,
    '  usage: npx gennady rules list [--format text|json]',
    '         npx gennady rules show <rule-id> [--format text|json]',
    '         npx gennady rules resolve --phase <selector> (--files <path-or-glob>... | --changed-from <ref> | --task <ticket>) [--format text|json]',
    '  list is the full inventory; only resolve performs PhaseFacts selection from one explicit scope.',
  ].join('\n');
}

function scalar(
  parsed: Record<string, unknown>,
  key: string,
  required = false
): string | undefined {
  const value = parsed[key];
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || value === '' || value !== value.trim()) {
    throw new Error(`--${key} requires exactly one non-empty value`);
  }
  return value;
}

function parseFormat(parsed: Record<string, unknown>): RulesFormat {
  const format = scalar(parsed, 'format') ?? 'text';
  if (format !== 'text' && format !== 'json') {
    throw new Error('--format must be exactly text or json');
  }
  return format;
}

function parseInvocation(argv: readonly string[]): RulesInvocation {
  const parsed = parseArgs(
    [...argv],
    {
      phase: { aliases: ['phase'], takesValue: true },
      files: { aliases: ['files'], takesValue: true },
      'changed-from': { aliases: ['changed-from'], takesValue: true },
      task: { aliases: ['task'], takesValue: true },
      format: { aliases: ['format'], takesValue: true },
    },
    { strict: true }
  );
  const command = parsed._[1];
  const positional = parsed._.slice(2);
  const format = parseFormat(parsed);
  const selectionFlags = (['phase', 'files', 'changed-from', 'task'] as const).filter(
    (key) => parsed[key] !== undefined
  );

  if (command === 'list') {
    if (positional.length > 0) throw new Error(`list accepts no positional arguments`);
    if (selectionFlags.length > 0) {
      throw new Error(
        `list is inventory-only; ${selectionFlags.map((key) => `--${key}`).join(', ')} belongs to resolve`
      );
    }
    return { command: 'list', format };
  }

  if (command === 'show') {
    if (selectionFlags.length > 0) {
      throw new Error(`show accepts only one rule id and --format`);
    }
    const ruleId = positional[0];
    if (positional.length !== 1 || ruleId === undefined || !/^[a-z][a-z0-9-]*$/.test(ruleId)) {
      throw new Error('show requires exactly one normalized rule-id token ([a-z][a-z0-9-]*)');
    }
    return { command: 'show', ruleId, format };
  }

  if (command !== 'resolve') {
    throw new Error('subcommand must be exactly list, show, or resolve');
  }
  const phase = scalar(parsed, 'phase', true)!;
  const changedFrom = scalar(parsed, 'changed-from');
  const task = scalar(parsed, 'task');
  const rawFiles = parsed.files;
  const files =
    rawFiles === undefined
      ? []
      : (Array.isArray(rawFiles) ? rawFiles : [rawFiles]).map((value) => {
          if (typeof value !== 'string' || value === '' || value !== value.trim()) {
            throw new Error('--files requires one or more non-empty path/glob values');
          }
          return value;
        });
  if (positional.length > 0) {
    if (rawFiles === undefined) {
      throw new Error(`unexpected positional argument(s): ${positional.join(' ')}`);
    }
    files.push(...positional);
  }
  const scopeCount =
    Number(files.length > 0) + Number(changedFrom !== undefined) + Number(task !== undefined);
  if (scopeCount !== 1) {
    throw new Error('resolve requires exactly one scope: --files, --changed-from, or --task');
  }
  if (files.length > 0) {
    return { command: 'resolve', phase, format, scope: { source: 'files', inputs: files } };
  }
  if (changedFrom !== undefined) {
    return {
      command: 'resolve',
      phase,
      format,
      scope: { source: 'changed-from', ref: changedFrom },
    };
  }
  return { command: 'resolve', phase, format, scope: { source: 'task', ticket: task! } };
}

function safeError(root: string, cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  const roots = new Set([root, root.replaceAll('\\', '/')]);
  try {
    const canonical = fs.realpathSync(root);
    roots.add(canonical);
    roots.add(canonical.replaceAll('\\', '/'));
  } catch {
    // The original root still gives deterministic redaction for an invalid invocation directory.
  }
  return [...roots]
    .filter((candidate) => candidate !== '')
    .sort((left, right) => right.length - left.length)
    .reduce((safe, candidate) => safe.replaceAll(candidate, '<repo>'), message);
}

/**
 * @purpose Execute one read-only registry projection and return process-ready output.
 * @param root Exact repository root used only for inert reads and local VCS scope evidence.
 * @param argv Complete process argv containing the rules subcommand and strict options.
 * @returns Exit classification and exactly one stdout report or stderr diagnostic.
 */
export function runRulesCommand(root: string, argv: readonly string[]): RulesCommandOutcome {
  let invocation: RulesInvocation;
  try {
    invocation = parseInvocation(argv);
  } catch (cause) {
    return {
      exitCode: 4,
      stdout: '',
      stderr: `${usage(cause instanceof Error ? cause.message : String(cause))}\n`,
    };
  }
  try {
    const report =
      invocation.command === 'list'
        ? listRules(root)
        : invocation.command === 'show'
          ? showRule(root, invocation.ruleId)
          : resolveRules(root, invocation);
    return { exitCode: 0, stdout: renderRulesReport(report, invocation.format), stderr: '' };
  } catch (cause) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: `[rules] ${ERR_CLI_RULES_FAILED}: ${safeError(root, cause)}\n`,
    };
  }
}
