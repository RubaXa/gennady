import { loadReviewVerifyTemplate } from '../io/load-review-verify-template.io.ts';

/**
 * @purpose Сформировать итоговый XML для review-verify (template + артефакт).
 * @consumer run-review-command.logic
 * @param reviewArtifactXml XML-артефакт ревью.
 * @returns Полный XML-промпт для review-verify.
 */
export async function renderReviewVerifyXml(reviewArtifactXml: string): Promise<string> {
  const template = await loadReviewVerifyTemplate();
  return template.replace('<!--Review_Audit_Artifact-->', reviewArtifactXml);
}
