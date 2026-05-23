// @file: Base artifact of review commands: MR + discussions + XML.
// @consumers: review-command-result.type
// @tasks: N/A

import type { ReviewContextMr } from './review-context-mr.type.ts';
import type { ReviewContextMrDiscussion } from './review-context-mr.type.ts';

/**
 * @purpose Base artifact of review commands: MR + discussions + XML.
 * @consumer run-review-command.logic
 */
export type ReviewArtifact = {
  mergeRequest: ReviewContextMr;
  discussions: ReviewContextMrDiscussion[];
  reviewArtifactXml: string;
};
