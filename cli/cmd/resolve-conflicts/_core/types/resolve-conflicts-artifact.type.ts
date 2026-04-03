import type { ResolveConflictsContextGit } from './resolve-conflicts-context-git.type.ts';

/**
 * @purpose Базовый артефакт команды resolve-conflicts: git-контекст и XML.
 * @consumer resolve-conflicts-command-run.logic
 */
export type ResolveConflictsArtifact = {
  resolveConflictsContextGit: ResolveConflictsContextGit;
  resolveConflictsArtifactXml: string;
};
