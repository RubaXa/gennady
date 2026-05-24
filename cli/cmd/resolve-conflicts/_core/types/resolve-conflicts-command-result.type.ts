// @file: Resolve-conflicts execution result.
// @consumers: resolve-conflicts-command-run.logic
// @tasks: N/A

import type { ResolveConflictsArtifact } from './resolve-conflicts-artifact.type.ts';

/**
 * @purpose Resolve-conflicts execution result.
 * @consumer resolve-conflicts.cmd
 */
export type ResolveConflictsCommandResult = {
  /** @purpose Whether the command completed successfully. */
  ok: boolean;
  /** @purpose Process exit code (0 = success). */
  code: number;
  /** @purpose Optional text output produced by the command. */
  output?: string;
  /** @purpose Optional structured artifact from the resolve-conflicts pipeline. */
  artifact?: ResolveConflictsArtifact;
};
