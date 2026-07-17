// @file: AIKit system prompt compiler — loads directives from `ai/directives/agent-inbox/`
//   and concatenates them into a system prompt for a given node or role. Four node-ids
//   (node_track_review/node_security_lens/node_code_review/node_synthesize) route through the
//   dynamic `selector.ts` instead (TSK-136, D-121); everything else stays on the static map.
// @consumers: role engine (services/agent-inbox), CLI commands
// @tasks: TSK-116, TSK-136

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NODE_DIRECTIVE_MAP } from './node-map.ts';
import { selectDirective, type SessionType, type Track } from './selector.ts';
import type { NodeContext } from '../agent-inbox/modules/inbox-roles/role-node.ts';

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
 * @purpose The four `review_needed`/`synthesize` node-ids routed through `selector.ts` (TSK-136)
 *   instead of the static `NODE_DIRECTIVE_MAP`. Every other node-id stays on the static map below.
 * @invariant `track` absent means `sessionType='synthesize'` (single base template, no track axis).
 */
const SELECTOR_NODE_ROUTE: Readonly<Record<string, { sessionType: SessionType; track?: Track }>> = {
  node_track_review: { sessionType: 'session', track: 'logic' },
  node_security_lens: { sessionType: 'session', track: 'security' },
  node_code_review: { sessionType: 'session', track: 'code' },
  node_synthesize: { sessionType: 'synthesize' },
};

/**
 * @purpose Compile system prompt for a single logical node by loading and
 *   concatenating all directives mapped to that node.
 * *
 * @param nodeId Logical node identifier (e.g. `node_review`, `node_scaffold`).
 * @param [_ctx] Prompt context (reserved for future MR data injection). Structurally may carry
 *   `mrShape`/`injectedEntities` (TSK-134/136) when the caller built it from a live `NodeContext`.
 * @throws If `nodeId` is unknown or any mapped directive file is missing.
 * @returns Concatenated directive contents as a single string.
 */
export async function buildNodePrompt(nodeId: string, _ctx: PromptContext = {}): Promise<string> {
  // #region START_DYNAMIC_SELECTOR_ROUTE — TSK-136: reads ctx.mrShape (via a structural
  // NodeContext cast) to assemble dynamically; absent mrShape (scaffold pass skipped, or a
  // hand-built test ctx) degrades to the static map below, same as an unmapped node.
  const route = SELECTOR_NODE_ROUTE[nodeId];
  if (route) {
    const mrShape = (_ctx as NodeContext).mrShape;
    if (mrShape) {
      return selectDirective(route.sessionType, route.track, mrShape);
    }
  }
  // #endregion END_DYNAMIC_SELECTOR_ROUTE

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
