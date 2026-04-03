import type { GitRemoteInfo } from '../../../../../shared/backend/git/git-core.ts';

/**
 * @purpose Описать один конфликтующий файл в merge-контексте.
 * @consumer resolve-conflicts-context-git-build.logic, resolve-conflicts-artifact-build.xml
 */
export type ResolveConflictsContextFile = {
  path: string;
  status: string;
  kind: string;
  exists: boolean;
  binary: boolean;
  conflictRegions: number;
};

/**
 * @purpose Собрать git-контекст для генерации prompt resolve-conflicts.
 * @consumer resolve-conflicts-command-run.logic
 */
export type ResolveConflictsContextGit = {
  currentBranch: string;
  incomingBranch: string;
  currentHead: string;
  incomingHead: string;
  mergeBase: string;
  mergeMessage: string;
  currentOnlyCommits: number;
  incomingOnlyCommits: number;
  remote: GitRemoteInfo | null;
  conflictFiles: ResolveConflictsContextFile[];
};
