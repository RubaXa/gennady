// @file: Describe a single conflicting file in the merge context.
// @consumers: resolve-conflicts-artifact-build.xml, resolve-conflicts-artifact.type, resolve-conflicts-context-git-build.logic
// @tasks: N/A

import type { GitRemoteInfo } from '../../../../../shared/backend/git/git-core.ts';

/**
 * @purpose Describe a single conflicting file in the merge context.
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
 * @purpose Build git context for resolve-conflicts prompt generation.
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
