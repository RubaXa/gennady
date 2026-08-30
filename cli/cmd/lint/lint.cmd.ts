// @file: LintCommand — CLI entry point for gennady lint: parseArgs (strict), git scan, single read, checks incl. optional --spec/--inventory-reverse inventory sync, ESLint output.
// @consumers: gennady.ts
// @tasks: TSK-16, TSK-49, TSK-60

import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { logger, setLogLevel } from '#logger';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { isTestFile, isUnderTestDirectory } from '../../../shared/common/files.ts';
import { inspectRepoPath } from '../../../shared/common/repo-path.ts';
import { check as checkFileHeader } from './checks/file-header.check.ts';
import { check as checkAnchors } from './checks/anchor.check.ts';
import { check as checkDbcContracts } from './checks/dbc-contract.check.ts';
import { check as checkDisables } from './checks/disables.check.ts';
import { check as checkLanguage } from './checks/language.check.ts';
import { check as checkInvariantCount } from './checks/invariant-count.check.ts';
import { check as checkAnchorClassBody } from './checks/anchor-class-body.check.ts';
import { check as checkAnchorThin } from './checks/anchor-thin.check.ts';
import {
  check as checkWordCount,
  DEFAULT_CONTRACT_WORDS,
  DEFAULT_HEADER_WORDS,
} from './checks/word-count.check.ts';
import { check as checkRegionComment } from './checks/region-comment.check.ts';
import {
  check as checkInventorySync,
  collectExports,
  reverseUnimplemented,
  parseDeferredEntities,
  checkDeferral,
  type DeferralCheck,
  type ReverseSweepResult,
} from './checks/inventory-sync.check.ts';
import { collectTicketCorpus } from '../../../shared/sdd/ticket-resolve.ts';
import { ticketOwnsEntity } from '../../../shared/sdd/audit-group.ts';
import { parseEntityInventory } from '../../../shared/sdd/inventory.ts';
import { LintReport } from './lint.types.ts';
import {
  ERR_CLI_LINT_STAGED_CONFLICT,
  ERR_CLI_LINT_RESOLVE_FAILED,
  ERR_CLI_LINT_READ_FAILED,
  ERR_CLI_LINT_UNSUPPORTED_TARGET,
  ERR_CLI_LINT_TAG_TOO_MANY_WORDS,
  ERR_CLI_LINT_BAD_WORD_LIMIT,
  ERR_CLI_LINT_BAD_INVOCATION,
  ERR_CLI_LINT_REGION_TOO_MANY_COMMENTS,
  ERR_CLI_LINT_REGION_START_ANNOTATION_TOO_LONG,
  ERR_CLI_LINT_UNKNOWN_FLAG,
  ERR_CLI_LINT_SPEC_NOT_FOUND,
  ERR_CLI_LINT_INVENTORY_REVERSE_NEEDS_SPEC,
} from './lint.types.ts';
import type { LintError } from './lint.types.ts';
import {
  loadTaskReferences,
  extractTaskIdsFromHeader,
  resolveReferencesForTasks,
} from './utils/resolve-references.fn.ts';
import { globToRegex } from './checks/utils/glob-match.ts';
import { isGennadyLintTarget } from './lint-source-policy.ts';

const LINT_USAGE =
  'usage: gennady lint [paths...] [--staged] [--autofix] [--include-all] [--include-tests] [--verbose] [--max-invariants=N] [--exclude=GLOB] [--max-words=N] [--max-header-words=N] [--max-contract-words=N] [--max-region-comments=N] [--spec=PATH] [--inventory-reverse=DIR]';

/** @purpose Reject malformed argv before target resolution or lint execution. */
function badInvocation(message: string, code: string = ERR_CLI_LINT_BAD_INVOCATION): LintReport {
  return new LintReport(
    [{ file: '', line: 0, col: 0, severity: 'error', code, message: `${message}\n${LINT_USAGE}` }],
    0,
    [],
    [],
    undefined,
    4
  );
}

/** @purpose Parse one canonical decimal integer while rejecting signs, fractions, and overflow. */
function parseIntegerOption(value: unknown, minimum: number): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : null;
}

/**
 * @purpose Derive a spec's owning scope from its path — the segment right after `specs/`.
 * @param specPath Spec file path (relative or absolute).
 * @returns The scope name, or '' when the path has no `specs/<scope>` segment.
 */
function specScopeFromPath(specPath: string): string {
  const parts = specPath.split('/');
  const i = parts.lastIndexOf('specs');
  return i >= 0 && i + 1 < parts.length ? (parts[i + 1] ?? '') : '';
}

/**
 * @purpose Execute the gennady lint command — collect files, run configured checks, output ESLint-format report.
 * @implements {LintCommand} in specs/cli/lint/lint.spec.md
 * @param rawArgs Raw command-line arguments (process.argv).
 * @returns LintReport with aggregated errors and exit code.
 */
export async function run(rawArgs: string[]): Promise<LintReport> {
  let args: Record<string, unknown> & { _: string[] };
  try {
    args = parseArgs(
      rawArgs,
      {
        autofix: ['autofix'],
        staged: ['staged'],
        includeAll: ['include-all'],
        includeTests: ['include-tests'],
        verbose: ['verbose', 'v'],
        maxInvariants: { aliases: ['max-invariants'], takesValue: true },
        exclude: { aliases: ['exclude'], takesValue: true },
        maxWords: { aliases: ['max-words'], takesValue: true },
        maxHeaderWords: { aliases: ['max-header-words'], takesValue: true },
        maxContractWords: { aliases: ['max-contract-words'], takesValue: true },
        maxRegionComments: { aliases: ['max-region-comments'], takesValue: true },
        spec: { aliases: ['spec'], takesValue: true },
        inventoryReverse: { aliases: ['inventory-reverse'], takesValue: true },
      },
      { strict: true }
    );
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    logger.warn(`[LintCommand#run] [idle → failed] ${message}`);
    return badInvocation(message, ERR_CLI_LINT_UNKNOWN_FLAG);
  }

  const booleanOptions: Array<[string, unknown]> = [
    ['--autofix', args.autofix],
    ['--staged', args.staged],
    ['--include-all', args.includeAll],
    ['--include-tests', args.includeTests],
    ['--verbose/-v', args.verbose],
  ];
  const malformedBoolean = booleanOptions.find(
    ([, value]) => value !== undefined && value !== true
  );
  if (malformedBoolean) {
    return badInvocation(`${malformedBoolean[0]} is a boolean flag specified at most once`);
  }

  const scalarOptions: Array<[string, unknown]> = [
    ['--max-invariants', args.maxInvariants],
    ['--max-words', args.maxWords],
    ['--max-header-words', args.maxHeaderWords],
    ['--max-contract-words', args.maxContractWords],
    ['--max-region-comments', args.maxRegionComments],
    ['--spec', args.spec],
    ['--inventory-reverse', args.inventoryReverse],
  ];
  const malformedScalar = scalarOptions.find(
    ([, value]) => value !== undefined && (typeof value !== 'string' || value.length === 0)
  );
  if (malformedScalar) {
    return badInvocation(`${malformedScalar[0]} requires exactly one non-empty value`);
  }

  const rawExclude = args.exclude;
  const excludeValues = Array.isArray(rawExclude) ? rawExclude : [rawExclude];
  if (
    rawExclude !== undefined &&
    excludeValues.some((value) => typeof value !== 'string' || value.length === 0)
  ) {
    return badInvocation('--exclude requires a non-empty value for every occurrence');
  }

  const positional = (args._ as string[]).filter(
    (f: string) => typeof f === 'string' && f !== 'lint'
  );

  const autofix = args.autofix === true;
  const staged = args.staged === true;
  const includeAll = args.includeAll === true;
  const includeTests = args.includeTests === true;
  const verbose = args.verbose === true;
  const maxInvariants =
    args.maxInvariants === undefined ? 3 : parseIntegerOption(args.maxInvariants, 1);
  if (maxInvariants === null) {
    return badInvocation(
      `--max-invariants requires a safe integer >= 1; received ${String(args.maxInvariants)}`
    );
  }
  const globalWordLimit = args.maxWords === undefined ? null : parseIntegerOption(args.maxWords, 1);
  const headerWordLimit =
    args.maxHeaderWords === undefined ? null : parseIntegerOption(args.maxHeaderWords, 1);
  const contractWordLimit =
    args.maxContractWords === undefined ? null : parseIntegerOption(args.maxContractWords, 1);
  const invalidWordFlag = [
    ['--max-words', args.maxWords, globalWordLimit],
    ['--max-header-words', args.maxHeaderWords, headerWordLimit],
    ['--max-contract-words', args.maxContractWords, contractWordLimit],
  ].find(([, raw, parsed]) => raw !== undefined && parsed === null);
  if (invalidWordFlag) {
    return badInvocation(
      `${invalidWordFlag[0]} requires a safe integer >= 1; received ${String(invalidWordFlag[1])}.`,
      ERR_CLI_LINT_BAD_WORD_LIMIT
    );
  }
  const wordLimits = {
    header: headerWordLimit ?? globalWordLimit ?? DEFAULT_HEADER_WORDS,
    contract: contractWordLimit ?? globalWordLimit ?? DEFAULT_CONTRACT_WORDS,
  };
  const maxRegionComments =
    args.maxRegionComments === undefined ? 3 : parseIntegerOption(args.maxRegionComments, 0);
  if (maxRegionComments === null) {
    return badInvocation(
      `--max-region-comments requires a safe integer >= 0; received ${String(args.maxRegionComments)}`
    );
  }
  const specPath = typeof args.spec === 'string' ? args.spec : null;
  const inventoryReverseDir =
    typeof args.inventoryReverse === 'string' ? args.inventoryReverse : null;

  if (staged && positional.length > 0) {
    logger.warn('[LintCommand#run] --staged and positional targets are mutually exclusive');
    return badInvocation(
      '--staged and positional targets are mutually exclusive. Use either --staged or provide file/directory paths, not both.',
      ERR_CLI_LINT_STAGED_CONFLICT
    );
  }

  if (inventoryReverseDir && !specPath) {
    logger.warn('[LintCommand#run] --inventory-reverse given without --spec');
    return badInvocation(
      '--inventory-reverse requires --spec=<module-spec> — the reverse sweep checks that spec’s Entity Inventory against the code.',
      ERR_CLI_LINT_INVENTORY_REVERSE_NEEDS_SPEC
    );
  }

  // #region START_INVENTORY_SPEC — invariant: --spec loads the declared inventory once; unreadable spec → error, checks skipped
  let declaredInventory: string[] | null = null;
  let specRawContent: string | null = null;
  const specLoadErrors: LintError[] = [];
  if (specPath) {
    try {
      specRawContent = readFileSync(resolve(specPath), 'utf-8');
      declaredInventory = parseEntityInventory(specRawContent);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      specLoadErrors.push({
        file: specPath,
        line: 0,
        col: 0,
        severity: 'error',
        code: ERR_CLI_LINT_SPEC_NOT_FOUND,
        message: `Cannot read --spec target: ${message}`,
      });
      logger.warn(`[LintCommand#run] --spec unreadable: ${specPath}`);
    }
  }
  // Vacuous truth: no Entity Inventory section (or an empty table) means there is nothing
  // declared to reconcile against — checking every export against an empty set would flag
  // all of them as undeclared, which is not the intent. Skip both directions and say so once.
  const inventoryVacuous = declaredInventory !== null && declaredInventory.length === 0;
  if (inventoryVacuous) {
    console.log(
      `ℹ️  [LintCommand#run] ${specPath} has no Entity Inventory section — nothing to verify`
    );
  }
  // #endregion END_INVENTORY_SPEC

  // --inventory-reverse with no explicit targets sweeps the module dir itself
  if (inventoryReverseDir && positional.length === 0 && !staged) {
    positional.push(inventoryReverseDir);
  }

  // Build-system dirs — no source of ours, always excluded (even under --include-all).
  const SYSTEM_EXCLUDES = [
    '**/node_modules/**',
    '**/dist/**',
    '**/coverage/**',
    '**/build/**',
    '**/out/**',
  ];
  // Configs, fixtures, mocks, and test dirs carry no DbC contracts by design — a config or a
  // fixture is data, not a contracted entity, so the linter must never demand @purpose of them.
  // Excluded by default; `--include-all` opts them back in for the rare deliberate audit.
  // `*.fixture.*` and the `fixtures`/`__fixtures__` dirs — NOT a bare `*fixture*`, which would also
  // eat a legitimate production file like `fixture-service.ts`.
  const TEST_EXCLUDES = ['**/__tests__/**'];
  const NON_CONTRACT_EXCLUDES = [
    '**/fixtures/**',
    '**/__fixtures__/**',
    '**/*.fixture.*',
    '**/*.mock.*',
    '**/*.config.*',
  ];
  const DEFAULT_EXCLUDES = includeAll
    ? SYSTEM_EXCLUDES
    : [...SYSTEM_EXCLUDES, ...(includeTests ? [] : TEST_EXCLUDES), ...NON_CONTRACT_EXCLUDES];

  // Collect --exclude values (parseArgs packs multiples into array)
  const userExcludes: string[] = Array.isArray(rawExclude)
    ? rawExclude
    : typeof rawExclude === 'string'
      ? [rawExclude]
      : [];
  const excludePatterns = [...DEFAULT_EXCLUDES, ...userExcludes];
  const excludeRegexes = excludePatterns.map(globToRegex);

  if (verbose) setLogLevel('debug');

  // #region START_COLLECT_FILES — invariant: --staged → git diff + ls-files; otherwise resolveTargets
  let files: string[];
  const resolutionErrors: LintError[] = [];

  if (staged) {
    logger.debug('[LintCommand#run] [idle → collecting] staged mode');
    try {
      const gitPaths = (args: string[]): string[] =>
        execFileSync('git', args, { encoding: 'buffer' })
          .toString('utf8')
          .split('\0')
          .filter(Boolean);
      const stagedPaths = gitPaths([
        'diff',
        '--cached',
        '--name-only',
        '--diff-filter=ACMR',
        '-z',
        '--',
      ]);
      const untrackedPaths = gitPaths(['ls-files', '--others', '--exclude-standard', '-z', '--']);
      files = [...new Set([...stagedPaths, ...untrackedPaths])].filter(
        (file) => isGennadyLintTarget(file) && existsSync(file)
      );
    } catch (cause) {
      const error = new Error('[LintCommand#run] Git scan failed — not a git repository?', {
        cause,
      });
      logger.error('[LintCommand#run] [collecting → failed]', { error });
      throw error;
    }
  } else if (positional.length > 0) {
    logger.debug(`[LintCommand#run] [idle → resolving] ${positional.length} target(s)`);
    const result = resolveTargets(positional, { includeTests: includeAll || includeTests });
    files = result.files;
    resolutionErrors.push(...result.errors);
    for (const re of result.errors) {
      logger.warn(`[LintCommand#run] [resolving → failed] ${re.file}: ${re.message}`);
    }
  } else {
    files = [];
  }
  // #endregion END_COLLECT_FILES

  // #region START_EXCLUDE_FILTER — invariant: apply glob excludes to collected files
  if (files.length > 0 && excludeRegexes.length > 0) {
    const before = files.length;
    const cwd = resolve('.');
    files = files.filter((f) => {
      const rel = f.startsWith('/') ? relative(cwd, f) : f;
      return !excludeRegexes.some((re) => re.test(rel));
    });
    logger.debug(`[LintCommand#run] [filtering → filtered] ${before} → ${files.length} file(s)`);
  }
  // #endregion END_EXCLUDE_FILTER

  if (files.length === 0) {
    logger.debug('[LintCommand#run] [collecting → done] no files to lint');
    return new LintReport([...resolutionErrors, ...specLoadErrors]);
  }

  logger.debug(`[LintCommand#run] [collecting → linting] ${files.length} file(s)`);

  const allErrors: LintError[] = [...resolutionErrors, ...specLoadErrors];
  let totalAutoFixed = 0;
  const implementedUnion = new Set<string>();

  // #region START_RESOLVE_REFERENCES — invariant: load taskRefMap once, collect task IDs from headers
  const projectRoot = resolve('.');
  const taskRefMap = loadTaskReferences(projectRoot);
  const foundTaskIds = new Set<string>();
  // #endregion END_RESOLVE_REFERENCES

  // #region START_LINT_LOOP — invariant: autofix is followed by a complete read-only pass over
  // freshly re-read bytes; no pre-fix content reaches the final report or inventory checks
  for (const filePath of files) {
    const absPath = resolve(filePath);

    let content: string;
    try {
      logger.debug(`[LintCommand#run] [linting → reading] ${filePath}`);
      content = readFileSync(absPath, 'utf-8');
    } catch (cause) {
      const error = lintReadError(filePath, cause);
      allErrors.push(error);
      logger.error(`[LintCommand#run] [reading → failed] ${filePath}: ${error.message}`);
      continue;
    }

    if (autofix) {
      const fixResult = await checkDbcContracts(content, filePath, true);
      totalAutoFixed += fixResult.autoFixed;
      try {
        content = readFileSync(absPath, 'utf-8');
      } catch (cause) {
        const error = lintReadError(filePath, cause, 're-read after autofix');
        allErrors.push(error);
        logger.error(
          `[LintCommand#run] [fixing → re-reading-failed] ${filePath}: ${error.message}`
        );
        continue;
      }
    }

    const errorCountBefore = allErrors.length;

    allErrors.push(...checkFileHeader(content, filePath));
    allErrors.push(...checkAnchors(content, filePath));
    allErrors.push(...checkLanguage(content, filePath));
    allErrors.push(...checkDisables(content, filePath));
    allErrors.push(...checkAnchorClassBody(content, filePath));
    allErrors.push(...checkAnchorThin(content, filePath));
    allErrors.push(...checkInvariantCount(content, filePath, maxInvariants));
    allErrors.push(...checkWordCount(content, filePath, wordLimits));
    allErrors.push(...checkRegionComment(content, filePath, maxRegionComments));

    const dbcResult = await checkDbcContracts(content, filePath, false);
    allErrors.push(...dbcResult.errors);

    const inventoryApplicable = !isTestFile(filePath) && !isUnderTestDirectory(filePath);
    if (declaredInventory !== null && !inventoryVacuous && inventoryApplicable) {
      allErrors.push(...(await checkInventorySync(content, filePath, declaredInventory)));
      if (inventoryReverseDir) {
        for (const name of await collectExports(content, filePath)) implementedUnion.add(name);
      }
    }

    if (allErrors.length > errorCountBefore) {
      const taskIds = extractTaskIdsFromHeader(content);
      for (const tid of taskIds) {
        foundTaskIds.add(tid);
      }
    }
  }
  // #endregion END_LINT_LOOP

  // #region START_INVENTORY_REVERSE — invariant: declared-but-unimplemented sweep over the whole scanned dir; vacuous inventory skips the sweep
  if (inventoryReverseDir && declaredInventory !== null && specPath && !inventoryVacuous) {
    // Resolve each `Deferred Implementation` marker against the v2 ticket graph (real, active, same-scope, owning ticket — else drift).
    const rawDeferred = specRawContent
      ? parseDeferredEntities(specRawContent)
      : new Map<string, string>();
    const deferredEntities = new Map<string, DeferralCheck>();
    if (rawDeferred.size > 0) {
      const corpus = collectTicketCorpus(projectRoot);
      if (!corpus.ok) {
        allErrors.push({
          file: specPath,
          line: 1,
          col: 1,
          severity: 'error',
          code: ERR_CLI_LINT_READ_FAILED,
          message: `Cannot validate Deferred Implementation against a complete ticket corpus: ${corpus.detail}. Fix the named path and rerun; no partial deferral graph was accepted.`,
        });
      }
      const tickets = corpus.ok ? corpus.refs : [];
      const specScope = specScopeFromPath(specPath);
      for (const [name, taskId] of rawDeferred) {
        // STRUCTURAL ownership via ticketOwnsEntity (parsed Target Files + Implements/Provides/Entity
        // fields), not a prose scan. Unreadable ticket → false (fail-closed).
        const ref = tickets.find((t) => t.taskId === taskId);
        let ticketOwns = false;
        if (ref?.file) {
          try {
            ticketOwns = ticketOwnsEntity(readFileSync(ref.file, 'utf-8'), name);
          } catch {
            ticketOwns = false;
          }
        }
        deferredEntities.set(name, checkDeferral(taskId, tickets, specScope, name, ticketOwns));
      }
    }
    const reverseResult: ReverseSweepResult = reverseUnimplemented(
      declaredInventory,
      implementedUnion,
      specPath,
      deferredEntities
    );
    allErrors.push(...reverseResult.errors);
    for (const { name, taskId } of reverseResult.deferred) {
      console.log(
        `ℹ️  [LintCommand#run] Inventory entity \`${name}\` — deferred to ${taskId}, not counted as drift`
      );
    }
  }
  // #endregion END_INVENTORY_REVERSE

  // #region START_RESOLVE_REFS_OUTPUT — invariant: resolve references from collected task IDs
  const { taskPaths, specPaths } = resolveReferencesForTasks([...foundTaskIds], taskRefMap);
  const guidance = buildGuidance(allErrors);
  const report = new LintReport(allErrors, totalAutoFixed, taskPaths, specPaths, guidance);
  // #endregion END_RESOLVE_REFS_OUTPUT

  // #region START_OUTPUT — invariant: ESLint format when errors present
  if (report.exitCode === 1) {
    console.log(`❌ [LintCommand#run] [linting → failed] ${allErrors.length} error(s)`);
  } else {
    console.log('✅ [LintCommand#run] [linting → clean] no errors');
  }
  // #endregion END_OUTPUT

  return report;
}

// #region START_RESOLVE_TARGETS — invariant: recursive dir walk, shared lint policy, dedup, sort, exclude system dirs, skip symlinks
const SYSTEM_DIRS = new Set(['node_modules', 'dist', 'coverage', 'build', 'out']);
const TEST_DIRS = new Set(['__tests__']);

/** @purpose Build one typed, teaching error when selected lint evidence cannot be read. */
function lintReadError(path: string, cause: unknown, action = 'read'): LintError {
  const err = cause as NodeJS.ErrnoException;
  const reason = `${err.code ?? 'UNKNOWN'}: ${err.message ?? String(cause)}`;
  return {
    file: path,
    line: 0,
    col: 0,
    severity: 'error',
    code: ERR_CLI_LINT_READ_FAILED,
    message: `Cannot ${action} lint target \`${path}\`: ${reason}. Restore read permission or remove this path from the requested lint scope; the run cannot claim clean without reading it.`,
  };
}

/** @purpose Build a typed rejection for a path whose symlink boundary prevents trustworthy lint evidence. */
function lintUnsafePathError(path: string, detail: string): LintError {
  return {
    file: path,
    line: 0,
    col: 0,
    severity: 'error',
    code: ERR_CLI_LINT_READ_FAILED,
    message: `Cannot select lint target \`${path}\`: ${detail}. Pass a regular non-symlink .ts/.tsx file or directory; a skipped alias cannot produce a clean verdict.`,
  };
}

/** @purpose Apply the shared repo-path symlink policy to an explicit absolute or relative lint target. */
function inspectLintTarget(target: string): { ok: true } | { ok: false; detail: string } {
  const absolute = resolve(target);
  const cwd = resolve('.');
  const fromCwd = relative(cwd, absolute);
  const insideCwd = fromCwd !== '..' && !fromCwd.startsWith(`..${sep}`) && !isAbsolute(fromCwd);
  const root = insideCwd && fromCwd ? cwd : dirname(absolute);
  const raw = insideCwd && fromCwd ? fromCwd : basename(absolute);
  const inspected = inspectRepoPath(root, raw, 'potential');
  return inspected.ok ? { ok: true } : inspected;
}

/**
 * @purpose Resolve user-provided target paths to a flat list of .ts/.tsx files.
 * @param targets Paths or glob patterns from CLI arguments.
 * @param [options] Traversal policy. `includeTests` opens only `__tests__`; system directories stay
 *   excluded and the caller's content filters still exclude fixtures, mocks, and configs.
 * @returns Resolved file list and any resolution errors.
 */
export function resolveTargets(
  targets: string[],
  options: { includeTests?: boolean } = {}
): { files: string[]; errors: LintError[] } {
  logger.debug(`[resolveTargets] [idle → resolving] ${targets.length} target(s)`);
  const fileSet = new Set<string>();
  const errors: LintError[] = [];

  for (const target of targets) {
    let stat;
    try {
      stat = lstatSync(target);
    } catch (cause: unknown) {
      const err = cause as NodeJS.ErrnoException;
      errors.push({
        file: target,
        line: 0,
        col: 0,
        severity: 'error',
        code: ERR_CLI_LINT_RESOLVE_FAILED,
        message: `${target}: ${err.code ?? 'UNKNOWN'}: ${err.message}`,
      });
      continue;
    }

    const inspected = inspectLintTarget(target);
    if (!inspected.ok) {
      errors.push(lintUnsafePathError(target, inspected.detail));
      continue;
    }

    const absTarget = resolve(target);

    if (stat.isDirectory()) {
      walkDir(absTarget, absTarget, fileSet, errors, options);
    } else if (stat.isFile()) {
      if (isGennadyLintTarget(target)) {
        fileSet.add(absTarget);
      } else {
        errors.push({
          file: target,
          line: 0,
          col: 0,
          severity: 'error',
          code: ERR_CLI_LINT_UNSUPPORTED_TARGET,
          message: `Explicit target \`${target}\` is unsupported: gennady lint currently inspects only .ts and .tsx files. Pass a supported file or its containing directory; directory traversal ignores other extensions.`,
        });
      }
    }
  }

  const files = [...fileSet].sort();
  logger.debug(
    `[resolveTargets] [resolving → resolved] ${files.length} file(s), ${errors.length} error(s)`
  );
  return { files, errors };
}

// #region START_WALK_DIR — invariant: recursive, lstat, skip hidden/system dirs, filter by SUPPORTED_EXTENSIONS
function walkDir(
  selectedRoot: string,
  dir: string,
  fileSet: Set<string>,
  errors: LintError[],
  options: { includeTests?: boolean }
): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (cause) {
    errors.push(lintReadError(dir, cause, 'read directory'));
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.name.startsWith('.')) {
      continue;
    }
    if (SYSTEM_DIRS.has(entry.name)) {
      continue;
    }
    // Propagate `includeTests`: nested `__tests__` directories belong to the same selected scope.
    if (!options.includeTests && TEST_DIRS.has(entry.name)) {
      continue;
    }

    if (entry.isSymbolicLink()) {
      // A selected source symlink is an evidence error; directory aliases stay untraversed.
      if (isGennadyLintTarget(entry.name)) {
        const inspected = inspectRepoPath(
          selectedRoot,
          relative(selectedRoot, fullPath),
          'potential'
        );
        errors.push(
          lintUnsafePathError(
            fullPath,
            inspected.ok ? 'selected production source is a symlink' : inspected.detail
          )
        );
      }
      continue;
    }

    if (entry.isDirectory()) {
      walkDir(selectedRoot, fullPath, fileSet, errors, options);
    } else if (entry.isFile()) {
      if (isGennadyLintTarget(entry.name)) {
        fileSet.add(fullPath);
      }
    }
  }
}
// #endregion END_WALK_DIR
// #endregion END_RESOLVE_TARGETS

// #region START_BUILD_GUIDANCE — invariant: emits holistic agent hints based on error code families present
const GUIDANCE_WORD_COUNT =
  'WORD_COUNT errors found — consider reviewing each affected contract as a whole. Tag-by-tag truncation risks breaking cross-tag consistency. Technique: (1) remove filler words, (2) compress overlapping @purpose/@param/@returns, (3) keep entity names and spec refs.';

const GUIDANCE_REGION_COMMENTS =
  'REGION_COMMENT errors found — reduce comment density inside #region blocks. Merge adjacent comment lines, move descriptive text outside the region, or split the region. Verify the region still has ≥2 meaningful code lines after cleanup (see AnchorThinCheck).';

/**
 * @purpose Builds a consolidated guidance hint based on which error code families are present in the report.
 * @param errors Collected lint errors.
 * @returns Guidance string, or undefined when no guidance-relevant errors found.
 */
function buildGuidance(errors: LintError[]): string | undefined {
  const codes = new Set(errors.map((e) => e.code));

  const parts: string[] = [];

  if (
    codes.has(ERR_CLI_LINT_TAG_TOO_MANY_WORDS) ||
    codes.has(ERR_CLI_LINT_REGION_START_ANNOTATION_TOO_LONG)
  ) {
    parts.push(GUIDANCE_WORD_COUNT);
  }

  if (codes.has(ERR_CLI_LINT_REGION_TOO_MANY_COMMENTS)) {
    parts.push(GUIDANCE_REGION_COMMENTS);
  }

  if (parts.length === 0) return undefined;

  return parts.join('\n\n');
}
// #endregion END_BUILD_GUIDANCE

// Self-executing for CLI: gennady lint <args>
const report = await run(process.argv);
if (report.exitCode !== 0 || report.autoFixed > 0) console.log(report.format());
process.exit(report.exitCode);
