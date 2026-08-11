// @file: YagniCommand — CLI entry for gennady yagni: diff symbols with < 2 usages, gated by Usage Waiver. Composition root for the SymbolIndex port.
// @consumers: gennady.ts
// @tasks: N/A

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { logger } from '#logger';
import { execSyncSafe } from '../../../shared/common/exec.ts';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { getChangedSourceFiles, getHeadContent } from '../../../shared/common/changed-files.ts';
import { isTestFile } from '../../../shared/common/files.ts';
import {
  checkYagniUsage,
  stripBarrelReexports,
  parseUsageWaiver,
  hasDecisionHeading,
  type ChangedSymbol,
  type UsageWaiver,
} from '../../../shared/sdd/yagni.ts';
import { selectSymbolIndex } from '../../../services/symbol-index/select-symbol-index.ts';
import { TsSymbolIndexAdapter } from '../../../services/symbol-index/implementations/tree-sitter/ts-symbol-index-adapter.ts';
import { GrepSymbolIndexAdapter } from '../../../services/symbol-index/implementations/grep/grep-symbol-index-adapter.ts';
import type { SymbolIndex } from '../../../services/symbol-index/symbol-index.types.ts';
import { formatYagniReport, type YagniReport } from './yagni.types.ts';

/** @purpose The two composition-root-built adapters `selectSymbolIndex` picks between. */
type Adapters = { exact: SymbolIndex; approximate: SymbolIndex };

/**
 * @purpose Single-quote a string for safe use as one `/bin/sh` argument.
 * @invariant `JSON.stringify` is NOT safe for shell: backticks and `$` inside a double-quoted
 *   argument still trigger command substitution — single-quoting is the only safe escape.
 * @param s Raw string.
 * @returns The shell-quoted argument, including its surrounding quotes.
 */
function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
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
): Promise<ChangedSymbol[]> {
  const abs = join(root, relPath);
  let content: string;
  try {
    content = readFileSync(abs, 'utf-8');
  } catch {
    return [];
  }
  const adapter = selectSymbolIndex(relPath, adapters);
  const current = await adapter.declaredSymbols(relPath, content);
  const headContent = getHeadContent(root, relPath);
  const headNames = headContent
    ? new Set((await adapter.declaredSymbols(relPath, headContent)).map((s) => s.name))
    : new Set<string>();
  return current
    .filter((s) => !headNames.has(s.name))
    .map((s) => ({ name: s.name, kind: s.kind, file: relPath }));
}

/**
 * @purpose Repo-wide candidate files that literally contain `name` — a cheap pre-filter before
 *   per-file adapter counting (mirrors sdd-check's isConsumerResolved grep pattern).
 * @param repoRoot Repository root to search.
 * @param name Identifier to search for.
 * @returns Absolute candidate file paths.
 */
function findCandidateFiles(repoRoot: string, name: string): string[] {
  const out = execSyncSafe(
    `grep -rlF --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --include='*.py' --include='*.go' --include='*.rb' --include='*.java' --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude-dir=coverage -- ${shQuote(name)} ${shQuote(repoRoot)} 2>/dev/null`,
    { expectedExitCodes: [1] }
  );
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * @purpose Production-code usage count for `name` across the repo — tests excluded, barrel lines
 *   stripped, own declaration occurrence subtracted once.
 * @param repoRoot Repository root.
 * @param name Symbol name.
 * @param adapters Composition-root adapters.
 * @returns Usage count, floored at 0.
 */
async function usageCountFor(repoRoot: string, name: string, adapters: Adapters): Promise<number> {
  const candidates = findCandidateFiles(repoRoot, name);
  let total = 0;
  for (const abs of candidates) {
    const rel = relative(repoRoot, abs);
    if (isTestFile(rel)) continue;
    let content: string;
    try {
      content = readFileSync(abs, 'utf-8');
    } catch {
      continue;
    }
    const stripped = stripBarrelReexports(content);
    const adapter = selectSymbolIndex(rel, adapters);
    const { count } = await adapter.countReferences(name, rel, stripped);
    total += count;
  }
  return Math.max(0, total - 1);
}

/**
 * @purpose Find a Usage Waiver for `name` by grepping `specsRoot` for its ``### `<name>` `` heading.
 * @param specsRoot Absolute path of the specs/ root.
 * @param name Entity name.
 * @returns The first parsed waiver found, or null.
 */
function findWaiver(specsRoot: string, name: string): UsageWaiver | null {
  const files = execSyncSafe(
    `grep -rlF --include='*.md' -- ${shQuote('`' + name + '`')} ${shQuote(specsRoot)} 2>/dev/null`,
    { expectedExitCodes: [1] }
  )
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  for (const f of files) {
    let content: string;
    try {
      content = readFileSync(f, 'utf-8');
    } catch {
      continue;
    }
    const w = parseUsageWaiver(content, name);
    if (w) return w;
  }
  return null;
}

/**
 * @purpose Whether `decisionId` has a Decision Log heading anywhere under `specsRoot`.
 * @param specsRoot Absolute path of the specs/ root.
 * @param decisionId Decision id, e.g. `D-042`.
 * @returns True when a matching heading is found in some spec.
 */
function decisionLive(specsRoot: string, decisionId: string): boolean {
  const files = execSyncSafe(
    `grep -rlF --include='*.md' -- ${shQuote('### ' + decisionId)} ${shQuote(specsRoot)} 2>/dev/null`,
    { expectedExitCodes: [1] }
  )
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return files.some((f) => {
    try {
      return hasDecisionHeading(readFileSync(f, 'utf-8'), decisionId);
    } catch {
      return false;
    }
  });
}

/**
 * @purpose Execute gennady yagni — count changed symbols' production-code usage, report ungated
 *   underused ones.
 * @param rawArgs Raw command-line arguments (process.argv).
 * @returns YagniReport — the ESLint-style report and exit code.
 */
export async function run(rawArgs: string[]): Promise<YagniReport> {
  const args = parseArgs(rawArgs, {});
  const positional = (args._ as string[]).filter((a) => typeof a === 'string' && a !== 'yagni');
  const root = resolve(positional[0] ?? '.');
  const specsRoot = join(root, 'specs');

  const adapters: Adapters = {
    exact: new TsSymbolIndexAdapter(),
    approximate: new GrepSymbolIndexAdapter(),
  };

  const changedFiles = getChangedSourceFiles(root);
  const allChanged: ChangedSymbol[] = [];
  for (const rel of changedFiles) {
    allChanged.push(...(await changedSymbolsForFile(root, rel, adapters)));
  }

  const usageCounts = new Map<string, number>();
  for (const sym of allChanged) {
    if (usageCounts.has(sym.name)) continue;
    usageCounts.set(sym.name, await usageCountFor(root, sym.name, adapters));
  }

  const waivers = new Map<string, UsageWaiver>();
  const liveDecisions = new Set<string>();
  if (existsSync(specsRoot)) {
    for (const sym of allChanged) {
      if ((usageCounts.get(sym.name) ?? 0) >= 2 || waivers.has(sym.name)) continue;
      const w = findWaiver(specsRoot, sym.name);
      if (w) {
        waivers.set(sym.name, w);
        if (w.decision && decisionLive(specsRoot, w.decision)) liveDecisions.add(w.decision);
      }
    }
  }

  const findings = checkYagniUsage(allChanged, usageCounts, waivers, liveDecisions);
  logger.debug(
    `[YagniCommand#run] ${findings.length} finding(s) across ${changedFiles.length} file(s)`
  );
  return formatYagniReport(findings, changedFiles.length);
}

// Self-executing for CLI: gennady yagni [root]
const result = await run(process.argv);
console.log(result.text);
process.exit(result.exitCode);
