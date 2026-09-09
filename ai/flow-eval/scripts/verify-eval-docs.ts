#!/usr/bin/env -S node --import tsx
// @file: GAP-E-5 (D-46) acceptance gate — the unified eval spec (`docs/EVAL-SPEC.md`) and its
//   companion `docs/RUNBOOK.md` are only trustworthy if every command/path they name actually exists
//   in this checkout and no claim is left marked as unverified. This script is that check, mechanical:
//   (1) count literal `[UNVERIFIED]` markers — must be 0; (2) every inline-code file path mentioned
//   (repo-relative, no shell placeholders) must exist on disk; (3) every `npm run <script>` mentioned
//   must be a real key in package.json's "scripts". A path/command that is genuinely a live-only
//   artifact (a sandbox path, a `--flag` value, a shell variable) is excluded by construction — see
//   isCheckablePath() — rather than allow-listed by name, so a new stale path is caught by default.
// @consumers: package.json "flow-eval:docs-check"; docs-verifier.test.ts (both-way: a doc with a
//   missing path/command/marker fails; the real EVAL-SPEC.md/RUNBOOK.md pass).
// @usage: node --import tsx ai/flow-eval/scripts/verify-eval-docs.ts [--root DIR] [FILE...]
//   Default FILE list (when none given): ai/flow-eval/docs/EVAL-SPEC.md, ai/flow-eval/docs/RUNBOOK.md
//   under --root (default: three levels up from this script, i.e. the repo root).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type Problem = { file: string; detail: string };

/** @purpose True for a backtick span worth existence-checking: a repo-relative path with a real
 *  extension or a known top-level prefix, and none of the placeholder/shell markers (`<...>`, `$VAR`,
 *  `~`, glob `*`, a leading `/`, a URL) that mean "this is not a literal path in THIS checkout". */
function isCheckablePath(span: string): boolean {
  if (/[<>$~*\s]/.test(span)) return false;
  if (span.startsWith('/') || span.startsWith('http://') || span.startsWith('https://'))
    return false;
  if (span.includes('://')) return false;
  // `.results/**` (note the leading dot — distinct from the durable `results/**`) is the harness's
  // OWN transient, gitignored, runtime-only output tree (sandbox-lifecycle.ts): by construction it
  // never exists in a fresh checkout, so a mention of a file under it is never a stale-doc signal.
  if (span.includes('.results/')) return false;
  const KNOWN_PREFIXES = [
    'ai/',
    'dist/',
    'cli/',
    'shared/',
    'services/',
    'scripts/',
    'specs/',
    'package.json',
    'tsconfig',
  ];
  const hasKnownPrefix = KNOWN_PREFIXES.some((p) => span.startsWith(p));
  const hasExtension = /\.[a-zA-Z0-9]{1,8}$/.test(span);
  if (!hasKnownPrefix && !hasExtension) return false;
  // A bare extension-looking flag value or version number ("6.2", "v2") is not a path.
  if (!span.includes('/') && !hasKnownPrefix) return false;
  return true;
}

function extractInlineCodeSpans(text: string): string[] {
  const spans: string[] = [];
  const re = /`([^`\n]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) spans.push(m[1]);
  return spans;
}

function extractNpmRunCommands(text: string): string[] {
  const names: string[] = [];
  const re = /npm run ([a-zA-Z0-9:_-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) names.push(m[1]);
  return names;
}

/** @purpose Run the full check over one doc's text; returns every problem found (empty = clean). A
 *  path is accepted if it resolves either against the doc's OWN directory (an ordinary markdown
 *  relative link, e.g. `journal/RESULTS.md` from inside `docs/`) or against the repo root (a
 *  repo-relative reference like `ai/flow-eval/cli.ts`) — either is a legitimate way to write a real
 *  path in prose, and only a span that resolves NEITHER way is a stale reference. */
function verifyDocText(
  fileLabel: string,
  docAbsPath: string,
  text: string,
  repoRoot: string,
  npmScripts: Set<string>
): Problem[] {
  const problems: Problem[] = [];

  const unverifiedCount = (text.match(/\[UNVERIFIED\]/g) ?? []).length;
  if (unverifiedCount > 0) {
    problems.push({ file: fileLabel, detail: `${unverifiedCount} [UNVERIFIED] marker(s) remain` });
  }

  const docDir = dirname(docAbsPath);
  const seenPaths = new Set<string>();
  for (const span of extractInlineCodeSpans(text)) {
    if (!isCheckablePath(span)) continue;
    if (seenPaths.has(span)) continue;
    seenPaths.add(span);
    const existsRelativeToDoc = existsSync(resolve(docDir, span));
    const existsRelativeToRoot = existsSync(resolve(repoRoot, span));
    if (!existsRelativeToDoc && !existsRelativeToRoot) {
      problems.push({ file: fileLabel, detail: `path does not exist: \`${span}\`` });
    }
  }

  const seenCommands = new Set<string>();
  for (const name of extractNpmRunCommands(text)) {
    if (seenCommands.has(name)) continue;
    seenCommands.add(name);
    if (!npmScripts.has(name)) {
      problems.push({
        file: fileLabel,
        detail: `npm run ${name} — no such script in package.json`,
      });
    }
  }

  return problems;
}

function loadNpmScripts(repoRoot: string): Set<string> {
  const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  return new Set(Object.keys(pkg.scripts ?? {}));
}

function parseArgs(argv: readonly string[]): { root: string; files: string[] } {
  const DEFAULT_ROOT = resolve(import.meta.dirname, '../../..');
  let root = DEFAULT_ROOT;
  const files: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') root = resolve(argv[++i] ?? '');
    else files.push(argv[i]);
  }
  if (files.length === 0) {
    files.push('ai/flow-eval/docs/EVAL-SPEC.md', 'ai/flow-eval/docs/RUNBOOK.md');
  }
  return { root, files };
}

async function main(argv: readonly string[]): Promise<void> {
  const { root, files } = parseArgs(argv);
  const npmScripts = loadNpmScripts(root);
  const allProblems: Problem[] = [];
  let checkedPaths = 0;
  let checkedCommands = 0;

  for (const relFile of files) {
    const abs = resolve(root, relFile);
    if (!existsSync(abs)) {
      allProblems.push({ file: relFile, detail: 'doc file itself does not exist' });
      continue;
    }
    const text = readFileSync(abs, 'utf8');
    checkedPaths += new Set(extractInlineCodeSpans(text).filter(isCheckablePath)).size;
    checkedCommands += new Set(extractNpmRunCommands(text)).size;
    allProblems.push(...verifyDocText(relFile, abs, text, root, npmScripts));
  }

  if (allProblems.length > 0) {
    console.error(`[verify-eval-docs] ${allProblems.length} problem(s):`);
    for (const p of allProblems) console.error(`  ${p.file}: ${p.detail}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `[verify-eval-docs] OK — ${files.length} doc(s), ${checkedPaths} path(s) checked, ` +
      `${checkedCommands} npm command(s) checked, 0 [UNVERIFIED] markers`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((cause) => {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
  });
}
