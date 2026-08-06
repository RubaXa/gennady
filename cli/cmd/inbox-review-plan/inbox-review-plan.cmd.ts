// @file: review-plan command — deterministic file-to-track classification for fan-out review,
//   plus the document-pipeline scaffold/validate modes (PLAN.md, per-track task files, gates).
// @consumers: agent-inbox skill (inbox-flow.directive.xml)
// @tasks: TSK-102, TSK-103, TSK-113, TSK-122, TSK-134

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveStateDir, mrReportsDir } from '../inbox/_core/logic/state-paths.logic.ts';
import { findStopWords } from '../../../shared/prompt-lint/stop-words.ts';
import {
  buildTrackContext,
  type InjectedEntity,
} from '../../../services/agent-inbox/modules/inbox-core/context-builder.ts';

// #region START_ARG_PARSING

function getFlagValue(argv: string[], flag: string): string | undefined {
  const prefix = `${flag}=`;
  const direct = argv.find((a) => a.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const idx = argv.indexOf(flag);
  if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
  return undefined;
}

function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

// #endregion END_ARG_PARSING

// #region START_DIFF_PARSING

type FileChange = {
  path: string;
  plus: number;
  minus: number;
  status: string;
};

type Changeset = {
  files: FileChange[];
  totals: { files: number; plus: number; minus: number };
};

function computeChangeset(worktreePath: string, baseSha: string): Changeset {
  let numstat: string;
  let nameStatus: string;
  try {
    numstat = (
      execFileSync('git', ['-C', worktreePath, 'diff', '--numstat', `${baseSha}..HEAD`], {
        encoding: 'utf8',
        stdio: 'pipe',
      }) as string
    ).trim();
    nameStatus = (
      execFileSync('git', ['-C', worktreePath, 'diff', '--name-status', `${baseSha}..HEAD`], {
        encoding: 'utf8',
        stdio: 'pipe',
      }) as string
    ).trim();
  } catch (e: unknown) {
    const err = e as { stderr?: string; message: string };
    throw new Error(err.stderr || err.message);
  }

  const statusMap = new Map<string, string>();
  for (const line of nameStatus.split('\n')) {
    const [status, ...pathParts] = line.split('\t');
    if (status && pathParts.length > 0) {
      let filePath = pathParts.join('\t');
      if (status.startsWith('R') && pathParts.length >= 2) {
        filePath = pathParts[1]; // renamed → new path
      }
      statusMap.set(filePath, status[0]);
    }
  }

  const files: FileChange[] = [];
  let totalPlus = 0;
  let totalMinus = 0;

  for (const line of numstat.split('\n')) {
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const plus = parts[0] === '-' ? 0 : Number(parts[0]) || 0;
    const minus = parts[1] === '-' ? 0 : Number(parts[1]) || 0;
    const path = parts.slice(2).join('\t');
    totalPlus += plus;
    totalMinus += minus;
    files.push({ path, plus, minus, status: statusMap.get(path) ?? 'M' });
  }

  return { files, totals: { files: files.length, plus: totalPlus, minus: totalMinus } };
}

// #endregion END_DIFF_PARSING

// #region START_CONTRACT_CHANGE_DETECTION — content-level scan the numstat-only changeset can't do:
// which files changed a comment / JSDoc contract / #region banner, so the plan can add the mandatory
// contract track (spec-exists + no-bloat + no-changelog) as a separate vector across all of them.

const CODE_FILE_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|svelte|vue|go|py|rb|rs|java|kt|php|c|cc|cpp|h|hpp|cs|swift|scala)$/;

/**
 * @purpose True when a diff hunk line is a comment, JSDoc line, or `#region`/`#endregion` banner.
 * @param content Added/removed line body — the raw diff line with its leading `+`/`-` stripped.
 * @returns Whether the line touches the comment/contract surface.
 */
function isContractCommentLine(content: string): boolean {
  const t = content.trim();
  if (t === '') return false;
  if (t.includes('#region') || t.includes('#endregion')) return true;
  return /^(\/\/|\/\*|\*\/|\*|\/\*\*)/.test(t);
}

/**
 * @purpose Code files whose diff added/removed a comment, JSDoc contract, or `#region` line.
 * @invariant Scans hunk body only (single `+`/`-`), code files only; degrades to `[]` on git error.
 * @param worktreePath Local git worktree.
 * @param baseSha Base SHA the diff is computed against.
 * @returns Sorted, deduped paths — empty when nothing on the contract surface changed.
 */
export function computeContractChangedFiles(worktreePath: string, baseSha: string): string[] {
  let diff: string;
  try {
    diff = execFileSync('git', ['-C', worktreePath, 'diff', '--unified=0', `${baseSha}..HEAD`], {
      encoding: 'utf8',
      stdio: 'pipe',
    }) as string;
  } catch {
    return [];
  }

  const changed = new Set<string>();
  let currentFile: string | null = null;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      const path = line.slice('+++ b/'.length);
      currentFile = CODE_FILE_EXT.test(path) ? path : null;
      continue;
    }
    if (line.startsWith('+++ ') || line.startsWith('--- ') || line.startsWith('@@')) continue;
    if (!currentFile) continue;
    if ((line.startsWith('+') || line.startsWith('-')) && isContractCommentLine(line.slice(1))) {
      changed.add(currentFile);
    }
  }
  return [...changed].sort();
}

// #endregion END_CONTRACT_CHANGE_DETECTION

// #region START_REVIEW_PLAN_TYPES

type ReviewTrack = {
  name: string;
  files: string[];
  lineCount: number;
  focus: string;
  directive:
    | 'arch-interrogation + code-interrogation'
    | 'code-interrogation'
    | 'security-interrogation'
    | 'contract-interrogation';
};

type ReviewPlan = {
  mode: 'inline' | 'fan_out';
  tracks: ReviewTrack[];
  summary: {
    totalFiles: number;
    totalLines: number;
    meaningfulTracks: number;
  };
};

// #endregion END_REVIEW_PLAN_TYPES

// #region START_TRACK_CLASSIFICATION

const TRACK_RULES: Record<
  string,
  { patterns: RegExp[]; focus: string; directive: ReviewTrack['directive'] }
> = {
  tests: {
    patterns: [/\.(test|spec)\.(ts|tsx|js|jsx)$/, /__tests__\//],
    focus: 'TEST probe',
    directive: 'code-interrogation',
  },
  docs: {
    patterns: [/\.(md|mdx|xml)$/, /^docs\//, /^specs\//, /^ai\/(directives|skills)\//],
    focus: 'docs — skip probes, только структура',
    directive: 'code-interrogation',
  },
  config: {
    patterns: [/\.(json|yaml|yml|toml)$/, /^\./, /Dockerfile/, /Makefile/],
    focus: 'config — DEP+GLOBAL probes',
    directive: 'code-interrogation',
  },
  ui: {
    patterns: [/\.(svelte|vue|tsx|jsx|css|scss|less)$/],
    focus: 'NAT+IDIOM+LIT probes',
    directive: 'arch-interrogation + code-interrogation',
  },
  assets: {
    patterns: [
      /\.(png|jpg|jpeg|gif|svg|ico|webp|avif)$/,
      /\.(woff2?|ttf|eot|otf)$/,
      /\.(pdf|xlsx?|docx?)$/,
    ],
    focus: 'assets — skip review',
    directive: 'code-interrogation',
  },
};

const SECURITY_PATTERNS: RegExp[] = [
  /auth/i,
  /token/i,
  /secret/i,
  /password/i,
  /credential/i,
  /crypto/i,
  /permission/i,
  /acl/i,
  /rbac/i,
  /oauth/i,
  /jwt/i,
  /session/i,
  /csrf/i,
  /xss/i,
  /sanitiz/i,
  /escap/i,
  /cipher/i,
  /encrypt/i,
  /decrypt/i,
  /hash/i,
  /salt/i,
  /cert/i,
  /ssl/i,
  /tls/i,
  /key/i,
];

// #region START_DEP_MANIFEST_DETECTION

const DEP_MANIFEST_EXACT_NAMES = new Set([
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.npmrc',
  'npm-shrinkwrap.json',
  'go.mod',
  'go.sum',
  'requirements.txt',
  'pyproject.toml',
  'Pipfile',
  'Pipfile.lock',
  'setup.py',
  'setup.cfg',
  'poetry.lock',
  'Cargo.toml',
  'Cargo.lock',
  'Gemfile',
  'Gemfile.lock',
  'composer.json',
  'composer.lock',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'gradle.lockfile',
  'settings.gradle',
  'settings.gradle.kts',
  'mix.exs',
  'mix.lock',
  'stack.yaml',
  'cabal.project',
  'Package.swift',
  'Package.resolved',
  'pubspec.yaml',
  'pubspec.lock',
  'build.zig.zon',
  'deno.json',
  'deno.jsonc',
  'deno.lock',
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
]);

const DEP_MANIFEST_PATTERNS: RegExp[] = [
  /\.cabal$/i,
  /\.csproj$/i,
  /\.fsproj$/i,
  /\.vbproj$/i,
  /\.nimble$/i,
  /\.gemspec$/i,
  /packages\.config$/i,
  /paket\.(dependencies|lock)$/i,
  /Directory\.Packages\.props$/i,
  /conanfile\.(txt|py)$/i,
  /vcpkg\.json$/i,
  /bun\.lockb?$/i,
  /\.nuspec$/i,
  /Podfile$/i,
  /Cartfile$/i,
  /\.podspec$/i,
  /^\.tool-versions$/i,
  /\.python-version$/i,
];

/**
 * @purpose Detect dependency manifest files across languages — Node.js, Go, Python, Rust,
 *   Ruby, PHP, Java, .NET, Elixir, Haskell, Swift, Dart, Zig, Nim, C/C++, Deno, Bun.
 * @param path File path relative to repo root.
 * @returns true when the file is a known dependency manifest or lockfile.
 */
function isDepManifest(path: string): boolean {
  const base = path.split('/').pop() ?? path;
  if (DEP_MANIFEST_EXACT_NAMES.has(base)) return true;
  return DEP_MANIFEST_PATTERNS.some((r) => r.test(base));
}

// #endregion END_DEP_MANIFEST_DETECTION

function isSecurityFile(path: string): boolean {
  return SECURITY_PATTERNS.some((r) => r.test(path));
}

function classifyTrack(path: string): string {
  for (const [track, rules] of Object.entries(TRACK_RULES)) {
    if (rules.patterns.some((r) => r.test(path))) return track;
  }
  return 'logic';
}

// Vector, not per-language rules: the check binds to whatever coding rules governed each file (its
// SDD phase Rules — typescript-rules for .ts, the Svelte rules for .svelte, …); the orchestrator
// resolves and injects those per file into ## Контекст at enrichment. Focus states WHAT to check.
const CONTRACT_TRACK_FOCUS =
  'CONTRACT — по каждому изменённому контракту/комментарию: (1) есть ли спека; (2) не распух ли по правилам кодирования ЭТОГО файла (contract-budget: пересказ → удалить); (3) не changelog ли (переписать блок, не дописать). Правила берутся из фазы SDD-задачи файла — оркестратор дописывает их в ## Контекст.';

function getTrackFocus(track: string): string {
  if (track === 'deps') return 'SUPPLY probe';
  if (track === 'security') return 'SEC+INPUT+AUTHZ+SECRET+SUPPLY+BLAST+INJ probes';
  if (track === 'contract') return CONTRACT_TRACK_FOCUS;
  return TRACK_RULES[track]?.focus ?? 'NAT+IDIOM+LIT+DEP+GLOBAL+BIZ+TYPO probes';
}

function getTrackDirective(track: string): ReviewTrack['directive'] {
  if (track === 'deps') return 'security-interrogation';
  if (track === 'security') return 'arch-interrogation + code-interrogation';
  if (track === 'contract') return 'contract-interrogation';
  return TRACK_RULES[track]?.directive ?? 'arch-interrogation + code-interrogation';
}

function isMeaningfulTrack(name: string): boolean {
  return name !== 'docs' && name !== 'config' && name !== 'assets';
}

// #endregion END_TRACK_CLASSIFICATION

// #region START_PLAN_BUILDER

const INLINE_MAX_FILES = 6;
const INLINE_MAX_LINES = 300;

/**
 * @purpose Classify a changeset into inline/fan_out review tracks — deterministic, no LLM.
 * @invariant `contractFiles` non-empty adds one mandatory `contract` overlay track spanning them
 *   all — separate vector, not a file partition, so it never shifts inline/fan_out mode.
 * @param changeset File-level diff stats to classify.
 * @param [contractFiles] Files whose diff touched a comment/JSDoc/#region (`computeContractChangedFiles`).
 * @returns Review plan: mode + per-track file/line groupings.
 * @consumer inbox-review-plan.cmd `run`, reviewer.role.ts `node_prepare` (TSK-122)
 */
export function buildReviewPlan(changeset: Changeset, contractFiles: string[] = []): ReviewPlan {
  const tracks = new Map<string, { files: string[]; lineCount: number }>();

  for (const file of changeset.files) {
    let track: string;
    if (isDepManifest(file.path)) {
      track = 'deps';
    } else {
      track = classifyTrack(file.path);
      if (isSecurityFile(file.path)) {
        track = 'security';
      }
    }
    const entry = tracks.get(track) ?? { files: [], lineCount: 0 };
    entry.files.push(file.path);
    entry.lineCount += file.plus + file.minus;
    tracks.set(track, entry);
  }

  const meaningfulTracks = [...tracks.entries()].filter(([name]) => isMeaningfulTrack(name));

  const totalLines = changeset.totals.plus + changeset.totals.minus;
  const mode =
    changeset.totals.files <= INLINE_MAX_FILES &&
    totalLines <= INLINE_MAX_LINES &&
    meaningfulTracks.length <= 1
      ? 'inline'
      : 'fan_out';

  const reviewTracks: ReviewTrack[] = [...tracks.entries()]
    .filter(([, entry]) => entry.files.length > 0)
    .map(([name, entry]) => ({
      name,
      files: entry.files,
      lineCount: entry.lineCount,
      focus: getTrackFocus(name),
      directive: getTrackDirective(name),
    }));

  if (contractFiles.length > 0) {
    const fileStats = new Map(changeset.files.map((f) => [f.path, f]));
    reviewTracks.push({
      name: 'contract',
      files: contractFiles,
      lineCount: contractFiles.reduce((n, f) => {
        const stat = fileStats.get(f);
        return n + (stat ? stat.plus + stat.minus : 0);
      }, 0),
      focus: getTrackFocus('contract'),
      directive: getTrackDirective('contract'),
    });
  }

  return {
    mode,
    tracks: reviewTracks,
    summary: {
      totalFiles: changeset.totals.files,
      totalLines: changeset.totals.plus + changeset.totals.minus,
      meaningfulTracks: meaningfulTracks.length,
    },
  };
}

// #endregion END_PLAN_BUILDER

// #region START_DOCUMENT_PARSING — shared frontmatter/section reader for scaffold (idempotency
// check) and validate (schema gate); the pipeline only ever reads back documents it generated
// itself, so a minimal line-based parser is sufficient — no general YAML support needed.

/** @purpose Flat frontmatter map: scalar values or `key:` list blocks (`- item` lines). */
type Frontmatter = Record<string, string | string[]>;

function parseDocument(content: string): { frontmatter: Frontmatter; body: string } {
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '---') return { frontmatter: {}, body: content };
  const end = lines.indexOf('---', 1);
  if (end === -1) return { frontmatter: {}, body: content };

  const frontmatter: Frontmatter = {};
  let currentListKey: string | null = null;
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    const listItem = /^\s*-\s+(.*)$/.exec(line);
    if (listItem && currentListKey) {
      (frontmatter[currentListKey] as string[]).push(listItem[1].trim());
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, value] = kv;
    if (value === '') {
      frontmatter[key] = [];
      currentListKey = key;
    } else {
      frontmatter[key] = value.trim();
      currentListKey = null;
    }
  }
  return { frontmatter, body: lines.slice(end + 1).join('\n') };
}

function extractSection(body: string, heading: string): string | null {
  const match = new RegExp(`^## ${heading}\\s*$`, 'm').exec(body);
  if (!match) return null;
  const rest = body.slice(match.index + match[0].length);
  const nextHeadingIdx = rest.search(/^## /m);
  return (nextHeadingIdx === -1 ? rest : rest.slice(0, nextHeadingIdx)).trim();
}

function findUnclosedMermaidBlock(body: string): boolean {
  let inMermaid = false;
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!inMermaid && trimmed.startsWith('```mermaid')) inMermaid = true;
    else if (inMermaid && trimmed === '```') inMermaid = false;
  }
  return inMermaid;
}

/**
 * @purpose True when the text contains at least one closed ```mermaid fenced block.
 * @invariant Opening ```mermaid must be followed by a closing ``` — an unclosed block does NOT count.
 * @param body Markdown text to scan.
 * @returns true if a complete mermaid block exists.
 */
function hasClosedMermaidBlock(body: string): boolean {
  let inMermaid = false;
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!inMermaid && trimmed.startsWith('```mermaid')) inMermaid = true;
    else if (inMermaid && trimmed === '```') return true;
  }
  return false;
}

// #endregion END_DOCUMENT_PARSING

// #region START_SCAFFOLD_TEMPLATES — mechanical prefill for task/plan/readme/history documents.
// purpose: механика создаёт структуру и словари; смысл (## Context) заполняет оркестратор,
// находки/вердикт — сабагент. Validate (below) enforces the same schema at read time.

const CANDIDATES_COLUMNS = ['ID', 'Файл', 'Строка', 'Проблема', 'Ось', 'Вид', 'Важность'];
const CANDIDATES_HEADER = `| ${CANDIDATES_COLUMNS.join(' | ')} |`;
const CANDIDATES_SEPARATOR = `| ${CANDIDATES_COLUMNS.map(() => '---').join(' | ')} |`;

const README_TEMPLATE = `# Отчёт ревью

<!-- Инфографика вместо стены текста: реляционное — Mermaid-диаграммой (тип по
     ai/directives/agent-inbox/visual-vocabulary.directive.xml), одиночное суждение — сплошным текстом. -->

## Обзор

<!-- FILL: orchestrator — размер + карта файлов (дерево) -->

## Архитектура

<!-- FILL: orchestrator — C4/helicopter Mermaid (всегда, даже на дельте), ≤7 узлов, не сплошной текст -->

## Поведение

<!-- FILL: orchestrator — как работает: sequenceDiagram (новый флоу) ИЛИ было→стало (рефактор). Тривиально → n/a — <причина> -->

## Сценарии

<!-- FILL: orchestrator — use-case «зачем»: продуктовые сценарии из описания MR/тикета; не заявлено → «предполагаемый». Тривиально → n/a — <причина> -->

## Вердикты

<!-- FILL: orchestrator -->

## Кандидаты

<!-- FILL: orchestrator -->

## Треды

<!-- FILL: orchestrator -->
`;

function renderHistoryTemplate(ref: string): string {
  return `# История — ${ref}

<!-- append-only: оркестратор добавляет запись о каждом визите; механика не перезаписывает файл -->
`;
}

function renderTaskTemplate(
  ref: string,
  headSha: string,
  track: string,
  files: string[],
  focus: string,
  fileStats: Map<string, FileChange>,
  contextMarkdown?: string
): string {
  const frontmatterLines = [
    '---',
    `ref: ${ref}`,
    `headSha: ${headSha}`,
    `track: ${track}`,
    'files:',
    ...files.map((f) => `  - ${f}`),
    'status: scaffolded',
    '---',
  ];

  const scopeLines = files.map((f) => {
    const stat = fileStats.get(f);
    const delta = stat ? ` (+${stat.plus}/-${stat.minus})` : '';
    return `- \`${f}\`${delta}`;
  });

  return `${frontmatterLines.join('\n')}

> **Первый шаг:** один раз выполни \`ls\` корня worktree (путь — в «## Контекст»). Этот единственный
> запрос откроет доступ ко всей папке, дальше файлы ниже читаются без запроса прав на каждый.

## Область

- **Фокус:** ${focus}
- **Файлы (${files.length}):**
${scopeLines.join('\n')}

## Контекст

${contextMarkdown ?? '<!-- FILL: orchestrator — смысл, сущности, prior threads, цели -->'}

## Находки

<!-- FILL: agent -->

## Кандидаты

<!-- FILL: agent — одна строка на замечание. Нет замечаний → оставь только шапку, placeholder-строку из «—» НЕ добавляй.
     «Ось» = тип находки: архитектурная A–G или код-проба (NAT/IDIOM/LIT/DEP/GLOBAL/TEST/SEC/BIZ/TYPO).
     «Вид» = КАК постим (не тип проблемы!): new-line-comment / reply-to-thread / correction-reply / awaiting-my-reply / suggestion. -->

${CANDIDATES_HEADER}
${CANDIDATES_SEPARATOR}

## Вердикт

<!-- FILL: agent -->
`;
}

function renderPlanTemplate(
  ref: string,
  headSha: string,
  base: string,
  mode: ReviewPlan['mode'],
  createdAt: string,
  rows: { track: string; files: number; lines: number; focus: string; status: string }[]
): string {
  const frontmatterLines = [
    '---',
    `ref: ${ref}`,
    `headSha: ${headSha}`,
    `base: ${base}`,
    `mode: ${mode}`,
    `createdAt: ${createdAt}`,
    '---',
  ];
  const tableRows = rows.map(
    (r) => `| ${r.track} | ${r.files} | ${r.lines} | ${r.focus} | ${r.status} |`
  );

  return `${frontmatterLines.join('\n')}

# План ревью — ${ref}

| Дорожка | Файлов | Строк | Фокус | Статус |
| --- | --- | --- | --- | --- |
${tableRows.join('\n')}
`;
}

// #endregion END_SCAFFOLD_TEMPLATES

// #region START_SCAFFOLD_BUILDER

/** @purpose Result of `--scaffold`: paths of every document the pipeline created or reused. */
type ScaffoldResult = {
  scaffolded: true;
  dir: string;
  plan: string;
  tasks: string[];
  /** @purpose Structured Context-section entities per track, from the buildTrackContext pass that filled the markdown | @invariant Absent track key means no worktreePath was given */
  injectedEntities: Record<string, InjectedEntity[]>;
};

function readTaskStatus(taskPath: string): string | null {
  if (!existsSync(taskPath)) return null;
  const { frontmatter } = parseDocument(readFileSync(taskPath, 'utf8'));
  return typeof frontmatter.status === 'string' ? frontmatter.status : null;
}

/**
 * @purpose Build the `Changeset` a track's Context-section should be scoped to.
 * @invariant `security` sees the FULL MR changeset (NFC-SV-09), never narrowed; every other
 *   track sees exactly its own file list from the Scope section.
 * @param track Track name.
 * @param trackFiles This track's own file list (from the review plan).
 * @param changeset Full MR changeset (all tracks).
 * @param fileStats Full MR file stats, keyed by path.
 * @returns Changeset scoped per the invariant above.
 */
function scopeChangesetForTrack(
  track: string,
  trackFiles: string[],
  changeset: Changeset,
  fileStats: Map<string, FileChange>
): Changeset {
  if (track === 'security') return changeset;
  return {
    files: trackFiles.map((f) => {
      const stat = fileStats.get(f);
      return {
        path: f,
        status: stat?.status ?? 'M',
        plus: stat?.plus ?? 0,
        minus: stat?.minus ?? 0,
      };
    }),
    totals: { files: trackFiles.length, plus: 0, minus: 0 },
  };
}

/**
 * @purpose Materialize PLAN.md + per-track task files + README.md/HISTORY.md into `dir`.
 * @invariant Idempotent re-run: a task file past `scaffolded` status is left untouched (stderr
 *   warning); README.md/HISTORY.md are created once, never rewritten; PLAN.md always regenerates.
 * @param dir Per-MR, per-head report directory (`mrReportsDir`).
 * @param ref MR reference `group/project!iid`.
 * @param headSha Resolved MR head SHA.
 * @param base Base SHA the diff was computed against.
 * @param plan Deterministic review plan (mode + tracks).
 * @param changeset File-level diff stats backing the Scope prefill.
 * @param [worktreePath] Local worktree to compute the Context-section from (AI-40/D-119);
 *   absent (e.g. reviewer.role.ts's current call site) degrades to the pre-existing FILL placeholder.
 * @returns PLAN.md path, all task files (created or pre-existing), the report dir, and the
 *   per-track injectedEntities from the buildTrackContext pass that filled the markdown.
 * @sideEffect FS: creates the report dir tree; always writes PLAN.md; writes task/README/HISTORY
 *   only when absent or still `scaffolded`. With `worktreePath`: spawns git subprocesses.
 * @consumer inbox-review-plan.cmd `run`, reviewer.role.ts `node_prepare` (TSK-122, exported
 *   for in-process reuse per SV-12, never spawned)
 */
export async function scaffoldReviewReports(
  dir: string,
  ref: string,
  headSha: string,
  base: string,
  plan: ReviewPlan,
  changeset: Changeset,
  worktreePath?: string
): Promise<ScaffoldResult> {
  const tasksDir = join(dir, 'tasks');
  mkdirSync(tasksDir, { recursive: true });

  const fileStats = new Map(changeset.files.map((f) => [f.path, f]));
  // contract is a mandatory OVERLAY vector, never folded into the inline review blob — its own
  // task file in both modes so the check runs as a distinct track over all changed contracts.
  const contractTracks = plan.tracks.filter((t) => t.name === 'contract');
  const partitionTracks = plan.tracks.filter((t) => t.name !== 'contract');
  const taskSpecs: { track: string; files: string[]; focus: string; taskPath: string }[] =
    plan.mode === 'inline'
      ? [
          {
            track: 'review',
            files: partitionTracks.flatMap((t) => t.files),
            focus: partitionTracks.map((t) => t.focus).join('; '),
            taskPath: join(tasksDir, 'review.task.md'),
          },
        ]
      : partitionTracks.map((t) => ({
          track: t.name,
          files: t.files,
          focus: t.focus,
          taskPath: join(tasksDir, `${t.name}.task.md`),
        }));
  for (const t of contractTracks) {
    taskSpecs.push({
      track: t.name,
      files: t.files,
      focus: t.focus,
      taskPath: join(tasksDir, `${t.name}.task.md`),
    });
  }

  // New head = fresh visit in the reused flat dir → refresh everything; same head → idempotent skip.
  const planPath = join(dir, 'PLAN.md');
  const priorPlanHead = existsSync(planPath)
    ? (parseDocument(readFileSync(planPath, 'utf8')).frontmatter.headSha as string | undefined)
    : undefined;
  const isNewHead = priorPlanHead !== undefined && priorPlanHead !== headSha;

  const tasks: string[] = [];
  const rows: { track: string; files: number; lines: number; focus: string; status: string }[] = [];
  const injectedEntities: Record<string, InjectedEntity[]> = {};

  // #region START_WRITE_TASK_FILES — skip-with-warning on filled files (same head); fresh on new head
  for (const spec of taskSpecs) {
    const existingStatus = readTaskStatus(spec.taskPath);
    if (!isNewHead && existingStatus && existingStatus !== 'scaffolded') {
      console.error(
        `⚠ ${spec.taskPath}: status=${existingStatus} — пропущен, не перезаписан (re-scaffold идемпотентен)`
      );
    } else {
      let contextMarkdown: string | undefined;
      if (worktreePath) {
        const scopedChangeset = scopeChangesetForTrack(
          spec.track,
          spec.files,
          changeset,
          fileStats
        );
        const context = await buildTrackContext(spec.track, scopedChangeset, base, worktreePath);
        contextMarkdown = context.markdown;
        injectedEntities[spec.track] = context.injectedEntities;
      }
      writeFileSync(
        spec.taskPath,
        renderTaskTemplate(
          ref,
          headSha,
          spec.track,
          spec.files,
          spec.focus,
          fileStats,
          contextMarkdown
        )
      );
    }
    tasks.push(spec.taskPath);
    rows.push({
      track: spec.track,
      files: spec.files.length,
      lines: spec.files.reduce(
        (n, f) => n + (fileStats.get(f)?.plus ?? 0) + (fileStats.get(f)?.minus ?? 0),
        0
      ),
      focus: spec.focus,
      status: existingStatus ?? 'scaffolded',
    });
  }
  // #endregion END_WRITE_TASK_FILES

  writeFileSync(
    planPath,
    renderPlanTemplate(ref, headSha, base, plan.mode, new Date().toISOString(), rows)
  );

  const readmePath = join(dir, 'README.md');
  if (isNewHead || !existsSync(readmePath)) writeFileSync(readmePath, README_TEMPLATE);

  const historyPath = join(dir, 'HISTORY.md');
  if (!existsSync(historyPath)) writeFileSync(historyPath, renderHistoryTemplate(ref));

  return { scaffolded: true, dir, plan: planPath, tasks, injectedEntities };
}

// #endregion END_SCAFFOLD_BUILDER

// #region START_VALIDATE

/** @purpose One schema violation found while validating a report dir; points at the offending file. */
export type ValidateError = {
  /** @purpose Path of the offending file */
  file: string;
  /** @purpose Human-readable violation description */
  error: string;
};

const VALID_KINDS = new Set([
  'new-line-comment',
  'reply-to-thread',
  'correction-reply',
  'awaiting-my-reply',
  'suggestion',
]);

const VALID_AXES = new Set([
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'NAT',
  'IDIOM',
  'LIT',
  'DEP',
  'GLOBAL',
  'TEST',
  'SEC',
  'BIZ',
  'TYPO',
  'CAUSE',
  'LAYER',
  'CHURN',
  'FIGHT',
  'RIPPLE',
  'INPUT',
  'PATH',
  'AUTHZ',
  'SECRET',
  'SUPPLY',
  'BLAST',
  'INJ',
]);

function validateSectionFilled(
  taskPath: string,
  body: string,
  heading: string,
  errors: ValidateError[]
): void {
  const section = extractSection(body, heading) ?? '';
  if (!section || /^<!--\s*FILL:/.test(section)) {
    errors.push({ file: taskPath, error: `## ${heading} is empty` });
    return;
  }
  if (/^n\/a\b/i.test(section) && !/^n\/a\s*[—-]\s*\S/i.test(section)) {
    errors.push({ file: taskPath, error: `## ${heading} has 'n/a' without a reason` });
  }
}

function validateCandidatesTable(taskPath: string, body: string, errors: ValidateError[]): void {
  const section = extractSection(body, 'Кандидаты') ?? '';
  const rows = section
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|'));

  if (rows.length === 0) {
    errors.push({ file: taskPath, error: 'Candidates table header missing' });
    return;
  }

  const header = rows[0]
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());
  if (header.join('|') !== CANDIDATES_COLUMNS.join('|')) {
    errors.push({
      file: taskPath,
      error: `Candidates header mismatch: expected [${CANDIDATES_COLUMNS.join(', ')}]`,
    });
    return;
  }

  // A dash/blank cell means "not applicable" — a no-candidate placeholder row is allowed.
  const isEmptyCell = (c: string) => c === '' || c === '—' || c === '-' || c === '–';

  for (const row of rows.slice(2)) {
    const cells = row
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.every(isEmptyCell)) continue;
    const [, , , , axis, kind] = cells;
    if (kind && !isEmptyCell(kind) && !VALID_KINDS.has(kind)) {
      errors.push({ file: taskPath, error: `invalid Kind token: ${kind}` });
    }
    if (axis && !isEmptyCell(axis) && !VALID_AXES.has(axis)) {
      errors.push({ file: taskPath, error: `invalid Ось token: ${axis}` });
    }
  }
}

function validateTaskFile(
  taskPath: string,
  stage: 'enriched' | 'filled',
  planHeadSha: string | undefined,
  errors: ValidateError[],
  requireWebResearch = false
): void {
  const { frontmatter, body } = parseDocument(readFileSync(taskPath, 'utf8'));

  const status = typeof frontmatter.status === 'string' ? frontmatter.status : undefined;
  const requiredStatuses = stage === 'enriched' ? ['enriched', 'filled'] : ['filled'];
  if (!status || !requiredStatuses.includes(status)) {
    errors.push({
      file: taskPath,
      error: `invalid status: expected one of [${requiredStatuses.join(', ')}], got ${status ?? 'missing'}`,
    });
  }

  const taskHeadSha = typeof frontmatter.headSha === 'string' ? frontmatter.headSha : undefined;
  if (planHeadSha && taskHeadSha !== planHeadSha) {
    errors.push({
      file: taskPath,
      error: `stale report: headSha ${taskHeadSha ?? 'missing'} does not match PLAN.md headSha ${planHeadSha}`,
    });
  }

  validateSectionFilled(taskPath, body, 'Контекст', errors);
  // Gated only when the caller's network toggle is on (AX_ENRICH_WEB_RESEARCH_SECTION).
  if (stage === 'enriched' && requireWebResearch) {
    validateSectionFilled(taskPath, body, 'Веб-исследование', errors);
  }
  if (stage === 'filled') {
    validateSectionFilled(taskPath, body, 'Находки', errors);
    validateSectionFilled(taskPath, body, 'Вердикт', errors);
    validateCandidatesTable(taskPath, body, errors);
  }

  if (findUnclosedMermaidBlock(body)) {
    errors.push({ file: taskPath, error: 'unclosed mermaid block' });
  }

  pushStopWordErrors(taskPath, body, errors);
}

/**
 * @purpose Scan an artifact body for banned words and add file-scoped errors with a replacement hint.
 * @param path Artifact path for the error location.
 * @param text Artifact body (code fences / inline code skipped by findStopWords).
 * @param errors Accumulator, mutated in place.
 */
function pushStopWordErrors(path: string, text: string, errors: ValidateError[]): void {
  for (const hit of findStopWords(text)) {
    errors.push({
      file: path,
      error: `стоп-слово «${hit.word}» (${hit.why}) на строке ${hit.line} — замени на «${hit.use}»`,
    });
  }
}

/**
 * @purpose Deterministic schema gate over a scaffolded report dir: structure/dictionaries only,
 *   never text length or quality (that is the directives' job, per D57).
 * @param dir Per-MR, per-head report directory to validate.
 * @param stage `enriched` gates dispatch (Context filled); `filled` gates synthesis (all sections).
 * @param [opts] `requireWebResearch` — enriched stage only, also gate on a web-research section.
 * @returns `{ ok: true }` or `{ ok: false, errors }` — one entry per violation, file-scoped.
 * @sideEffect Reads PLAN.md and every `tasks/*.task.md` file under `dir`.
 * @consumers inbox-review-plan.cmd `run`, ArtifactValidator (agent-inbox, TSK-113)
 */
export function validateReviewReports(
  dir: string,
  stage: 'enriched' | 'filled',
  opts?: { requireWebResearch?: boolean }
): { ok: true } | { ok: false; errors: ValidateError[] } {
  const errors: ValidateError[] = [];

  const planPath = join(dir, 'PLAN.md');
  if (!existsSync(planPath)) {
    return { ok: false, errors: [{ file: planPath, error: 'PLAN.md missing' }] };
  }
  const { frontmatter: planFrontmatter } = parseDocument(readFileSync(planPath, 'utf8'));
  const planHeadSha =
    typeof planFrontmatter.headSha === 'string' ? planFrontmatter.headSha : undefined;

  const tasksDir = join(dir, 'tasks');
  const taskFiles = existsSync(tasksDir)
    ? readdirSync(tasksDir)
        .filter((f) => f.endsWith('.task.md'))
        .map((f) => join(tasksDir, f))
    : [];

  if (taskFiles.length === 0) {
    errors.push({ file: tasksDir, error: 'no task files found' });
  }

  for (const taskPath of taskFiles) {
    validateTaskFile(taskPath, stage, planHeadSha, errors, opts?.requireWebResearch ?? false);
  }

  // #region START_VALIDATE_README_DIAGRAM — synthesis must carry a diagram, never just prose.
  // Comprehension is the reviewer's #1 challenge (Bacchelli & Bird 2013) — forces ≥1 diagram (D59).
  if (stage === 'filled') {
    const readmePath = join(dir, 'README.md');
    if (!existsSync(readmePath)) {
      errors.push({ file: readmePath, error: 'README.md missing (synthesis not written)' });
    } else {
      const readme = readFileSync(readmePath, 'utf8');
      if (findUnclosedMermaidBlock(readme)) {
        errors.push({ file: readmePath, error: 'unclosed mermaid block' });
      }
      if (!hasClosedMermaidBlock(readme)) {
        errors.push({
          file: readmePath,
          error:
            'no diagram: README must contain ≥1 ```mermaid block (## Архитектура — карта изменения, не проза; даже одна строка → минимальный граф)',
        });
      }
      const arch = extractSection(readme, 'Архитектура') ?? '';
      if (!arch || /^<!--\s*FILL:/.test(arch)) {
        errors.push({ file: readmePath, error: '## Архитектура is empty (synthesis incomplete)' });
      }
      validateSectionFilled(readmePath, readme, 'Поведение', errors);
      validateSectionFilled(readmePath, readme, 'Сценарии', errors);
      pushStopWordErrors(readmePath, readme, errors);
    }
  }
  // #endregion END_VALIDATE_README_DIAGRAM

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

// #endregion END_VALIDATE

// #region START_MAIN

function resolveHeadSha(worktreePath: string): string {
  return execFileSync('git', ['-C', worktreePath, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
    stdio: 'pipe',
  }).trim();
}

async function runScaffold(argv: string[]): Promise<number> {
  const worktreePath = getFlagValue(argv, '--path');
  const baseSha = getFlagValue(argv, '--base');
  const ref = getFlagValue(argv, '--ref');

  if (!worktreePath || !baseSha || !ref) {
    console.error(
      JSON.stringify({
        ok: false,
        error: 'INVALID_ARGS',
        detail:
          '--path <worktree>, --base <sha> and --ref <group/project!iid> required for --scaffold',
      })
    );
    return 1;
  }

  let changeset: Changeset;
  let headSha: string;
  try {
    changeset = computeChangeset(worktreePath, baseSha);
    headSha = resolveHeadSha(worktreePath);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(JSON.stringify({ ok: false, error: 'WORKTREE', detail: message }));
    return 1;
  }

  const plan = buildReviewPlan(changeset, computeContractChangedFiles(worktreePath, baseSha));
  const dir = mrReportsDir(resolveStateDir(argv), ref);
  const result = await scaffoldReviewReports(
    dir,
    ref,
    headSha,
    baseSha,
    plan,
    changeset,
    worktreePath
  );
  console.info(JSON.stringify(result));
  return 0;
}

function runValidate(argv: string[], dir: string): number {
  const stageArg = getFlagValue(argv, '--stage');
  const stage: 'enriched' | 'filled' = stageArg === 'enriched' ? 'enriched' : 'filled';
  const result = validateReviewReports(dir, stage);
  console.info(JSON.stringify(result));
  return result.ok ? 0 : 1;
}

/**
 * @purpose CLI entry for `inbox-review-plan`: dispatches --help / --scaffold / --validate / default-plan modes off `process.argv`.
 * @returns Process exit code — 0 on success, non-zero on argument, worktree, or validation errors.
 */
export async function run(): Promise<number> {
  const argv = process.argv.slice(2);

  if (hasFlag(argv, '--help')) {
    const b = (s: string) => `\x1b[1m${s}\x1b[0m`;
    console.info(b('gennady inbox-review-plan') + ' — детерминированный план ревью MR');
    console.info('');
    console.info('  ' + b('Использование:'));
    console.info(
      '    npx tsx ~/Developer/gennady/cli/gennady.ts inbox-review-plan --path <worktree> --base <sha>'
    );
    console.info(
      '    npx tsx ~/Developer/gennady/cli/gennady.ts inbox-review-plan --scaffold --path <worktree> --base <sha> --ref <group/project!iid>'
    );
    console.info(
      '    npx tsx ~/Developer/gennady/cli/gennady.ts inbox-review-plan --validate <dir> [--stage enriched|filled]'
    );
    console.info('');
    console.info('  ' + b('Флаги:'));
    console.info('    --path <worktree>   Путь к git worktree (из ответа inbox-context)');
    console.info('    --base <sha>        Базовый SHA для git diff (из ответа inbox-context)');
    console.info(
      '    --scaffold          Материализовать PLAN.md + tasks/*.task.md + README.md + HISTORY.md'
    );
    console.info('    --ref <ref>         MR-референс group/project!iid (требуется с --scaffold)');
    console.info(
      '    --validate <dir>    Проверить схему отчётного каталога (структура + словари)'
    );
    console.info('    --stage <stage>     enriched|filled (default filled) — только с --validate');
    console.info(
      '    --state-dir <dir>   Корень состояния, default ~/.gennady — только с --scaffold'
    );
    console.info('    --help              Этот текст');
    console.info('');
    console.info('  ' + b('Вывод:'));
    console.info(
      '    Без флагов: JSON с ReviewPlan: mode (inline|fan_out), tracks[] с name/focus/directive/files/lineCount.'
    );
    console.info('    --scaffold: { scaffolded: true, dir, plan, tasks: [...] }.');
    console.info(
      '    --validate: { ok: true } либо { ok: false, errors: [{ file, error }] }, exit ≠ 0 при ошибках.'
    );
    console.info(
      '    Агент механически диспетчерит сабагентов по трекам — ни одного решения не принимает.'
    );
    return 0;
  }

  const validateDir = getFlagValue(argv, '--validate');
  if (validateDir) return runValidate(argv, validateDir);

  if (hasFlag(argv, '--scaffold')) return await runScaffold(argv);

  const worktreePath = getFlagValue(argv, '--path');
  const baseSha = getFlagValue(argv, '--base');

  if (!worktreePath || !baseSha) {
    console.error(
      JSON.stringify({
        ok: false,
        error: 'INVALID_ARGS',
        detail: '--path <worktree> and --base <sha> required',
      })
    );
    return 1;
  }

  let changeset: Changeset;
  try {
    changeset = computeChangeset(worktreePath, baseSha);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(JSON.stringify({ ok: false, error: 'WORKTREE', detail: message }));
    return 1;
  }

  const plan = buildReviewPlan(changeset, computeContractChangedFiles(worktreePath, baseSha));
  console.info(JSON.stringify(plan));
  return 0;
}

// #endregion END_MAIN

// #region START_SELF_EXECUTING — invariant: self-executes only when file matches process.argv[1] (direct invocation)
if (process.argv[1]) {
  const selfPath = fileURLToPath(import.meta.url);
  if (selfPath === process.argv[1] || selfPath.endsWith(process.argv[1])) {
    process.exit(await run());
  }
}
// #endregion END_SELF_EXECUTING
