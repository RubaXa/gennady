// @file: Результат выполнения resolve-conflicts.
// @consumers: resolve-conflicts-command-run.logic
// @tasks: N/A

import type { ResolveConflictsArtifact } from './resolve-conflicts-artifact.type.ts';

/**
 * @purpose Результат выполнения resolve-conflicts.
 * @consumer resolve-conflicts.cmd
 */
export type ResolveConflictsCommandResult = {
  ok: boolean;
  code: number;
  output?: string;
  artifact?: ResolveConflictsArtifact;
};
