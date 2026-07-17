// @file: mrShape statanalysis (D-123 composition triggers) + track-scoped Context-section injection
//   (AI-40/D-119) for review track scaffolds — orchestrator-side, no LLM involved.
// @consumers: cli/cmd/inbox-review-plan (scaffoldReviewReports), inbox-roles NodeContext builder (TSK-113 Round 2)
// @tasks: TSK-134, TSK-113

import { execFileSync } from 'node:child_process';
import { logger } from '#logger';

// #region START_INPUT_TYPES

/** @purpose One file's diff stats consumed by `computeMrShape`/`buildTrackContext` | @invariant Structurally compatible with role-node.ts's `Changeset` — no import, keeps inbox-core dependency-free of inbox-roles. */
type ChangesetFileStats = {
  path: string;
  status: string;
  plus: number;
  minus: number;
};

/** @purpose File-level changeset shape this module consumes. */
type ChangesetInput = {
  files: ChangesetFileStats[];
};

// #endregion END_INPUT_TYPES

/** @purpose Statanalysis flags of one MR (D-123) — additive composition triggers for directive assembly, never a template selector. */
export type MrShape = {
  /** @purpose true when the diff adds a new exported function/class/const/type/interface */
  newSymbols: boolean;
  /** @purpose true when the diff adds a loop nested inside another loop */
  nestedLoops: boolean;
  /** @purpose true when the diff adds a `.filter().map()` chain on one collection */
  filterMapChain: boolean;
  /** @purpose true when the changeset touches exactly 1 line in exactly 1 file */
  isTiny: boolean;
  /** @purpose true when added lines match a secret/token assignment pattern | @invariant Depth modulator (§5.3.1) for the security track, never a lens selector */
  securityHits: boolean;
  /** @purpose true when the changeset touches a dependency manifest/lockfile | @invariant Depth modulator (§5.3.1) for the security track, never a lens selector */
  depManifest: boolean;
};

/** @purpose One entity mentioned in an injected Context-section markdown | @consumer TSK-137's injection-coverage gate */
export type InjectedEntity = {
  /** @purpose Repo-relative file path */
  file: string;
  /** @purpose Line number of a specific new symbol | @invariant Absent for file-level (no-new-symbol) entries */
  line?: number;
  /** @purpose New exported symbol name | @invariant Absent for file-level (no-new-symbol) entries */
  symbol?: string;
};

// #region START_STATANALYSIS_PATTERNS

const NEW_SYMBOL_PATTERN =
  /^export\s+(?:default\s+)?(?:async\s+function|function|class|const|let|type|interface)\s+([A-Za-z_$][\w$]*)/;
const LOOP_PATTERN = /\b(?:for|while)\s*\(/;
const FILTER_MAP_PATTERN = /\.filter\(.*\)\s*\.\s*map\(/;
const SECRET_PATTERN = /(?:secret|token|password|api[_-]?key)\s*[:=]\s*['"][^'"]{8,}['"]/i;

const DEP_MANIFEST_NAMES = new Set([
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'go.mod',
  'go.sum',
  'requirements.txt',
  'pyproject.toml',
  'poetry.lock',
  'Cargo.toml',
  'Cargo.lock',
  'Gemfile',
  'Gemfile.lock',
  'composer.json',
  'composer.lock',
]);

function isDepManifestFile(path: string): boolean {
  const base = path.split('/').pop() ?? path;
  return DEP_MANIFEST_NAMES.has(base);
}

function isAddedDiffLine(line: string): boolean {
  return line.startsWith('+') && !line.startsWith('+++');
}

function stripDiffMarker(line: string): string {
  return line.slice(1);
}

// #endregion END_STATANALYSIS_PATTERNS

/**
 * @purpose Statanalysis over a diff: 6 boolean composition triggers (D-123) for directive assembly.
 * @invariant Never throws on a binary/rename/mode-only diff (no textual hunks) — absent signal reads `false`, never `undefined`.
 * @param changeset File-level diff stats — used for `isTiny`/`depManifest`.
 * @param diffText Unified diff text — used for `newSymbols`/`nestedLoops`/`filterMapChain`/`securityHits`.
 * @throws {Error} `changeset` is not a valid shape (missing or non-array `files`).
 * @returns Six boolean flags, always fully populated.
 */
export function computeMrShape(changeset: ChangesetInput, diffText: string): MrShape {
  if (!changeset || !Array.isArray(changeset.files)) {
    throw new Error('[computeMrShape] changeset.files must be an array', { cause: { changeset } });
  }

  const addedLines = diffText.split('\n').filter(isAddedDiffLine).map(stripDiffMarker);

  let newSymbols = false;
  for (const line of addedLines) {
    if (NEW_SYMBOL_PATTERN.test(line.trim())) {
      newSymbols = true;
      break;
    }
  }

  // #region START_DETECT_NESTED_LOOPS — invariant: a loop keyword line seen while an outer loop's
  // indent scope is still open (i.e. not yet dedented past) counts as nesting; a same-or-shallower
  // indent pops the outer scope first, so two sibling (non-nested) loops do not false-positive.
  let nestedLoops = false;
  const openLoopIndents: number[] = [];
  for (const line of addedLines) {
    const indent = line.length - line.trimStart().length;
    while (openLoopIndents.length && indent <= openLoopIndents[openLoopIndents.length - 1]) {
      openLoopIndents.pop();
    }
    if (LOOP_PATTERN.test(line)) {
      if (openLoopIndents.length > 0) {
        nestedLoops = true;
        break;
      }
      openLoopIndents.push(indent);
    }
  }
  // #endregion END_DETECT_NESTED_LOOPS

  const filterMapChain = addedLines.some((line) => FILTER_MAP_PATTERN.test(line));
  const securityHits = addedLines.some((line) => SECRET_PATTERN.test(line));

  const touchedFiles = changeset.files.filter((f) => f.plus + f.minus > 0);
  const isTiny = touchedFiles.length === 1 && touchedFiles[0].plus + touchedFiles[0].minus === 1;

  const depManifest = changeset.files.some((f) => isDepManifestFile(f.path));

  return { newSymbols, nestedLoops, filterMapChain, isTiny, securityHits, depManifest };
}

// #region START_DIFF_PARSING_FOR_CONTEXT — invariant: only new-side (post-change) line numbers are
// tracked (context/added lines advance the counter, removed lines don't) since entities/attention
// markup point reviewers at the file as it exists on HEAD, not at the pre-change state.

type ParsedFileDiff = {
  path: string;
  hunkLines: string[];
  addedEntries: { lineNo: number; text: string }[];
};

function parseUnifiedDiff(diffText: string): ParsedFileDiff[] {
  const files: ParsedFileDiff[] = [];
  let current: ParsedFileDiff | null = null;
  let newLineNo = 0;

  for (const line of diffText.split('\n')) {
    const fileHeader = /^\+\+\+ b\/(.+)$/.exec(line);
    if (fileHeader) {
      current = { path: fileHeader[1], hunkLines: [], addedEntries: [] };
      files.push(current);
      continue;
    }
    if (!current) continue;

    const hunkHeader = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunkHeader) {
      newLineNo = Number(hunkHeader[1]);
      current.hunkLines.push(line);
      continue;
    }

    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff --git')) {
      continue;
    }

    if (isAddedDiffLine(line)) {
      current.hunkLines.push(line);
      current.addedEntries.push({ lineNo: newLineNo, text: stripDiffMarker(line) });
      newLineNo += 1;
    } else if (line.startsWith('-')) {
      current.hunkLines.push(line);
    } else if (line.startsWith(' ')) {
      current.hunkLines.push(line);
      newLineNo += 1;
    }
  }

  return files;
}

// #endregion END_DIFF_PARSING_FOR_CONTEXT

/**
 * @purpose Run a git command in the worktree and return trimmed stdout.
 * @param args Git subcommand and arguments.
 * @param worktreePath Working directory to run git in.
 * @throws {Error} The git process exits non-zero.
 * @sideEffect Spawns a git subprocess.
 */
function runGit(args: string[], worktreePath: string): string {
  try {
    return execFileSync('git', args, {
      cwd: worktreePath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (cause) {
    const error = new Error(`[buildTrackContext] git ${args.join(' ')} failed`, { cause });
    logger.error('[buildTrackContext] [computing → failed]', { error });
    throw error;
  }
}

function renderAttentionLines(track: string, shape: MrShape, newSymbolNames: string[]): string[] {
  const lines: string[] = [];
  if (shape.newSymbols) {
    lines.push(
      `- ⚠ Новый экспортируемый символ \`${newSymbolNames.join('`, `')}\` — шаг «нет ли уже такого / тот ли слой» (AI-44 dedup-шаг).`
    );
  }
  if (shape.isTiny) {
    lines.push('- ⚠ Изменение крошечное — не теряй бдительность (AX_MINIMAL_CHANGE_SUSPICION).');
  }
  if (shape.filterMapChain) {
    lines.push('- ⚠ Цепочка `.filter().map()` — оцени сведение к `reduce` (AI-44).');
  }
  if (shape.nestedLoops) {
    lines.push('- ⚠ Вложенные циклы — оцени сложность (AI-44).');
  }
  if (track === 'security' && (shape.securityHits || shape.depManifest)) {
    lines.push('- 🔒 Повышенный приоритет: SUPPLY/INJ/SECRET-пробы (§5.3.1 depth-modulation).');
  }
  return lines;
}

/**
 * @purpose Render the Context-section markdown for one track — hunks, commits, entities,
 *   attention markup — plus the structured entity list the same pass produced.
 * @invariant File scoping is caller-driven: `changeset` already carries the files to show
 *   (per-track subset for regular tracks, full MR changeset for `security` per NFC-SV-09).
 * @invariant `injectedEntities` mirrors exactly what `markdown` mentions — same build pass, never
 *   an independent recomputation (TSK-137 consumes it directly, never re-parses the markdown).
 * @param track Track name (`logic` | `security` | ... ) — only affects the security depth-modulation line.
 * @param changeset Files this call renders hunks for.
 * @param base Diff base SHA.
 * @param worktreePath Local worktree to run `git diff`/`git log` in.
 * @throws {Error} A git command fails (missing worktree, invalid SHA).
 * @returns Rendered Context-section markdown, its structured entity list, and the `MrShape`
 *   statanalysis from the same diff pass (TSK-113 Round 2) — reused, not independently recomputed.
 * @sideEffect Spawns `git diff`/`git log` subprocesses against `worktreePath`.
 */
export function buildTrackContext(
  track: string,
  changeset: ChangesetInput,
  base: string,
  worktreePath: string
): { markdown: string; injectedEntities: InjectedEntity[]; mrShape: MrShape } {
  const paths = changeset.files.map((f) => f.path);
  const diffText = paths.length
    ? runGit(['diff', `${base}..HEAD`, '--', ...paths], worktreePath)
    : '';
  const commitLog = runGit(['log', '--oneline', `${base}..HEAD`], worktreePath);
  const commits = commitLog ? commitLog.split('\n') : [];

  const shape = computeMrShape(changeset, diffText);
  const parsedFiles = parseUnifiedDiff(diffText);

  const injectedEntities: InjectedEntity[] = [];
  const hunkSections: string[] = [];
  const newSymbolNames: string[] = [];

  // #region START_BUILD_ENTITIES_AND_HUNKS — invariant: one injectedEntities entry per new symbol
  // found in a file, or exactly one bare file-level entry when the file has no new symbol —
  // matches the "поэлементно соответствует markdown" contract (TSK-134 BDD).
  for (const file of parsedFiles) {
    const newSymbolEntries = file.addedEntries
      .map((entry) => ({ entry, match: NEW_SYMBOL_PATTERN.exec(entry.text.trim()) }))
      .filter(
        (e): e is { entry: (typeof file.addedEntries)[number]; match: RegExpExecArray } =>
          e.match !== null
      );

    if (newSymbolEntries.length > 0) {
      for (const { entry, match } of newSymbolEntries) {
        injectedEntities.push({ file: file.path, line: entry.lineNo, symbol: match[1] });
        newSymbolNames.push(match[1]);
      }
    } else {
      injectedEntities.push({ file: file.path });
    }

    if (file.hunkLines.length > 0) {
      hunkSections.push(`### \`${file.path}\`\n\n\`\`\`diff\n${file.hunkLines.join('\n')}\n\`\`\``);
    }
  }
  // #endregion END_BUILD_ENTITIES_AND_HUNKS

  const attentionLines = renderAttentionLines(track, shape, newSymbolNames);

  const commitsSection = `**Коммитов (${commits.length}):**\n${commits.map((c) => `- ${c}`).join('\n')}`;
  const hunksSection = hunkSections.length
    ? hunkSections.join('\n\n')
    : '_нет текстовых хунков (rename/mode-only)_';
  const attentionSection = attentionLines.length
    ? `\n\n**Разметка внимания:**\n${attentionLines.join('\n')}`
    : '';

  const markdown = `${commitsSection}\n\n${hunksSection}${attentionSection}`;

  return { markdown, injectedEntities, mrShape: shape };
}
