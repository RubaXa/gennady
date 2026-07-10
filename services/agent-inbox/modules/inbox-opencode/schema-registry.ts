// @file: SchemaRegistry — node→schema mapping, not role→schema, for the inbox-opencode module.
// @consumers: inbox-roles (RoleInstance.step for session nodes)
// @tasks: TSK-111

/**
 * @purpose Registry of JSON Schemas keyed by AI-node identifier (not by role).
 * @invariant One node maps to exactly one schema. Overwriting with register() replaces.
 * @consumers inbox-roles (RoleInstance.step for session nodes)
 */
export class SchemaRegistry {
  /** @purpose Internal store: nodeId → JSON Schema definition */
  protected _schemas: Map<string, Record<string, unknown>>;

  /**
   * @purpose Create an empty schema registry.
   */
  constructor() {
    this._schemas = new Map();
  }

  /**
   * @purpose Look up the JSON Schema for a given AI-node identifier.
   * @param nodeId The AI-node identifier (e.g. 'node_scaffold', 'node_review').
   * @returns The JSON Schema object, or undefined when not registered.
   */
  get(nodeId: string): Record<string, unknown> | undefined {
    return this._schemas.get(nodeId);
  }

  /**
   * @purpose Register (or replace) a JSON Schema for a given AI-node identifier.
   * @param nodeId The AI-node identifier.
   * @param schema The JSON Schema definition.
   * @sideEffect Mutates internal state — overwrites any existing mapping for nodeId.
   */
  register(nodeId: string, schema: Record<string, unknown>): void {
    this._schemas.set(nodeId, schema);
  }
}
