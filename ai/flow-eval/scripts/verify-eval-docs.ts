#!/usr/bin/env -S node --import tsx
// @file: GAP-E-5 (D-46) acceptance gate — every doc under `ai/flow-eval/docs/**` is only trustworthy
//   if every command/path/link it names actually exists in this checkout and no claim is left marked
//   as unverified. This script is that check, mechanical: (1) count literal `[UNVERIFIED]` markers —
//   must be 0; (2) every inline-code file path mentioned (repo-relative, no shell placeholders) must
//   exist on disk; (3) every markdown link target (`[text](target)`, anchors/URLs excluded) must
//   resolve; (4) every `npm run <script>` mentioned must be a real key in package.json's "scripts". A
//   path/command that is genuinely a live-only artifact (a sandbox path, a `--flag` value, a shell
//   variable) is excluded by construction — see isCheckablePath() — rather than allow-listed by name,
//   so a new stale path is caught by default. C-2 (V-BATCH-07): a dangling markdown link in
//   `docs/journal/RESULTS.md` to a file deleted by the same batch went uncaught because the default
//   file list used to be just EVAL-SPEC.md/RUNBOOK.md and inline-code checking alone doesn't see a
//   link target outside backticks — both gaps are closed here.
// @consumers: package.json "flow-eval:docs-check"; verify-eval-docs.test.ts (both-way: a doc with a
//   missing path/link/command/marker fails; the real docs in this checkout pass).
// @usage: node --import tsx ai/flow-eval/scripts/verify-eval-docs.ts [--root DIR] [FILE...]
//   Default FILE list (when none given): every `.md` under ai/flow-eval/docs/ (recursive) under
//   --root (default: three levels up from this script, i.e. the repo root).

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';

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
  // `bin/`, `golden/` — the worker-sandbox layout task-phase fixtures use (frozen, pre-GAP-E-6
  // EXPERIMENTS-LOG.md prose that documents a run's ephemeral files, not a repo path) — and `Tools/`
  // (RESULTS.md's one mention of a script living in the EXTERNAL cloud-ios checkout, not this repo)
  // are never a real path in THIS checkout. Same "excluded by construction" rationale as `.results/`.
  if (span.startsWith('bin/') || span.startsWith('golden/') || span.startsWith('Tools/'))
    return false;
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

/** @purpose Every markdown link target `[text](target)` — including the `(./RUNBOOK.md#anchor)`
 *  shape this corpus actually uses. Deliberately does not require the link text to be non-empty or
 *  backtick-wrapped: `[`PROGRESS-REPORT.md`](./PROGRESS-REPORT.md)` and `[see](../x.md)` both count. */
function extractMarkdownLinkTargets(text: string): string[] {
  const targets: string[] = [];
  const re = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) targets.push(m[1]);
  return targets;
}

/** @purpose True for a link target worth existence-checking: not a same-doc anchor (`#...`) and not
 *  any URL scheme (`http(s)://`, `mailto:`, …) — those are never a path in this checkout. */
function isCheckableLinkTarget(target: string): boolean {
  if (target.startsWith('#')) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target)) return false;
  return true;
}

/** @purpose Strip a trailing `#anchor` before checking a link target against the filesystem. */
function stripAnchor(target: string): string {
  const idx = target.indexOf('#');
  return idx === -1 ? target : target.slice(0, idx);
}

/** @purpose Strip a trailing `:123` or `:123-145` line-reference suffix (this batch of docs/reports'
 *  own `file.ts:465`-style pointer convention) before checking a backtick span against the filesystem
 *  — the file must exist, the line number is not part of the path. */
function stripLineSuffix(span: string): string {
  return span.replace(/:\d+(?:-\d+)?$/, '');
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
    const target = stripLineSuffix(span);
    const existsRelativeToDoc = existsSync(resolve(docDir, target));
    const existsRelativeToRoot = existsSync(resolve(repoRoot, target));
    if (!existsRelativeToDoc && !existsRelativeToRoot) {
      problems.push({ file: fileLabel, detail: `path does not exist: \`${span}\`` });
    }
  }

  const seenLinks = new Set<string>();
  for (const rawTarget of extractMarkdownLinkTargets(text)) {
    if (!isCheckableLinkTarget(rawTarget)) continue;
    if (seenLinks.has(rawTarget)) continue;
    seenLinks.add(rawTarget);
    const target = stripAnchor(rawTarget);
    if (target.length === 0) continue; // a pure `#anchor` with anchor stripped away — nothing to check
    const existsRelativeToDoc = existsSync(resolve(docDir, target));
    const existsRelativeToRoot = existsSync(resolve(repoRoot, target));
    if (!existsRelativeToDoc && !existsRelativeToRoot) {
      problems.push({ file: fileLabel, detail: `link target does not exist: (${rawTarget})` });
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

/** @purpose Default file list when none given on the CLI: every `.md` under `ai/flow-eval/docs/`,
 *  recursively (previously just EVAL-SPEC.md/RUNBOOK.md — C-2/V-BATCH-07: RESULTS.md,
 *  EXPERIMENTS-LOG.md and the ledger were outside this gate's default scope, so a dangling reference
 *  in any of them was invisible to `npm run flow-eval:docs-check`). Sorted for stable output. */
function discoverDefaultDocs(root: string): string[] {
  const docsDir = resolve(root, 'ai/flow-eval/docs');
  if (!existsSync(docsDir)) return [];
  const entries = readdirSync(docsDir, { recursive: true }) as string[];
  return entries
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => `ai/flow-eval/docs/${entry.split(sep).join('/')}`)
    .sort();
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
    files.push(...discoverDefaultDocs(root));
  }
  return { root, files };
}

async function main(argv: readonly string[]): Promise<void> {
  const { root, files } = parseArgs(argv);
  const npmScripts = loadNpmScripts(root);
  const allProblems: Problem[] = [];
  let checkedPaths = 0;
  let checkedLinks = 0;
  let checkedCommands = 0;

  for (const relFile of files) {
    const abs = resolve(root, relFile);
    if (!existsSync(abs)) {
      allProblems.push({ file: relFile, detail: 'doc file itself does not exist' });
      continue;
    }
    const text = readFileSync(abs, 'utf8');
    checkedPaths += new Set(extractInlineCodeSpans(text).filter(isCheckablePath)).size;
    checkedLinks += new Set(extractMarkdownLinkTargets(text).filter(isCheckableLinkTarget)).size;
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
      `${checkedLinks} link(s) checked, ${checkedCommands} npm command(s) checked, ` +
      `0 [UNVERIFIED] markers`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((cause) => {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
  });
}
