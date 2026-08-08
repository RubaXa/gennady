// @file: Eval run context and EvalRun type shared across all 10 runners
// @consumers: EvalHarness (TSK-165)
// @tasks: TSK-165

import type { JournalPort } from '../../inbox-core/event-journal.ts';

/** @purpose Context passed to each eval runner — readonly journal + optional artifacts */
export type EvalRunContext = {
  /** @purpose Raw event journal for entry inspection */
  journal: JournalPort;
  /** @purpose Artifacts produced by the run-mode pass per MR */
  artifacts: Record<string, unknown> | null;
  /** @purpose Optional override for current time ISO string */
  now?: string;
};

/** @purpose Outcome of one eval run: pass/fail status with supporting evidence */
export type EvalRun = {
  /** @purpose Run identifier — matches the 10-run table in spec §2 */
  id: string;
  /** @purpose Whether all criteria for this run passed */
  status: 'pass' | 'fail';
  /** @purpose Evidence lines explaining the verdict */
  evidence: string[];
};

/**
 * @purpose Factory: create a passing EvalRun
 * @param id Run identifier from the 10-run table
 * @param evidence Evidence lines explaining the verdict
 * @returns EvalRun with status=pass
 */
export function pass(id: string, evidence: string[]): EvalRun {
  return { id, status: 'pass', evidence };
}

/**
 * @purpose Factory: create a failing EvalRun
 * @param id Run identifier from the 10-run table
 * @param evidence Evidence lines explaining the verdict
 * @returns EvalRun with status=fail
 */
export function fail(id: string, evidence: string[]): EvalRun {
  return { id, status: 'fail', evidence };
}
