// @file: Attributed factual tool trace used as the only agent coverage evidence.
// @consumers: inbox-pipeline, inbox-eval
// @tasks: TSK-175

import type { AgentRuntimeAttribution, ToolTraceEntry } from './opencode.port.ts';

/**
 * @purpose Immutable observed file/tool activity used by the coverage gate.
 * @invariant Missing attribution or an empty trace is rejected; coverage is never inferred.
 */
export class AgentCoverageTrace {
  /** @purpose Session, task and model that produced this trace. */
  readonly attribution: Readonly<AgentRuntimeAttribution>;
  /** @purpose Tool calls preserved in observed session order. */
  readonly entries: readonly Readonly<ToolTraceEntry>[];

  /**
   * @purpose Materialize already validated immutable coverage evidence.
   * @param attribution Required producer provenance.
   * @param entries Factual tool activity in session order.
   */
  protected constructor(attribution: AgentRuntimeAttribution, entries: ToolTraceEntry[]) {
    this.attribution = Object.freeze({ ...attribution });
    this.entries = Object.freeze(entries.map((entry) => Object.freeze({ ...entry })));
  }

  /**
   * @purpose Validate and materialize factual runtime coverage evidence.
   * @param attribution Required producer provenance.
   * @param entries Factual tool activity accumulated by the adapter.
   * @throws {Error} When attribution is incomplete, trace is absent, or sequence is unstable.
   * @returns Immutable trace safe for the coverage gate.
   */
  static validate(
    attribution: AgentRuntimeAttribution,
    entries: ToolTraceEntry[]
  ): AgentCoverageTrace {
    if (!attribution.sessionId || !attribution.taskId || !attribution.model) {
      throw new Error('[AgentCoverageTrace.validate] Attribution fields must be non-empty');
    }
    if (entries.length === 0) {
      throw new Error('[AgentCoverageTrace.validate] Coverage requires observed tool trace');
    }
    if (entries.some((entry, index) => entry.seq !== index || !entry.tool || !entry.status)) {
      throw new Error(
        '[AgentCoverageTrace.validate] Tool trace sequence or attribution is invalid'
      );
    }
    return new AgentCoverageTrace(attribution, entries);
  }
}
