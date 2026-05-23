// @file: Build the final XML for review-issues (artifact only).
// @consumers: run-review-command.logic
// @tasks: N/A

/**
 * @purpose Build the final XML for review-issues (artifact only).
 * @param reviewArtifactXml Review XML artifact.
 * @returns XML artifact without template.
 * @consumer run-review-command.logic
 */
export function renderReviewIssuesXml(reviewArtifactXml: string): string {
  return reviewArtifactXml;
}
