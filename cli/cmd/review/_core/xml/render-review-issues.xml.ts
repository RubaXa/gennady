// @file: Сформировать итоговый XML для review-issues (только артефакт).
// @consumers: run-review-command.logic
// @tasks: N/A

/**
 * @purpose Сформировать итоговый XML для review-issues (только артефакт).
 * @consumer run-review-command.logic
 * @param reviewArtifactXml XML-артефакт ревью.
 * @returns XML-артефакт без шаблона.
 */
export function renderReviewIssuesXml(reviewArtifactXml: string): string {
  return reviewArtifactXml;
}
