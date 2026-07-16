// @file: DiskArtifact — resolves a session/lens node's on-disk artifact file into a
//   ClassifiedOutcome, the shared hook `_executeSession`/`_runLensSession` call into so a missing
//   or malformed file feeds the EXISTING continue/restart ladder unchanged.
// @consumers: role-instance.ts
// @tasks: TSK-127

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ClassifiedOutcome } from './outcome-classifier.ts';
import type { ArtifactSpec } from './role-node.ts';

/**
 * @purpose Validate JSON against a schema's top-level required fields + primitive types — mirrors
 *   `OpenCodeReal#_validateSchema`, kept standalone (no adapter dependency).
 * @param schema Expected top-level shape (`properties`/`required`).
 * @param data Parsed artifact JSON.
 * @returns Human-readable mismatch messages — empty when the data is valid.
 */
export function validateArtifactSchema(
  schema: Record<string, unknown>,
  data: Record<string, unknown>
): string[] {
  const errors: string[] = [];
  const properties = (schema.properties as Record<string, Record<string, unknown>>) ?? {};
  const required = (schema.required as string[]) ?? [];

  for (const reqKey of required) {
    if (!(reqKey in data) || data[reqKey] === undefined || data[reqKey] === null) {
      errors.push(`required field "${reqKey}" is missing or null`);
    }
  }

  for (const [key, propSchema] of Object.entries(properties)) {
    if (!(key in data) || data[key] === undefined) continue;
    const value = data[key];
    const expectedType = propSchema.type as string | undefined;
    if (!expectedType) continue;
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (expectedType === 'integer') {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        errors.push(`field "${key}" expected integer, got ${typeof value}`);
      }
    } else if (expectedType !== actualType) {
      if (value !== null || required.includes(key)) {
        errors.push(`field "${key}" expected ${expectedType}, got ${actualType}`);
      }
    }
  }

  return errors;
}

/**
 * @purpose Read + validate a node's on-disk artifact into a ClassifiedOutcome the recovery ladder
 *   consumes like a response-JSON outcome — no second unbounded loop.
 * @invariant Called ONLY after the raw prompt already classified OK — the file is the source of
 *   truth (TSK-127: mega-JSON responses truncate on large MRs).
 * @param sessionDir Session's working directory (same value used to create the session).
 * @param artifact `{ file, schema? }` — `file` is relative to `sessionDir`.
 * @returns OK with the parsed file; else a synthetic NO_RESULT/PARSE_ERROR/SCHEMA_MISMATCH
 *   outcome carrying a correction `signal` for the ladder.
 */
export function resolveDiskArtifact(sessionDir: string, artifact: ArtifactSpec): ClassifiedOutcome {
  const path = join(sessionDir, artifact.file);

  if (!existsSync(path)) {
    return {
      class: 'NO_RESULT',
      signal: `You did not create ${artifact.file}. Write your JSON result to that exact path now using your file-write tool.`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (cause) {
    return {
      class: 'PARSE_ERROR',
      signal: `${artifact.file} is not valid JSON (${String(cause)}). Overwrite it with valid JSON only.`,
    };
  }

  if (artifact.schema) {
    const errors = validateArtifactSchema(artifact.schema, parsed as Record<string, unknown>);
    if (errors.length > 0) {
      return {
        class: 'SCHEMA_MISMATCH',
        signal: `${artifact.file} does not match the expected shape: ${errors.join('; ')}. Fix these fields and overwrite the file.`,
        details: { mismatchedFields: errors },
      };
    }
  }

  return { class: 'OK', output: parsed as Record<string, unknown> };
}
