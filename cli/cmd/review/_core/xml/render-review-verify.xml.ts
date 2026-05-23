// @file: Сформировать итоговый XML для review-verify (template + артефакт + подстановки по проекту).
// @consumers: run-review-command.logic
// @tasks: N/A

import { buildAiFirstKnowledgeBlock } from '../logic/build-ai-first-knowledge-block.logic.ts';
import { buildVerifyCommandPlaceholders } from '../logic/build-ai-verify-placeholders.logic.ts';
import { loadReviewVerifyTemplate } from '../io/load-review-verify-template.io.ts';

/**
 * @purpose Сформировать итоговый XML для review-verify (template + артефакт + подстановки по проекту).
 * @consumer run-review-command.logic
 * @param reviewArtifactXml XML-артефакт ревью.
 * @param projectRoot Корень репозитория для поиска файлов знаний и детекторов команд (по умолчанию `process.cwd()`).
 * @returns Полный XML-промпт для review-verify.
 */
export async function renderReviewVerifyXml(
  reviewArtifactXml: string,
  projectRoot: string = process.cwd()
): Promise<string> {
  const template = await loadReviewVerifyTemplate();
  const verify = buildVerifyCommandPlaceholders(projectRoot);

  let result = template.replace('<!--Review_Audit_Artifact-->', reviewArtifactXml);
  result = result.replace('<!--ai:first-->', buildAiFirstKnowledgeBlock(projectRoot));
  result = result.replace('<!--ai:verify-axiom-hint-->', verify.axiomHint);
  result = result.replace('<!--ai:verify-tools-example-->', verify.toolsExample);
  result = result.replace('<!--ai:verify-step-commands-->', verify.verifyStep);
  return result;
}
