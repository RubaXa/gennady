// @file: harness — orchestrate one eval run: workspace → (setup) → run-flow → verify → report.
// @consumers: harness/scenarios/*, harness/run.ts, harness self-tests
// @tasks: N/A (eval harness, not published)

import type { AgentPort } from '../port/agent.port.ts';
import { createWorkspace, type Workspace } from './workspace.ts';
import { runFlow, type FlowStep, type FlowResult } from './run-flow.ts';
import { verifyOutput, type VerifyExpectation, type VerifyResult } from './verify-output.ts';

/** @purpose A complete eval scenario — start state, the prompts to drive, and the pass criteria. */
export type Scenario = {
  /** @purpose Scenario id, e.g. 's1'. */
  id: string;
  /** @purpose Human label, e.g. 'fixture'. */
  label: string;
  /** @purpose Optional fixture dir copied into the workspace as the start state. */
  fixtureDir?: string;
  /** @purpose Ordered prompt steps driving the flow. */
  steps: FlowStep[];
  /** @purpose What the run must produce to count as green. */
  expect: VerifyExpectation;
  /** @purpose Optional model id for the session (real runs). */
  model?: string;
};

/** @purpose Options controlling a run — the setup hook and workspace retention. */
export type HarnessOptions = {
  /** @purpose Hook that installs gennady into the fresh workspace; omitted for mock/self-tests. */
  setup?: (ws: Workspace) => void | Promise<void>;
  /** @purpose Keep the workspace on disk after the run for inspection. */
  keepWorkspace?: boolean;
};

/** @purpose The full evidence trail of one eval run. */
export type HarnessReport = {
  /** @purpose Scenario id that ran. */
  scenario: string;
  /** @purpose Workspace path (present when kept, else after-cleanup path for logs). */
  workspace: string;
  /** @purpose Green only when both the flow and verification passed. */
  ok: boolean;
  /** @purpose The flow driver's result. */
  flow: FlowResult;
  /** @purpose The verifier's result. */
  verify: VerifyResult;
};

/**
 * @purpose Run one scenario end-to-end and return its full evidence trail.
 * @invariant Green requires BOTH the flow completing every step AND verification passing — the
 *   agent's own success text never decides the verdict; on-disk facts do.
 * @param scenario The scenario to run.
 * @param agent The agent port (mock or real).
 * @param opts Setup hook and workspace retention.
 * @returns The structured report.
 */
export async function runHarness(
  scenario: Scenario,
  agent: AgentPort,
  opts: HarnessOptions = {}
): Promise<HarnessReport> {
  const ws = createWorkspace(`${scenario.id}-${scenario.label}`, scenario.fixtureDir);
  try {
    if (opts.setup) await opts.setup(ws);
    const flow = await runFlow(agent, ws.dir, scenario.steps, scenario.model);
    const verify = verifyOutput(ws.dir, flow.trace, scenario.expect);
    return {
      scenario: scenario.id,
      workspace: ws.dir,
      ok: flow.ok && verify.ok,
      flow,
      verify,
    };
  } finally {
    if (!opts.keepWorkspace) ws.cleanup();
  }
}
