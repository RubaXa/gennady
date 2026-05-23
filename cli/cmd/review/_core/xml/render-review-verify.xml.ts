// @file: Build the final XML for review-verify (template + artifact + project substitutions).
// @consumers: run-review-command.logic
// @tasks: N/A

import { buildAiFirstKnowledgeBlock } from '../logic/build-ai-first-knowledge-block.logic.ts';
import { buildVerifyCommandPlaceholders } from '../logic/build-ai-verify-placeholders.logic.ts';
import { loadReviewVerifyTemplate } from '../io/load-review-verify-template.io.ts';

/**
 * @purpose Build the final XML for review-verify (template + artifact + project substitutions).
 * @param reviewArtifactXml Review XML artifact.
 * @param projectRoot Repository root for searching knowledge files and command detectors (default `process.cwd()`).
 * @returns Full XML prompt for review-verify.
 * @consumer run-review-command.logic
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
