// @file: Build the final XML for review-issues (artifact only).
// @spec: CLI-REVIEW
// @consumers: run-review-command.logic

/**
 * @purpose Build the final XML for review-issues (artifact only).
 * @param reviewArtifactXml Review XML artifact.
 * @returns XML artifact without template.
 * @consumer run-review-command.logic
 */
export function renderReviewIssuesXml(reviewArtifactXml: string): string {
  return reviewArtifactXml;
}
