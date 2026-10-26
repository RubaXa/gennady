// @file: Data-only host evidence for bounded execution semantic review.
// @spec: AI-SKILLS
// @consumers: execution fixture capture, SddEvalJudge

/** @purpose Host-captured execution evidence; collection, integrity checks and deterministic grading remain outside the judge. */
export type ExecutionJudgeEvidence = {
  /** @purpose Host certifies required evidence is available and untruncated; false prevents a model call. */
  complete: boolean;
  /** @purpose Frozen host terminal target, never worker acceptance or newly granted authority. */
  expectedTerminal: 'complete' | 'product-boundary' | 'authority-boundary' | 'decision-review';
  /** @purpose Captured files supplied as untrusted evidence, never filesystem lookup instructions. */
  files: Array<{ path: string; content: string }>;
  /** @purpose Host-observed facts supplied separately from worker narration and file claims. */
  facts: string[];
};
