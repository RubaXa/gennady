// @file: Resolve-conflicts execution result.
// @consumers: resolve-conflicts-command-run.logic
// @tasks: N/A

import type { ResolveConflictsArtifact } from './resolve-conflicts-artifact.type.ts';

/**
 * @purpose Resolve-conflicts execution result.
 * @consumer resolve-conflicts.cmd
 */
export type ResolveConflictsCommandResult = {
  ok: boolean;
  code: number;
  output?: string;
  artifact?: ResolveConflictsArtifact;
};
