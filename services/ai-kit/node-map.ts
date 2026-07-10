// @file: Mapping from logical node IDs to AIKit directive names.
// @consumers: compile.ts (buildNodePrompt)
// @tasks: TSK-116

/**
 * @purpose Maps node identifiers used by the role engine to their directive file names.
 *   Each directive resolves to `ai/directives/agent-inbox/<name>.directive.xml`.
 * @invariant All directive names in this map correspond to existing files in `ai/directives/agent-inbox/`.
 */
export const NODE_DIRECTIVE_MAP: Readonly<Record<string, readonly string[]>> = {
  /** Scaffold node: architectural interrogation only (design-time check). */
  node_scaffold: ['arch-interrogation'],

  /** Review node: architecture + code interrogation (full review battery). */
  node_review: ['arch-interrogation', 'code-interrogation'],
};
