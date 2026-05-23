// @file: Base artifact of the resolve-conflicts command: git context and XML.
// @consumers: resolve-conflicts-command-result.type
// @tasks: N/A

import type { ResolveConflictsContextGit } from './resolve-conflicts-context-git.type.ts';

/**
 * @purpose Base artifact of the resolve-conflicts command: git context and XML.
 * @consumer resolve-conflicts-command-run.logic
 */
export type ResolveConflictsArtifact = {
  resolveConflictsContextGit: ResolveConflictsContextGit;
  resolveConflictsArtifactXml: string;
};
