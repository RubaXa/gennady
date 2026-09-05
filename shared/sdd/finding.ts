// @file: Shared SDD mechanical finding shape.
// @consumers: check, requirement-budget, focused SDD checks
// @tasks: N/A

/** @purpose One audit finding; errors fail the gate while warnings remain advisory. */
export type Finding = {
  /** @purpose Finding severity. */
  severity: 'error' | 'warn';
  /** @purpose Stable finding code. */
  code: string;
  /** @purpose Artifact path. */
  file: string;
  /** @purpose Actionable description. */
  message: string;
  /** @purpose Precise one-based source line when known. */
  line?: number;
};
