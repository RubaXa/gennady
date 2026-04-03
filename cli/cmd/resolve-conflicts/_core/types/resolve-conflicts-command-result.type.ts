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
