// @file: review-plan command — deterministic file-to-track classification for fan-out review.
// @consumers: agent-inbox-take skill, agent-inbox skill
// @tasks: TSK-102

import { execFileSync } from 'node:child_process';

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
  const numstat = execFileSync(
    'git',
    ['-C', worktreePath, 'diff', '--numstat', `${baseSha}..HEAD`],
    { encoding: 'utf8' }
  ).trim();
  const nameStatus = execFileSync(
    'git',
    ['-C', worktreePath, 'diff', '--name-status', `${baseSha}..HEAD`],
    { encoding: 'utf8' }
  ).trim();

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

// #region START_REVIEW_PLAN_TYPES

type ReviewTrack = {
  name: string;
  files: string[];
  lineCount: number;
  focus: string;
  directive: 'arch-interrogation + code-interrogation' | 'code-interrogation';
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

const TRACK_RULES: Record<string, { patterns: RegExp[]; focus: string; directive: ReviewTrack['directive'] }> = {
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
  /auth/i, /token/i, /secret/i, /password/i, /credential/i,
  /crypto/i, /permission/i, /acl/i, /rbac/i, /oauth/i,
  /jwt/i, /session/i, /csrf/i, /xss/i, /sanitiz/i, /escap/i,
  /cipher/i, /encrypt/i, /decrypt/i, /hash/i, /salt/i,
  /cert/i, /ssl/i, /tls/i, /key/i,
];

function isSecurityFile(path: string): boolean {
  return SECURITY_PATTERNS.some((r) => r.test(path));
}

function classifyTrack(path: string): string {
  for (const [track, rules] of Object.entries(TRACK_RULES)) {
    if (rules.patterns.some((r) => r.test(path))) return track;
  }
  return 'logic';
}

function getTrackFocus(track: string): string {
  if (track === 'security') return 'SEC+INPUT+AUTHZ+SECRET+SUPPLY+BLAST+INJ probes';
  return TRACK_RULES[track]?.focus ?? 'NAT+IDIOM+LIT+DEP+GLOBAL+BIZ+TYPO probes';
}

function getTrackDirective(track: string): ReviewTrack['directive'] {
  if (track === 'security') return 'arch-interrogation + code-interrogation';
  return TRACK_RULES[track]?.directive ?? 'arch-interrogation + code-interrogation';
}

// #endregion END_TRACK_CLASSIFICATION

// #region START_PLAN_BUILDER

const INLINE_MAX_FILES = 6;
const INLINE_MAX_LINES = 300;

function buildReviewPlan(changeset: Changeset): ReviewPlan {
  const tracks = new Map<string, { files: string[]; lineCount: number }>();

  for (const file of changeset.files) {
    let track = classifyTrack(file.path);
    if (track === 'logic' && isSecurityFile(file.path)) {
      track = 'security';
    }
    const entry = tracks.get(track) ?? { files: [], lineCount: 0 };
    entry.files.push(file.path);
    entry.lineCount += file.plus + file.minus;
    tracks.set(track, entry);
  }

  const meaningfulTracks = [...tracks.entries()].filter(
    ([name]) => name !== 'docs' && name !== 'config' && name !== 'assets'
  );

  const mode =
    changeset.totals.files <= INLINE_MAX_FILES &&
    changeset.totals.plus <= INLINE_MAX_LINES &&
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

// #region START_MAIN

async function run(): Promise<number> {
  const argv = process.argv.slice(2);

  if (hasFlag(argv, '--help')) {
    const b = (s: string) => `\x1b[1m${s}\x1b[0m`;
    console.info(b('gennady inbox-review-plan') + ' — детерминированный план ревью MR');
    console.info('');
    console.info('  ' + b('Использование:'));
    console.info('    npx tsx ~/Developer/gennady/cli/gennady.ts inbox-review-plan --path <worktree> --base <sha>');
    console.info('');
    console.info('  ' + b('Флаги:'));
    console.info('    --path <worktree>  Путь к git worktree (из ответа inbox-context)');
    console.info('    --base <sha>        Базовый SHA для git diff (из ответа inbox-context)');
    console.info('    --help              Этот текст');
    console.info('');
    console.info('  ' + b('Вывод:'));
    console.info('    JSON с ReviewPlan: mode (inline|fan_out), tracks[] с name/focus/directive/files/lineCount.');
    console.info('    Агент механически диспетчерит сабагентов по трекам — ни одного решения не принимает.');
    return 0;
  }

  const worktreePath = getFlagValue(argv, '--path');
  const baseSha = getFlagValue(argv, '--base');

  if (!worktreePath || !baseSha) {
    console.error(
      JSON.stringify({ ok: false, error: 'INVALID_ARGS', detail: '--path <worktree> and --base <sha> required' })
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

  const plan = buildReviewPlan(changeset);
  console.info(JSON.stringify(plan));
  return 0;
}

process.exit(await run());

// #endregion END_MAIN
