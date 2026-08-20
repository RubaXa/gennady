// @file: Outcome type for the sdd-orient command — success carries the rendered printout, failure carries an actionable message + exit code.
// @consumers: sdd-orient.cmd

/** @purpose Result of running `gennady sdd-orient`. */
export type SddOrientOutcome =
  | { ok: true; text: string }
  | { ok: false; message: string; exitCode: number };
