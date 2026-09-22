// @file: Load resolve-conflicts template from the project or fallback from the library.
// @spec: CLI
// @consumers: resolve-conflicts-render.xml

import { loadAgentTemplate } from '../../../_shared/prompt/io/load-agent-template.io.ts';

/**
 * @purpose Load resolve-conflicts template from the project or fallback from the library.
 * @returns XML template content.
 * @consumer resolve-conflicts-render.xml
 */
export async function loadResolveConflictsTemplate(): Promise<string> {
  return loadAgentTemplate('agent-resolve-conflicts.xml');
}
