// @file: YagniCommand — CLI entry for gennady yagni: diff symbols with < 2 usages, gated by Usage Waiver. Composition root for the SymbolIndex port.
// @consumers: gennady.ts
// @tasks: N/A

import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { logger } from '#logger';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { getHeadContent } from '../../../shared/common/changed-files.ts';
import {
  isYagniSourceFile,
  isYagniTestTerritory,
} from '../../../shared/common/yagni-source-policy.ts';
import { checkYagniUsage, type ChangedSymbol } from '../../../shared/sdd/yagni.ts';
import { selectSymbolIndex } from '../../../services/symbol-index/select-symbol-index.ts';
import { TsSymbolIndexAdapter } from '../../../services/symbol-index/implementations/tree-sitter/ts-symbol-index-adapter.ts';
import { GrepSymbolIndexAdapter } from '../../../services/symbol-index/implementations/grep/grep-symbol-index-adapter.ts';
import type { SymbolIndex } from '../../../services/symbol-index/symbol-index.types.ts';
import {
  badInvocation,
  badRoot,
  corpusUnreadable,
  formatYagniReport,
  gitScopeUnavailable,
  type YagniReport,
} from './yagni.types.ts';
import { indexSpecEvidence, indexUsageCounts } from './yagni-index.ts';

/** @purpose The two composition-root-built adapters `selectSymbolIndex` picks between. */
type Adapters = { exact: SymbolIndex; approximate: SymbolIndex };

type ChangedFileDiscovery =
  | { ok: true; files: string[]; comparisonBase: 'HEAD' | 'empty-tree' }
  | { ok: false; problem: string };

type ChangedSymbolsRead = { ok: true; symbols: ChangedSymbol[] } | { ok: false; problem: string };

/** @purpose Run one argv-safe git query and retain its status/stderr instead of collapsing failure to empty output. */
function runGit(
  root: string,
  gitArgs: string[]
): { ok: true; stdout: string } | { ok: false; problem: string } {
  const result = spawnSync('git', ['-C', root, ...gitArgs], { encoding: 'utf-8' });
  if (result.error) return { ok: false, problem: result.error.message };
  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    return {
      ok: false,
      problem: `git ${gitArgs.join(' ')} exited ${String(result.status)}${stderr ? `: ${stderr}` : ''}`,
    };
  }
  return { ok: true, stdout: result.stdout };
}

/** @purpose Determine the exact YAGNI diff scope, including an unborn repository's empty-tree baseline. */
function discoverChangedSourceFiles(root: string): ChangedFileDiscovery {
  const topLevel = runGit(root, ['rev-parse', '--show-toplevel']);
  if (!topLevel.ok) {
    return {
      ok: false,
      problem: `cannot inspect the root as a Git worktree (${topLevel.problem})`,
    };
  }
  let canonicalTopLevel: string;
  try {
    canonicalTopLevel = realpathSync(topLevel.stdout.trim());
  } catch {
    return { ok: false, problem: 'git reported an unreadable worktree root' };
  }
  if (canonicalTopLevel !== realpathSync(root)) {
    return {
      ok: false,
      problem: `root is not the Git worktree top-level; pass ${canonicalTopLevel}`,
    };
  }

  const head = runGit(root, ['rev-parse', '--verify', 'HEAD']);
  let comparisonBase: 'HEAD' | 'empty-tree';
  let trackedOrChanged: ReturnType<typeof runGit>;
  if (head.ok) {
    comparisonBase = 'HEAD';
    trackedOrChanged = runGit(root, ['diff', '--name-only', '--no-renames', '-z', 'HEAD', '--']);
  } else {
    const commitCount = runGit(root, ['rev-list', '--all', '--count']);
    if (!commitCount.ok || commitCount.stdout.trim() !== '0') {
      return {
        ok: false,
        problem: `cannot determine comparison base: HEAD is unavailable and the repository is not provably empty (${head.problem})`,
      };
    }
    comparisonBase = 'empty-tree';
    trackedOrChanged = runGit(root, [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '-z',
      '--',
    ]);
  }
  if (!trackedOrChanged.ok) {
    return {
      ok: false,
      problem: `cannot discover files changed against ${comparisonBase} (${trackedOrChanged.problem})`,
    };
  }

  const paths = trackedOrChanged.stdout.split('\0').filter(Boolean);
  if (comparisonBase === 'HEAD') {
    const untracked = runGit(root, ['ls-files', '--others', '--exclude-standard', '-z', '--']);
    if (!untracked.ok) {
      return {
        ok: false,
        problem: `cannot discover untracked files (${untracked.problem})`,
      };
    }
    paths.push(...untracked.stdout.split('\0').filter(Boolean));
  }

  return {
    ok: true,
    comparisonBase,
    files: [...new Set(paths)].filter(
      (path) => isYagniSourceFile(path) && !isYagniTestTerritory(path)
    ),
  };
}

/**
 * @purpose Declared symbols in a changed file, minus names already at its HEAD version — the
 *   diff-scoped "added or changed" set (name-diff, per D-YG001).
 * @param root Repository root.
 * @param relPath Repo-root-relative changed file path.
 * @param adapters Composition-root adapters.
 * @returns Changed symbols declared in `relPath`.
 */
async function changedSymbolsForFile(
  root: string,
  relPath: string,
  adapters: Adapters
): Promise<ChangedSymbolsRead> {
  const abs = join(root, relPath);
  let status;
  try {
    status = lstatSync(abs);
  } catch (cause) {
    const error = cause as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') return { ok: true, symbols: [] };
    return { ok: false, problem: `cannot inspect changed file ${relPath}: ${error.message}` };
  }
  if (status.isSymbolicLink()) {
    return { ok: false, problem: `changed file ${relPath} is a symbolic link` };
  }
  if (!status.isFile()) {
    return { ok: false, problem: `changed path ${relPath} is not a regular file` };
  }
  const canonicalRoot = realpathSync(root);
  let canonicalFile: string;
  try {
    canonicalFile = realpathSync(abs);
  } catch (cause) {
    return {
      ok: false,
      problem: `cannot resolve changed file ${relPath}: ${cause instanceof Error ? cause.message : String(cause)}`,
    };
  }
  const fromRoot = relative(canonicalRoot, canonicalFile);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`)) {
    return { ok: false, problem: `changed file ${relPath} resolves outside the Git worktree` };
  }
  let content: string;
  try {
    content = readFileSync(canonicalFile, 'utf-8');
  } catch (cause) {
    return {
      ok: false,
      problem: `cannot read changed file ${relPath}: ${cause instanceof Error ? cause.message : String(cause)}`,
    };
  }
  const adapter = selectSymbolIndex(relPath, adapters);
  const current = await adapter.declaredSymbols(relPath, content);
  const headContent = getHeadContent(root, relPath);
  const headNames = headContent
    ? new Set((await adapter.declaredSymbols(relPath, headContent)).map((s) => s.name))
    : new Set<string>();
  return {
    ok: true,
    symbols: current
      .filter((s) => !headNames.has(s.name))
      .map((s) => ({
        name: s.name,
        kind: s.kind,
        file: relPath,
        visibility: s.visibility,
      })),
  };
}

/**
 * @purpose Execute gennady yagni — count changed symbols' production-code usage, report ungated
 *   underused ones.
 * @param rawArgs Raw command-line arguments (process.argv).
 * @returns YagniReport — the ESLint-style report and exit code.
 */
export async function run(rawArgs: string[]): Promise<YagniReport> {
  let args: Record<string, unknown> & { _: string[] };
  try {
    args = parseArgs(rawArgs, { help: ['help', 'h'] }, { strict: true });
  } catch (cause) {
    return badInvocation(cause instanceof Error ? cause.message : String(cause));
  }
  if (args.help !== undefined && args.help !== true) {
    return badInvocation('--help/-h does not take a value or repeat');
  }
  const parsedPositionals = args._ as string[];
  const positional =
    parsedPositionals[0] === 'yagni' ? parsedPositionals.slice(1) : parsedPositionals;
  if (positional.length > 1) {
    return badInvocation(`unexpected positional argument(s): ${positional.slice(1).join(' ')}`);
  }
  const root = resolve(positional[0] ?? '.');
  try {
    if (!statSync(root).isDirectory()) return badRoot(root, 'root is not a directory');
  } catch {
    return badRoot(root, 'root does not exist or is unreadable');
  }
  const specsRoot = join(root, 'specs');

  const discovery = discoverChangedSourceFiles(root);
  if (!discovery.ok) return gitScopeUnavailable(root, discovery.problem);

  const adapters: Adapters = {
    exact: new TsSymbolIndexAdapter(),
    approximate: new GrepSymbolIndexAdapter(),
  };

  // A symbol DECLARED in test territory (a `*.test.ts`, or a helper/fixture under `__tests__/`)
  // can never satisfy the rule: its only legitimate consumers are tests, and test files are
  // excluded from the usage count by design. Skipping the declaration side too is what keeps the
  // rule about speculative PRODUCTION surface — observed live: this repo's own fixture helpers.
  const changedFiles = discovery.files;
  const allChanged: ChangedSymbol[] = [];
  for (const rel of changedFiles) {
    const changed = await changedSymbolsForFile(root, rel, adapters);
    if (!changed.ok) return gitScopeUnavailable(root, changed.problem);
    allChanged.push(...changed.symbols);
  }

  const changedNames = new Set(allChanged.map((symbol) => symbol.name));
  const usageIndex = await indexUsageCounts(root, changedNames, adapters);
  if (usageIndex.ioIssues.length > 0) return corpusUnreadable(usageIndex.ioIssues);
  const usageCounts = usageIndex.counts;
  const lowUseNames = new Set(
    allChanged
      .filter((symbol) => (usageCounts.get(symbol.name) ?? 0) < 2)
      .map((symbol) => symbol.name)
  );
  const evidence = indexSpecEvidence(specsRoot, lowUseNames);
  if (evidence.ioIssues.length > 0) return corpusUnreadable(evidence.ioIssues);
  const findings = checkYagniUsage(
    allChanged,
    usageCounts,
    evidence.waivers,
    evidence.liveDecisions
  );
  logger.debug(
    `[YagniCommand#run] ${findings.length} finding(s) across ${changedFiles.length} file(s)`
  );
  return formatYagniReport(findings, changedFiles.length);
}
