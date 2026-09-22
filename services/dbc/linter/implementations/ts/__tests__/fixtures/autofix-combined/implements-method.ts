// @file: Fixture — class implements interface, method has @see with redundant params.
// @spec: DBC-DBC-LINTER
// @consumers: DbcTsLinterTest

/** @purpose Marker interface for Agent. */
export interface Agent {}

/**
 * @purpose Adapter implementing Agent.
 * @implements {Agent} in agent.type.ts
 */
export class AgentImpl implements Agent {
  /**
   * @param x Optional parameter.
   * @returns Parsed sessions.
   * @see {Agent#scan} in agent.type.ts
   */
  async scan(x?: string): Promise<string[]> {
    return [];
  }
}
