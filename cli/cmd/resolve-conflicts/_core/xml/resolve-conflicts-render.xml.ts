// @file: Build the final XML for resolve-conflicts (template + artifact + project placeholders).
// @consumers: resolve-conflicts-command-run.logic
// @tasks: N/A

import { buildAiFirstKnowledgeBlock } from '../../../_shared/prompt/logic/build-ai-first-knowledge-block.logic.ts';
import { buildVerifyCommandPlaceholders } from '../../../_shared/prompt/logic/build-ai-verify-placeholders.logic.ts';
import { loadResolveConflictsTemplate } from '../io/resolve-conflicts-template-load.io.ts';

/**
 * @purpose Build the final XML for resolve-conflicts (template + artifact + project placeholders).
 * @param resolveConflictsArtifactXml Merge conflicts XML artifact.
 * @param [projectRoot] Repository root for searching knowledge and verify commands.
 * @returns Full XML prompt for resolve-conflicts.
 * @consumer resolve-conflicts-command-run.logic
 */
export async function renderResolveConflictsXml(
  resolveConflictsArtifactXml: string,
  projectRoot: string = process.cwd()
): Promise<string> {
  const template = await loadResolveConflictsTemplate();
  const verify = buildVerifyCommandPlaceholders(projectRoot);

  let result = template.replace('<!--Resolve_Conflicts_Artifact-->', resolveConflictsArtifactXml);
  result = result.replace('<!--ai:first-->', buildAiFirstKnowledgeBlock(projectRoot));
  result = result.replace('<!--ai:verify-axiom-hint-->', verify.axiomHint);
  result = result.replace('<!--ai:verify-tools-example-->', verify.toolsExample);
  result = result.replace('<!--ai:verify-step-commands-->', verify.verifyStep);
  return result;
}
