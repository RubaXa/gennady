// @file: Собрать дерево XmlNode артефакта resolve-conflicts из git-контекста merge.
// @consumers: resolve-conflicts-command-run.logic
// @tasks: N/A

import { serializeXmlNode } from '../../../../../shared/common/xml.ts';
import type { XmlNode } from '../../../../../shared/common/xml.ts';
import type { ResolveConflictsContextGit } from '../types/resolve-conflicts-context-git.type.ts';

function shortSha(sha: string): string {
  return sha ? sha.slice(0, 12) : '';
}

/**
 * @purpose Собрать дерево XmlNode артефакта resolve-conflicts из git-контекста merge.
 * @consumer resolve-conflicts-artifact-build.xml
 * @param resolveConflictsContextGit Контекст merge и конфликтующих файлов.
 * @returns Корневой XmlNode (tag: Merge_Conflict_Context).
 */
export function createResolveConflictsArtifactXmlNode(
  resolveConflictsContextGit: ResolveConflictsContextGit
): XmlNode {
  const files = resolveConflictsContextGit.conflictFiles.map(
    (conflictFile): XmlNode => ({
      tag: 'File',
      attrs: {
        path: conflictFile.path,
        status: conflictFile.status,
        kind: conflictFile.kind,
        conflictRegions: String(conflictFile.conflictRegions),
        binary: conflictFile.binary ? 'true' : 'false',
        exists: conflictFile.exists ? 'true' : 'false',
      },
    })
  );

  return {
    tag: 'Merge_Conflict_Context',
    attrs: {
      host: resolveConflictsContextGit.remote?.host ?? '',
      target_repo: resolveConflictsContextGit.remote?.project ?? '',
      current_branch: resolveConflictsContextGit.currentBranch,
      incoming_branch: resolveConflictsContextGit.incomingBranch,
      current_head: shortSha(resolveConflictsContextGit.currentHead),
      incoming_head: shortSha(resolveConflictsContextGit.incomingHead),
      merge_base: shortSha(resolveConflictsContextGit.mergeBase),
    },
    children: [
      {
        tag: 'Meta',
        children: [
          {
            tag: 'Task_Objective',
            children:
              'Resolve merge conflicts with intent preservation and confidence-aware decision mode.',
          },
          {
            tag: 'Merge_Message',
            children: { cdata: resolveConflictsContextGit.mergeMessage || '' },
          },
          {
            tag: 'Divergence',
            attrs: {
              currentOnlyCommits: String(resolveConflictsContextGit.currentOnlyCommits),
              incomingOnlyCommits: String(resolveConflictsContextGit.incomingOnlyCommits),
            },
          },
        ],
      },
      {
        tag: 'Conflict_Files',
        attrs: {
          count: String(resolveConflictsContextGit.conflictFiles.length),
        },
        children: files,
      },
    ],
  };
}

/**
 * @purpose Построить XML-артефакт для resolve-conflicts.
 * @consumer resolve-conflicts-command-run.logic
 * @param resolveConflictsContextGit Git-контекст merge.
 * @returns Строка XML (Merge_Conflict_Context).
 */
export function buildResolveConflictsArtifactXml(
  resolveConflictsContextGit: ResolveConflictsContextGit
): string {
  const rootNode = createResolveConflictsArtifactXmlNode(resolveConflictsContextGit);
  return serializeXmlNode(rootNode);
}
