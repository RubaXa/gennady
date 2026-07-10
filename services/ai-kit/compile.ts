// @file: AIKit system prompt compiler — loads directives from `ai/directives/agent-inbox/`
//   and concatenates them into a system prompt for a given node or role.
// @consumers: role engine (services/agent-inbox), CLI commands
// @tasks: TSK-116

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NODE_DIRECTIVE_MAP } from './node-map.ts';

// #region START_RESOLVE_PATHS — derive project root from this module's location
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');
const directiveBase = resolve(projectRoot, 'ai/directives/agent-inbox');
// #endregion END_RESOLVE_PATHS

/**
 * @purpose MR-specific data injected into the system prompt.
 *   Empty object = raw directives only (no MR data).
 * @consumer buildNodePrompt, buildSystemPrompt
 */
export type PromptContext = Record<string, unknown>;

/**
 * @purpose Read a single AIKit directive file from disk.
 * @param name Short directive name (e.g. `arch-interrogation`).
 * @returns Raw XML content of the directive.
 * @throws If the directive file does not exist — role cannot be loaded.
 */
async function loadDirective(name: string): Promise<string> {
  const filePath = resolve(directiveBase, `${name}.directive.xml`);

  if (!existsSync(filePath)) {
    throw new Error(`Directive not found: ${filePath}. Role cannot be loaded.`);
  }

  return readFile(filePath, 'utf-8');
}

/**
 * @purpose Compile system prompt for a single logical node by loading and
 *   concatenating all directives mapped to that node.
 * *
 * @param nodeId Logical node identifier (e.g. `node_review`, `node_scaffold`).
 * @param [_ctx] Prompt context (reserved for future MR data injection).
 * @throws If `nodeId` is unknown or any mapped directive file is missing.
 * @returns Concatenated directive contents as a single string.
 */
export async function buildNodePrompt(nodeId: string, _ctx: PromptContext = {}): Promise<string> {
  const directiveNames = NODE_DIRECTIVE_MAP[nodeId];
  if (!directiveNames) {
    throw new Error(`Unknown node: ${nodeId}. No directives mapped. Role cannot be loaded.`);
  }

  const contents = await Promise.all(directiveNames.map((name) => loadDirective(name)));
  return contents.join('\n');
}

/**
 * @purpose Build a complete system prompt for a given role by aggregating
 *   prompts from all nodes assigned to that role.
 * *
 * @param role Role identifier (e.g. `reviewer`, `author`).
 * @param [ctx] Prompt context with optional MR-specific data.
 * @throws If the role is unknown or any underlying node/directive is missing.
 * @returns Aggregated system prompt string.
 */
export async function buildSystemPrompt(role: string, ctx: PromptContext = {}): Promise<string> {
  // #region START_ROLE_TO_NODES — map roles to their node graph
  const roleToNodes: Record<string, string[]> = {
    /** Reviewer sees both architecture and code interrogation batteries. */
    reviewer: ['node_review'],

    /** Author sees the same batteries as reviewer in v1 (self-review). */
    author: ['node_review'],
  };
  // #endregion END_ROLE_TO_NODES

  const nodes = roleToNodes[role];
  if (!nodes) {
    throw new Error(`Unknown role: ${role}. Cannot build system prompt. Role not loaded.`);
  }

  const prompts = await Promise.all(nodes.map((nodeId) => buildNodePrompt(nodeId, ctx)));
  return prompts.join('\n');
}
