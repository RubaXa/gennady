import type { ReviewContextMr } from './review-context-mr.type.ts';
import type { ReviewContextMrDiscussion } from './review-context-mr.type.ts';

/**
 * @purpose Базовый артефакт review-команд: MR + discussions + XML.
 * @consumer run-review-command.logic
 */
export type ReviewArtifact = {
  mergeRequest: ReviewContextMr;
  discussions: ReviewContextMrDiscussion[];
  reviewArtifactXml: string;
};
