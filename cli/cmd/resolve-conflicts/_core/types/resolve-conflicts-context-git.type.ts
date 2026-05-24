// @file: Describe a single conflicting file in the merge context.
// @consumers: resolve-conflicts-artifact-build.xml, resolve-conflicts-artifact.type, resolve-conflicts-context-git-build.logic
// @tasks: N/A

import type { GitRemoteInfo } from '../../../../../shared/backend/git/git-core.ts';

/**
 * @purpose Describe a single conflicting file in the merge context.
 * @consumer resolve-conflicts-context-git-build.logic, resolve-conflicts-artifact-build.xml
 */
export type ResolveConflictsContextFile = {
  /** @purpose File path relative to repository root. */
  path: string;
  /** @purpose Git file status (e.g. "modified", "both modified"). */
  status: string;
  /** @purpose Kind of conflict (e.g. "content", "rename"). */
  kind: string;
  /** @purpose Whether the file exists on disk. */
  exists: boolean;
  /** @purpose Whether the file is binary. */
  binary: boolean;
  /** @purpose Number of conflict marker regions in the file. */
  conflictRegions: number;
};

/**
 * @purpose Build git context for resolve-conflicts prompt generation.
 * @consumer resolve-conflicts-command-run.logic
 */
export type ResolveConflictsContextGit = {
  /** @purpose Current branch name. */
  currentBranch: string;
  /** @purpose Incoming branch name to merge. */
  incomingBranch: string;
  /** @purpose HEAD SHA of the current branch. */
  currentHead: string;
  /** @purpose HEAD SHA of the incoming branch. */
  incomingHead: string;
  /** @purpose Merge base commit SHA. */
  mergeBase: string;
  /** @purpose Merge commit message. */
  mergeMessage: string;
  /** @purpose Number of commits unique to the current branch. */
  currentOnlyCommits: number;
  /** @purpose Number of commits unique to the incoming branch. */
  incomingOnlyCommits: number;
  /** @purpose Remote repository info (null if no remote configured). */
  remote: GitRemoteInfo | null;
  /** @purpose List of conflicting files in the merge context. */
  conflictFiles: ResolveConflictsContextFile[];
};
