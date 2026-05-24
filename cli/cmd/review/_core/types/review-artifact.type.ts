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
  /** @purpose MR context used for review artifact generation. */
  mergeRequest: ReviewContextMr;
  /** @purpose Discussions on the MR. */
  discussions: ReviewContextMrDiscussion[];
  /** @purpose XML artifact generated from the review pipeline. */
  reviewArtifactXml: string;
};
