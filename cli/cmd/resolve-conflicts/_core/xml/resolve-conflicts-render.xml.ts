import { buildAiFirstKnowledgeBlock } from '../../../_shared/prompt/logic/build-ai-first-knowledge-block.logic.ts';
import { buildVerifyCommandPlaceholders } from '../../../_shared/prompt/logic/build-ai-verify-placeholders.logic.ts';
import { loadResolveConflictsTemplate } from '../io/resolve-conflicts-template-load.io.ts';

/**
 * @purpose Сформировать итоговый XML для resolve-conflicts (template + артефакт + project placeholders).
 * @consumer resolve-conflicts-command-run.logic
 * @param resolveConflictsArtifactXml XML-артефакт merge conflicts.
 * @param projectRoot Корень репозитория для поиска знаний и verify-команд.
 * @returns Полный XML-промпт для resolve-conflicts.
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
