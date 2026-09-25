// @file: Immutable VerifyRunReport composition from the shared planner and local runner products.
// @spec: CLI-VERIFY
// @consumers: VerifyCommand

import { createHash } from 'node:crypto';
import type { LocalVerifyExecution } from '../execution/repair-loop.ts';
import type { MultistackVerifyPlan } from '../model/verify-multistack.type.ts';
import type { VerificationContext, VerifyRuleSnapshot } from '../model/verify-context.type.ts';
import type { VerifyRunReport } from '../model/verify-report.type.ts';

const PRE_RESOLVER_RULE_INPUT = JSON.stringify({
  version: 1,
  mode: 'pre-resolver',
  required: [],
  suggested: [],
  skipped: [],
});

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function emptyRuleSnapshot(): VerifyRuleSnapshot {
  return freezeDeep({
    digest: `sha256:${createHash('sha256').update(PRE_RESOLVER_RULE_INPUT).digest('hex')}`,
    required: [],
    suggested: [],
    skipped: [],
  });
}

/**
 * @purpose Join target planning and execution without pretending the deferred U6 rule resolver ran.
 * @param input Exact immutable facts and optional local execution product.
 * @returns Deep-frozen terminal report; plan-only callers receive empty results and readiness-derived
 *   verdict while their reporter marks the document as non-evidence.
 */
export function buildVerifyRunReport(input: {
  /** @purpose Canonical absolute repository root retained internally. */
  readonly root: string;
  /** @purpose Exact selected target phase. */
  readonly phase: string;
  /** @purpose Exact commit observed before planning/execution. */
  readonly headSha: string;
  /** @purpose One scope-aware composition and selected slice. */
  readonly planning: MultistackVerifyPlan;
  /** @purpose Local attempt product, absent only for no-spawn plan output. */
  readonly execution?: LocalVerifyExecution;
  /** @purpose Optional workflow identity supplied only by the U4 SDD context adapter. */
  readonly sdd?: {
    readonly task: string;
    readonly phase: string;
    readonly deletedFiles: readonly string[];
  };
}): VerifyRunReport {
  const rules = emptyRuleSnapshot();
  const plugins = input.planning.stacks
    .filter((stack) => stack.participation !== 'unaffected')
    .map((stack) => stack.plugin);
  const context: VerificationContext = {
    request: {
      root: input.root,
      phase: input.phase,
      scope: input.planning.scope,
      ...(input.sdd === undefined
        ? {}
        : {
            task: input.sdd.task,
            sddPhase: input.sdd.phase,
            deletedFiles: [...input.sdd.deletedFiles],
          }),
    },
    plugins,
    frameworks: [],
    headSha: input.headSha,
    rules,
  };
  const verdict =
    input.execution === undefined
      ? input.planning.readiness.status === 'BLOCKED'
        ? 'blocked'
        : 'pass'
      : input.execution.verdict === 'cancelled'
        ? 'violation'
        : input.execution.verdict;
  return freezeDeep({
    context,
    readiness: input.planning.readiness,
    plan: input.planning.plan,
    results: input.execution?.results ?? [],
    mutations: input.execution?.mutations ?? [],
    evidence: input.execution?.evidence ?? [],
    rules,
    verdict,
  });
}
