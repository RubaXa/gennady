// @file: AuthorTail — prepares author notification with findings summary, MR context, review verdict
// @consumers: inbox-pipeline
// @tasks: TSK-161

import { logger } from '#logger';
import type { FindingEntry } from '../findings-journal.ts';

/** @purpose Summary of review findings for author notification */
export type AuthorNotification = {
  /** @purpose MR reference */
  mr: string;
  /** @purpose Review verdict */
  verdict: string;
  /** @purpose Total finding count */
  findingsCount: number;
  /** @purpose Findings by severity */
  bySeverity: { error: number; warning: number; info: number };
  /** @purpose Top findings summary (first 5 by severity) */
  topFindings: Array<{
    id: string;
    file: string;
    line: number;
    summary: string;
    severity: string;
  }>;
  /** @purpose Proposed replies for author action */
  proposedReplies: string[];
};

/**
 * @purpose Prepares author-facing notification with review findings summary and proposed replies.
 * @invariant Notification is deterministic — same findings produce the same summary.
 */
export class AuthorTail {
  /**
   * @purpose Create an AuthorTail instance.
   */
  constructor() {
    logger.debug('[AuthorTail#constructor] [init → ready]');
  }

  /**
   * @purpose Prepare author notification from synthesized findings and review verdict.
   * @param mr MR reference (path!iid).
   * @param verdict Overall review verdict (APPROVE | REQUEST_CHANGES | COMMENT).
   * @param findings Synthesized finding entries.
   * @returns Structured author notification.
   */
  prepare(mr: string, verdict: string, findings: FindingEntry[]): AuthorNotification {
    logger.debug('[AuthorTail#prepare] [idle → preparing]', {
      mr,
      verdict,
      findingsCount: findings.length,
    });

    // #region START_SEVERITY_COUNT — aggregate findings by severity level
    const bySeverity = { error: 0, warning: 0, info: 0 };
    for (const f of findings) {
      if (f.severity === 'error') bySeverity.error += 1;
      else if (f.severity === 'warning') bySeverity.warning += 1;
      else bySeverity.info += 1;
    }
    // #endregion END_SEVERITY_COUNT

    // #region START_TOP_FINDINGS — select top 5 findings ordered by severity (error > warning > info)
    const severityOrder = { error: 0, warning: 1, info: 2 };
    const sorted = [...findings].sort(
      (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
    );
    const topFindings = sorted.slice(0, 5).map((f) => ({
      id: f.id,
      file: f.file,
      line: f.line,
      summary: f.summary,
      severity: f.severity,
    }));
    // #endregion END_TOP_FINDINGS

    // #region START_PROPOSED_REPLIES — generate action-oriented reply suggestions
    const proposedReplies: string[] = [];
    if (verdict === 'APPROVE') {
      proposedReplies.push('👍 Реакция на утверждение — без действий');
    }
    if (verdict === 'REQUEST_CHANGES') {
      proposedReplies.push('🔧 Проверить исправления по замечаниям выше');
    }
    if (findings.some((f) => f.mark === 'dispute')) {
      proposedReplies.push('💬 Спорные находки — требуется решение');
    }
    // #endregion END_PROPOSED_REPLIES

    logger.info('[AuthorTail#prepare] [preparing → done]', {
      mr,
      errors: bySeverity.error,
      warnings: bySeverity.warning,
    });

    return {
      mr,
      verdict,
      findingsCount: findings.length,
      bySeverity,
      topFindings,
      proposedReplies,
    };
  }
}
