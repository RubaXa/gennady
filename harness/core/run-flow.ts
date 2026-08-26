// @file: run-flow — drive one agent session through a scenario's ordered prompt steps.
// @consumers: harness/core/harness
// @tasks: N/A (eval harness, not published)

import { AgentPort, type AgentTraceEntry } from '../port/agent.port.ts';

/** @purpose One prompt step in a scenario — a label for reporting and the instruction text. */
export type FlowStep = {
  /** @purpose Short step label surfaced in the report (e.g. 'scaffold', 'execute', 'audit'). */
  label: string;
  /** @purpose The instruction sent to the agent for this step. */
  text: string;
  /** @purpose Optional whole-turn timeout in minutes for this step. */
  timeoutMinutes?: number;
};

/** @purpose Per-step outcome recorded while driving the flow. */
export type FlowStepResult = {
  /** @purpose The step's label. */
  label: string;
  /** @purpose Whether the turn succeeded. */
  ok: boolean;
  /** @purpose Reply text on success, error message on failure. */
  detail: string;
};

/** @purpose Aggregate flow outcome — the accumulated trace plus each step's result. */
export type FlowResult = {
  /** @purpose True iff every step succeeded. */
  ok: boolean;
  /** @purpose The agent's accumulated tool-trace across all steps. */
  trace: AgentTraceEntry[];
  /** @purpose Each step's outcome, in order. */
  steps: FlowStepResult[];
};

/**
 * @purpose Drive an agent through a scenario's steps in ONE session — first step via prompt(), the
 *   rest via continue() so the flow's context carries across turns. Stops at the first failed step.
 * @param agent The agent port (mock or real).
 * @param dir Repo the session is bound to.
 * @param steps Ordered prompt steps.
 * @param model Optional model id for the session.
 * @returns The aggregate flow result carrying the final accumulated trace.
 */
export async function runFlow(
  agent: AgentPort,
  dir: string,
  steps: FlowStep[],
  model?: string
): Promise<FlowResult> {
  const { sid } = await agent.createSession({ title: 'sdd-flow', directory: dir, model });
  const stepResults: FlowStepResult[] = [];
  let trace: AgentTraceEntry[] = [];
  try {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const opts = { text: step.text, timeoutMinutes: step.timeoutMinutes };
      const res = i === 0 ? await agent.prompt(sid, opts) : await agent.continue(sid, opts);
      trace = res.trace;
      stepResults.push({
        label: step.label,
        ok: res.ok,
        detail: res.ok ? res.text : res.error,
      });
      if (!res.ok) break;
    }
  } finally {
    await agent.close(sid);
  }
  return {
    ok: stepResults.length === steps.length && stepResults.every((s) => s.ok),
    trace,
    steps: stepResults,
  };
}
