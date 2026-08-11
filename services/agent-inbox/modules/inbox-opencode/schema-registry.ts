// @file: AgentSchemaRegistry — versioned task schema lookup and strict structured-output boundary.
// @consumers: inbox-roles (RoleInstance.step for session nodes)
// @tasks: TSK-111, TSK-175

import type { OpenCodeErrorResult } from './errors.ts';

/** @purpose Result of validating one raw structured runtime outcome. */
export type AgentSchemaValidation =
  | { ok: true; output: Record<string, unknown> }
  | { ok: false; error: OpenCodeErrorResult & { class: 'SCHEMA_MISMATCH'; raw: string } };

/** @purpose Determine the JSON-schema type of one runtime value. */
function identifyJsonType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number' && Number.isInteger(value)) return 'integer';
  return typeof value;
}

/**
 * @purpose Collect strict object/property/required mismatches for the supported schema subset.
 * @param schema JSON schema applied at the shared runtime boundary.
 * @param value Parsed structured output candidate.
 * @param [path] Current diagnostic path during recursive validation.
 * @returns Stable list of schema mismatches; empty means valid.
 */
export function validateAgentSchema(
  schema: Record<string, unknown>,
  value: unknown,
  path = '$'
): string[] {
  const expected = schema.type;
  const actual = identifyJsonType(value);
  if (typeof expected === 'string') {
    const compatible = expected === actual || (expected === 'number' && actual === 'integer');
    if (!compatible) return [`${path} expected ${expected}, received ${actual}`];
  }
  if (expected === 'array' && Array.isArray(value)) {
    const itemSchema = schema.items;
    if (typeof itemSchema === 'object' && itemSchema !== null && !Array.isArray(itemSchema)) {
      return value.flatMap((item, index) =>
        validateAgentSchema(itemSchema as Record<string, unknown>, item, `${path}[${index}]`)
      );
    }
  }
  if (
    expected !== 'object' ||
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    return [];
  }

  const record = value as Record<string, unknown>;
  const properties =
    typeof schema.properties === 'object' && schema.properties !== null
      ? (schema.properties as Record<string, unknown>)
      : {};
  const required = Array.isArray(schema.required)
    ? schema.required.filter((field): field is string => typeof field === 'string')
    : [];
  const errors = required
    .filter((field) => !(field in record))
    .map((field) => `${path}.${field} is required`);

  // #region START_VALIDATE_DECLARED_PROPERTIES
  for (const [field, fieldSchema] of Object.entries(properties)) {
    if (!(field in record)) continue;
    if (typeof fieldSchema !== 'object' || fieldSchema === null || Array.isArray(fieldSchema)) {
      errors.push(`${path}.${field} has an invalid schema definition`);
      continue;
    }
    errors.push(
      ...validateAgentSchema(
        fieldSchema as Record<string, unknown>,
        record[field],
        `${path}.${field}`
      )
    );
  }
  // #endregion END_VALIDATE_DECLARED_PROPERTIES

  if (schema.additionalProperties === false) {
    errors.push(
      ...Object.keys(record)
        .filter((field) => !(field in properties))
        .map((field) => `${path}.${field} is not allowed`)
    );
  }
  return errors;
}

/**
 * @purpose Registry of JSON Schemas keyed by AI-node identifier (not by role).
 * @invariant One node maps to exactly one schema. Overwriting with register() replaces.
 * @consumers inbox-roles (RoleInstance.step for session nodes)
 */
export class AgentSchemaRegistry {
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
    if (!nodeId || schema.type !== 'object') {
      throw new Error(
        '[AgentSchemaRegistry#register] Schema id must be non-empty and root type must be object'
      );
    }
    this._schemas.set(nodeId, schema);
  }

  /**
   * @purpose Validate a structured output and retain its raw evidence when the schema rejects it.
   * @param schemaId Registered versioned task-schema identity.
   * @param output Parsed runtime output candidate.
   * @param raw Original runtime text retained for an exact retry.
   * @throws {Error} When the requested schema identity is not registered.
   * @returns Valid output or retryable schema mismatch with raw evidence.
   */
  validate(schemaId: string, output: unknown, raw: string): AgentSchemaValidation {
    const schema = this._schemas.get(schemaId);
    if (!schema) {
      throw new Error(`[AgentSchemaRegistry#validate] Unknown schema: ${schemaId}`);
    }
    const mismatchedFields = validateAgentSchema(schema, output);
    if (mismatchedFields.length === 0) {
      return { ok: true, output: output as Record<string, unknown> };
    }
    return {
      ok: false,
      error: {
        class: 'SCHEMA_MISMATCH',
        signal: `Output does not match ${schemaId}`,
        details: { mismatchedFields, expected: schema, received: output },
        raw,
        retry: { retryable: true, action: 'continue' },
      },
    };
  }
}

/** @purpose Legacy name for the same strict schema registry during consumer migration. */
export { AgentSchemaRegistry as SchemaRegistry };
