// @file: Base artifact of the resolve-conflicts command: git context and XML.
// @consumers: resolve-conflicts-command-result.type
// @tasks: N/A

import type { ResolveConflictsContextGit } from './resolve-conflicts-context-git.type.ts';

/**
 * @purpose Base artifact of the resolve-conflicts command: git context and XML.
 * @consumer resolve-conflicts-command-run.logic
 */
export type ResolveConflictsArtifact = {
  /** @purpose Git context for resolve-conflicts prompt generation. */
  resolveConflictsContextGit: ResolveConflictsContextGit;
  /** @purpose XML artifact generated from the resolve-conflicts pipeline. */
  resolveConflictsArtifactXml: string;
};
