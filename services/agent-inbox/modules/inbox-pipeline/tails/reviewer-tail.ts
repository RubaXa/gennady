// @file: ReviewerTail — creates review summary for reviewer with decision recommendations, dedup hints, posting candidates
// @consumers: inbox-pipeline
// @tasks: TSK-161

import { logger } from '#logger';
import type { FindingEntry } from '../findings-journal.ts';

/** @purpose Summary of review for reviewer action */
export type ReviewerSummary = {
  /** @purpose MR reference */
  mr: string;
  /** @purpose Recommended verdict */
  recommendedVerdict: string;
  /** @purpose Total finding count */
  findingsCount: number;
  /** @purpose Consensus findings count */
  consensusCount: number;
  /** @purpose Disputed findings count */
  disputeCount: number;
  /** @purpose Unique (single-model) findings count */
  uniqueCount: number;
  /** @purpose Decision recommendations for the reviewer */
  recommendations: string[];
  /** @purpose Posting candidates — findings ready for discussion posting */
  postingCandidates: Array<{
    id: string;
    file: string;
    line: number;
    summary: string;
    mark: string;
    postingAction: 'post_new' | 'reply' | 'skip';
  }>;
};

/**
 * @purpose Prepares reviewer-facing summary with decision recommendations and posting candidates.
 * @invariant Summary is deterministic — same findings produce the same recommendations.
 * @invariant Disputed findings are surfaced for operator decision (not auto-posted).
 */
export class ReviewerTail {
  /**
   * @purpose Create a ReviewerTail instance.
   */
  constructor() {
    logger.debug('[ReviewerTail#constructor] [init → ready]');
  }

  /**
   * @purpose Prepare reviewer summary from synthesized findings.
   * @param mr MR reference (path!iid).
   * @param findings Synthesized finding entries with marks.
   * @param [existingThreads] Existing discussion threads for dedup (per spec §8).
   * @returns Structured reviewer summary with posting candidates.
   */
  prepare(
    mr: string,
    findings: FindingEntry[],
    existingThreads: Array<{ file?: string; line?: number; body: string }> = []
  ): ReviewerSummary {
    logger.debug('[ReviewerTail#prepare] [idle → preparing]', {
      mr,
      findingsCount: findings.length,
      existingThreads: existingThreads.length,
    });

    // #region START_MARK_COUNTS — aggregate findings by synthesis mark
    const consensusCount = findings.filter((f) => f.mark === 'consensus').length;
    const disputeCount = findings.filter((f) => f.mark === 'dispute').length;
    const uniqueCount = findings.filter((f) => f.mark === 'unique').length;
    // #endregion END_MARK_COUNTS

    // #region START_VERDICT_RECOMMENDATION — derive recommended verdict from finding severity and count
    let recommendedVerdict = 'COMMENT';
    const errorCount = findings.filter((f) => f.severity === 'error').length;
    if (errorCount > 0) {
      recommendedVerdict = 'REQUEST_CHANGES';
    } else if (findings.length > 0) {
      recommendedVerdict = 'COMMENT';
    } else {
      recommendedVerdict = 'APPROVE';
    }
    // #endregion END_VERDICT_RECOMMENDATION

    // #region START_DEDUP — skip findings already covered by existing threads
    const threadIndex = new Map<string, boolean>();
    for (const thread of existingThreads) {
      if (thread.file) {
        const key = `${thread.file}:${thread.line ?? 0}`;
        threadIndex.set(key, true);
      }
    }
    // #endregion END_DEDUP

    // #region START_POSTING_CANDIDATES — classify each finding for posting action
    const postingCandidates = findings.map((f) => {
      const threadKey = `${f.file}:${f.line}`;
      let postingAction: 'post_new' | 'reply' | 'skip';

      if (threadIndex.has(threadKey)) {
        postingAction = 'reply';
      } else if (f.mark === 'dispute') {
        postingAction = 'skip';
      } else {
        postingAction = 'post_new';
      }

      return {
        id: f.id,
        file: f.file,
        line: f.line,
        summary: f.summary,
        mark: f.mark ?? 'unique',
        postingAction,
      };
    });
    // #endregion END_POSTING_CANDIDATES

    // #region START_RECOMMENDATIONS — decision guidance for the reviewer
    const recommendations: string[] = [];
    if (disputeCount > 0) {
      recommendations.push(
        `⚡ ${disputeCount} спорных находок — требуется решение оператора (секция Находки в виджете)`
      );
    }
    if (consensusCount > 0) {
      recommendations.push(`✅ ${consensusCount} находок в консенсусе — готовы к постингу`);
    }
    if (uniqueCount > 0) {
      recommendations.push(`○ ${uniqueCount} уникальных находок — проверить перед постингом`);
    }
    // #endregion END_RECOMMENDATIONS

    logger.info('[ReviewerTail#prepare] [preparing → done]', {
      mr,
      recommendedVerdict,
      consensus: consensusCount,
      dispute: disputeCount,
      unique: uniqueCount,
    });

    return {
      mr,
      recommendedVerdict,
      findingsCount: findings.length,
      consensusCount,
      disputeCount,
      uniqueCount,
      recommendations,
      postingCandidates,
    };
  }
}
