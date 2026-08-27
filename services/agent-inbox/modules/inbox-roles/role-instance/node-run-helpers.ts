// @file: Module-level helpers for RoleInstance session-node execution — tool gate resolution, result shaping, disk persistence, and output-contract prompting.
// @consumers: role-instance.ts
// @tasks: N/A

import { dirname } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { logger } from '#logger';
import type { SessionPolicy, NodeContext } from '../role-node.ts';
import type { AgentRuntimeResult, ToolGate } from '../../inbox-opencode/opencode.port.ts';
import type { OpenCodeCallResult } from '../../inbox-opencode/errors.ts';

/**
 * @purpose Resolve the tool gate `createSession` accepts from a node's policy (D-118..D-123).
 * @invariant `toolPolicy` takes precedence over the coarser `tools` flag and passes through as a
 *   fine-grained `ToolGate` — real per-tool enforcement (`OpenCodeReal#_composeToolsGate`).
 * @invariant No `toolPolicy` → pre-existing coarse boolean behavior unchanged.
 * @param policy The node's `SessionPolicy`.
 * @returns Coarse boolean gate, or a `ToolGate` for fine-grained per-lens allowlisting.
 */
export function _resolveSessionTools(policy: SessionPolicy | undefined): boolean | ToolGate {
  if (policy?.toolPolicy) {
    const { bash, read, grep, write } = policy.toolPolicy;
    return write === undefined ? { bash, read, grep } : { bash, read, grep, write };
  }
  return policy?.tools === true;
}

/**
 * @purpose Preserve legacy role classification while runtime execution uses the attributed port.
 * @param result The attributed-port runtime result.
 * @returns The legacy-shaped call result.
 */
export function _toOpenCodeCallResult(result: AgentRuntimeResult): OpenCodeCallResult {
  if (result.ok) return { ok: true, output: result.output };
  return {
    ok: false,
    error: {
      class: result.outcome,
      signal: result.signal,
      raw: result.raw,
      retry: result.retry,
    },
  };
}

/**
 * @purpose Persist a node's declared `persistResult` output — the ENGINE writes this (D-118..D-123),
 *   never the agent. Best-effort: a write failure only logs a warning.
 * @param persistResult The node's `persistResult` hook, if declared.
 * @param ctx Node context forwarded to the hook.
 * @param output The node's structured OK output.
 * @param logLabel One-line label for the warning log on failure (caller + node id).
 * @sideEffect FS: writes the hook's returned `{path, content}`, creating parent dirs as needed.
 */
export function _persistNodeResult(
  persistResult:
    | ((
        ctx: NodeContext,
        output: Record<string, unknown>
      ) => { path: string; content: string } | undefined)
    | undefined,
  ctx: NodeContext,
  output: Record<string, unknown>,
  logLabel: string
): void {
  if (!persistResult) return;
  const toPersist = persistResult(ctx, output);
  if (!toPersist) return;
  try {
    mkdirSync(dirname(toPersist.path), { recursive: true });
    writeFileSync(toPersist.path, toPersist.content);
  } catch (cause) {
    logger.warn('[RoleInstance#_persistNodeResult] [writing → degraded]', {
      node: logLabel,
      path: toPersist.path,
      error: String(cause),
    });
  }
}

/**
 * @purpose Render a compact JSON example for one schema property, by type — a shape hint so the
 *   model closes its turn with parseable JSON.
 * @param prop A `resultSchema.properties[k]` descriptor (`{ type }`).
 * @returns A one-token example value (`[]`, `{}`, `"..."`, `0`, `false`, `null`).
 */
export function _exampleForProp(prop: unknown): string {
  const type = (prop as { type?: string } | undefined)?.type;
  switch (type) {
    case 'array':
      return '[]';
    case 'object':
      return '{}';
    case 'string':
      return '"..."';
    case 'number':
    case 'integer':
      return '0';
    case 'boolean':
      return 'false';
    default:
      return 'null';
  }
}

/**
 * @purpose Build the output-contract suffix appended to a node's task text — turns `resultSchema`
 *   into an explicit "end your turn with this JSON" instruction.
 * @invariant Appended to TASK TEXT, never the system directive (schema-in-system made the model
 *   hang) — item shape only, carried by the node's task text.
 * @param schema The node's `resultSchema`.
 * @returns Markdown suffix instructing the final-message JSON shape.
 */
export function _outputContract(schema: unknown): string {
  const props = (schema as { properties?: Record<string, unknown> } | undefined)?.properties ?? {};
  const shape = Object.entries(props)
    .map(([key, prop]) => `"${key}": ${_exampleForProp(prop)}`)
    .join(', ');
  return `\n\n### Output contract\nInvestigate with the tools first. Then the FINAL message of your turn must be EXACTLY ONE fenced json code block and NOTHING after it, matching this shape:\n\`\`\`json\n{ ${shape} }\n\`\`\``;
}
