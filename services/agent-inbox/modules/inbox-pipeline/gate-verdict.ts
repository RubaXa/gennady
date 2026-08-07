// @file: GateVerdict — validates review.json completeness per §2.1 criteria: verdict present, findings have file:line, no empty review, max 2 attempts
// @consumers: inbox-pipeline
// @tasks: TSK-161

import { logger } from '#logger';

/** @purpose Review verdict status */
export type ReviewVerdictStatus = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';

/** @purpose A finding entry in review.json */
export type ReviewFinding = {
  /** @purpose Finding identifier */
  id: string;
  /** @purpose Severity */
  severity: string;
  /** @purpose File path */
  file?: string;
  /** @purpose Line number */
  line?: number;
  /** @purpose Finding summary */
  summary?: string;
  /** @purpose Source models */
  source?: Array<{ model: string; runId: string }>;
  /** @purpose Synthesis mark */
  mark?: string;
};

/** @purpose review.json schema expected by gate_verdict */
export type ReviewJson = {
  /** @purpose Overall review verdict */
  verdict?: ReviewVerdictStatus;
  /** @purpose Review revision number */
  revision?: number;
  /** @purpose Synthesized findings */
  findings?: ReviewFinding[];
};

/** @purpose Result of gate_verdict validation */
export type VerdictGateResult = {
  /** @purpose Gate outcome */
  status: 'pass' | 'fail';
  /** @purpose Reasons for failure — empty when passing */
  reasons: string[];
};

// #region START_VALIDATION_CRITERIA — §2.1 contract: verdict present, each finding has file:line, no empty review
// purpose: ensures review.json is complete and consumable before proceeding to tails

const SECTION_2_1_CRITERIA: ReadonlyArray<{
  id: string;
  description: string;
  check: (review: ReviewJson) => boolean;
}> = [
  {
    id: 'S2_1_VERDICT_PRESENT',
    description: 'verdict присутствует',
    check: (r) => r.verdict != null && VALID_VERDICTS.has(r.verdict),
  },
  {
    id: 'S2_1_FINDINGS_HAVE_FILE_LINE',
    description: 'каждая находка F-n имеет file:line и summary',
    check: (r) =>
      (r.findings ?? []).every(
        (f) =>
          f.id != null &&
          f.file != null &&
          f.file !== '' &&
          f.line != null &&
          f.summary != null &&
          f.summary !== ''
      ),
  },
  {
    id: 'S2_1_NO_EMPTY_REVIEW',
    description: 'не пустой review (findings массив не null/undefined)',
    check: (r) => Array.isArray(r.findings),
  },
  {
    id: 'S2_1_REVISION_PRESENT',
    description: 'revision присутствует (целое ≥ 1)',
    check: (r) => r.revision != null && Number.isInteger(r.revision) && r.revision >= 1,
  },
];

const VALID_VERDICTS = new Set<ReviewVerdictStatus>([
  'APPROVE',
  'REQUEST_CHANGES',
  'COMMENT',
]);

// #endregion END_VALIDATION_CRITERIA

/**
 * @purpose Final review gate — validates review.json completeness per §2.1 criteria.
 * @invariant Max 2 validation attempts before escalation to operator.
 * @invariant Fail returns specific reasons for retry — allows synthesize to fix issues.
 */
export class GateVerdict {
  /** @purpose Number of validation attempts made */
  protected _attemptCount: number;

  /**
   * @purpose Create a GateVerdict with zero attempts.
   */
  constructor() {
    this._attemptCount = 0;
    logger.debug('[GateVerdict#constructor] [init → ready]');
  }

  /**
   * @purpose Validate review.json against §2.1 completeness criteria.
   * @param reviewJson Parsed review.json object.
   * @returns VerdictGateResult with pass/fail status and failure reasons.
   */
  validate(reviewJson: ReviewJson): VerdictGateResult {
    this._attemptCount += 1;
    logger.debug('[GateVerdict#validate] [idle → validating]', {
      attempt: this._attemptCount,
      findingsCount: reviewJson.findings?.length ?? 0,
    });

    // #region START_CRITERIA_CHECK — run each §2.1 criterion, collect failures
    const reasons: string[] = [];
    for (const criterion of SECTION_2_1_CRITERIA) {
      try {
        if (!criterion.check(reviewJson)) {
          reasons.push(`${criterion.id}: ${criterion.description}`);
        }
      } catch {
        reasons.push(`${criterion.id}: ${criterion.description} (check threw)`);
      }
    }
    // #endregion END_CRITERIA_CHECK

    const status = reasons.length === 0 ? 'pass' : 'fail';

    if (status === 'fail') {
      logger.warn('[GateVerdict#validate] [validating → fail]', {
        reasons,
        attemptCount: this._attemptCount,
      });

      // #region START_ESCALATION_CHECK — max 2 attempts, then escalate
      if (this._attemptCount >= 2) {
        logger.error('[GateVerdict#validate] [validating → escalation]', {
          maxAttempts: 2,
          finalReasons: reasons,
        });
      }
      // #endregion END_ESCALATION_CHECK
    } else {
      logger.info('[GateVerdict#validate] [validating → pass]');
    }

    return { status, reasons };
  }

  /**
   * @purpose Check whether escalation is triggered (attempts exhausted).
   * @returns true when validation has been attempted ≥ 2 times and is still failing.
   */
  isEscalated(): boolean {
    return this._attemptCount >= 2;
  }

  /**
   * @purpose Reset attempt count for a new review cycle.
   */
  reset(): void {
    this._attemptCount = 0;
    logger.debug('[GateVerdict#reset] [any → ready]');
  }
}
