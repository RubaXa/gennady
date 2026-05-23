// @file: Собрать merge-контекст из git для генерации prompt resolve-conflicts.
// @consumers: resolve-conflicts-command-run.logic
// @tasks: N/A

import fs from 'node:fs';
import path from 'node:path';
import { getGitCurrentBranch, getGitRemote } from '../../../../../shared/backend/git/git-core.ts';
import { execSyncSafe } from '../../../../../shared/common/exec.ts';
import type { ResolveConflictsCommandArgs } from '../types/resolve-conflicts-command-args.type.ts';
import type {
  ResolveConflictsContextFile,
  ResolveConflictsContextGit,
} from '../types/resolve-conflicts-context-git.type.ts';

const CONFLICT_KIND_BY_STATUS: Record<string, string> = {
  DD: 'both-deleted',
  AU: 'added-by-current',
  UD: 'deleted-by-current',
  UA: 'added-by-incoming',
  DU: 'deleted-by-incoming',
  AA: 'both-added',
  UU: 'both-modified',
};

const UNMERGED_STATUSES = new Set(Object.keys(CONFLICT_KIND_BY_STATUS));

function parseCount(value: string): number {
  const count = Number.parseInt(value.trim(), 10);
  return Number.isFinite(count) ? count : 0;
}

function normalizeRefName(ref: string): string {
  return ref
    .trim()
    .replace(/^refs\/heads\//, '')
    .replace(/^remotes\//, '')
    .replace(/^origin\//, '')
    .replace(/\^0$/, '');
}

function resolveGitPath(entry: string): string {
  return execSyncSafe(`git rev-parse --git-path ${entry} 2>/dev/null`).trim();
}

function readGitStateFile(entry: string): string {
  const gitPath = resolveGitPath(entry);
  if (!gitPath) {
    return '';
  }

  try {
    if (!fs.existsSync(gitPath)) {
      return '';
    }

    return fs.readFileSync(gitPath, 'utf-8');
  } catch {
    return '';
  }
}

function parseIncomingBranchFromMergeMessage(mergeMessage: string): string | null {
  const firstLine = mergeMessage
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return null;
  }

  const patterns = [
    /Merge (?:remote-tracking )?branch '([^']+)'(?: into .+)?/i,
    /Merge branch '([^']+)' of [^\s]+/i,
    /Merge pull request #\d+ from [^/]+\/([^\s]+)/i,
  ];

  for (const pattern of patterns) {
    const match = firstLine.match(pattern);
    if (match?.[1]) {
      return normalizeRefName(match[1]);
    }
  }

  return null;
}

function resolveIncomingBranchFromHead(incomingHead: string): string | null {
  const nameRev = execSyncSafe(`git name-rev --name-only ${incomingHead} 2>/dev/null`).trim();
  if (!nameRev || nameRev === 'undefined') {
    return null;
  }

  const normalized = normalizeRefName(nameRev);
  return normalized || null;
}

function decodePorcelainPath(pathValue: string): string {
  if (pathValue.startsWith('"') && pathValue.endsWith('"')) {
    try {
      return JSON.parse(pathValue) as string;
    } catch {
      return pathValue.slice(1, -1);
    }
  }

  const renameSeparator = pathValue.lastIndexOf(' -> ');
  if (renameSeparator > 0) {
    return pathValue.slice(renameSeparator + 4);
  }

  return pathValue;
}

function parseUnmergedStatusByPath(statusOutput: string): Map<string, string> {
  const byPath = new Map<string, string>();

  for (const rawLine of statusOutput.split('\n')) {
    const line = rawLine.trimEnd();
    if (line.length < 4) {
      continue;
    }

    const status = line.slice(0, 2);
    if (!UNMERGED_STATUSES.has(status)) {
      continue;
    }

    const pathValue = decodePorcelainPath(line.slice(3).trim());
    if (!pathValue) {
      continue;
    }

    byPath.set(pathValue, status);
  }

  return byPath;
}

function buildResolveConflictsContextFile(
  pathValue: string,
  status: string
): ResolveConflictsContextFile {
  const absolutePath = path.join(process.cwd(), pathValue);
  const kind = CONFLICT_KIND_BY_STATUS[status] ?? 'unknown';

  try {
    const stat = fs.statSync(absolutePath);
    if (!stat.isFile()) {
      return {
        path: pathValue,
        status,
        kind,
        exists: false,
        binary: false,
        conflictRegions: 0,
      };
    }

    const content = fs.readFileSync(absolutePath);
    const binary = content.includes(0);
    const conflictRegions = binary
      ? 0
      : (content.toString('utf-8').match(/^<{7}(?: .+)?$/gm) ?? []).length;

    return {
      path: pathValue,
      status,
      kind,
      exists: true,
      binary,
      conflictRegions,
    };
  } catch {
    return {
      path: pathValue,
      status,
      kind,
      exists: false,
      binary: false,
      conflictRegions: 0,
    };
  }
}

/**
 * @purpose Собрать merge-контекст из git для генерации prompt resolve-conflicts.
 * @consumer resolve-conflicts-command-run.logic
 * @param args Аргументы запуска команды.
 * @throws {Error} Когда текущая директория не git-репозиторий, нет активного merge или нет конфликтов.
 * @returns ResolveConflictsContextGit.
 */
export function buildResolveConflictsContextGit(
  args: ResolveConflictsCommandArgs
): ResolveConflictsContextGit {
  const gitDir = execSyncSafe('git rev-parse --git-dir 2>/dev/null').trim();
  if (!gitDir) {
    throw new Error('Текущая директория не является git-репозиторием.');
  }

  const mergeHeadPath = resolveGitPath('MERGE_HEAD');
  if (!mergeHeadPath || !fs.existsSync(mergeHeadPath)) {
    throw new Error(
      'Нет активного merge (MERGE_HEAD не найден). Сначала запустите `git merge <branch>` и получите конфликты.'
    );
  }

  const mergeHeads = fs
    .readFileSync(mergeHeadPath, 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (mergeHeads.length === 0) {
    throw new Error('Файл MERGE_HEAD пуст. Повторите merge и попробуйте снова.');
  }

  if (mergeHeads.length > 1) {
    throw new Error(
      'Обнаружен octopus merge (несколько MERGE_HEAD). Команда поддерживает только merge одной ветки.'
    );
  }

  const incomingHead = mergeHeads[0];
  if (!incomingHead) {
    throw new Error('Не удалось определить incoming commit из MERGE_HEAD.');
  }

  const currentHead = execSyncSafe('git rev-parse HEAD 2>/dev/null').trim();
  if (!currentHead) {
    throw new Error('Не удалось определить текущий HEAD.');
  }

  const mergeBase = execSyncSafe(`git merge-base HEAD ${incomingHead} 2>/dev/null`).trim();
  if (!mergeBase) {
    throw new Error('Не удалось определить merge-base между HEAD и MERGE_HEAD.');
  }

  const conflictPaths = execSyncSafe('git diff --name-only --diff-filter=U 2>/dev/null')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (conflictPaths.length === 0) {
    throw new Error('Конфликтующие файлы не найдены (`git diff --diff-filter=U` пуст).');
  }

  const statusOutput = execSyncSafe('git status --porcelain --untracked-files=no 2>/dev/null');
  const statusByPath = parseUnmergedStatusByPath(statusOutput);

  const mergeMessage = readGitStateFile('MERGE_MSG').trim();
  const incomingBranch =
    args.incoming?.trim() ||
    parseIncomingBranchFromMergeMessage(mergeMessage) ||
    resolveIncomingBranchFromHead(incomingHead) ||
    incomingHead;

  const currentBranch = args.branch?.trim() || getGitCurrentBranch();
  const remote = getGitRemote();
  const currentOnlyCommits = parseCount(
    execSyncSafe(`git rev-list --count ${incomingHead}..HEAD 2>/dev/null`)
  );
  const incomingOnlyCommits = parseCount(
    execSyncSafe(`git rev-list --count HEAD..${incomingHead} 2>/dev/null`)
  );

  const conflictFiles = conflictPaths.map((pathValue) =>
    buildResolveConflictsContextFile(pathValue, statusByPath.get(pathValue) ?? 'UU')
  );

  return {
    currentBranch,
    incomingBranch,
    currentHead,
    incomingHead,
    mergeBase,
    mergeMessage,
    currentOnlyCommits,
    incomingOnlyCommits,
    remote,
    conflictFiles,
  };
}
