// @file: Async mermaid validation for SDD artifacts — every ```mermaid block parses via the real grammar (honest, not presence-only). Kept out of check.ts (pure + sync).
// @consumers: sdd-check.cmd
// @tasks: N/A

import { extractMermaidBlocks, validateMermaid } from '../mermaid/mermaid.ts';
import type { Finding } from './check.ts';

/**
 * @purpose Validate every mermaid diagram in one artifact through the real mermaid parser.
 * @invariant Fires for any `.md` with a ```mermaid block, regardless of flow version. Diagram-free files skip the heavy parser load.
 * @param file Artifact path — carried into each finding for location.
 * @param content Full artifact markdown.
 * @returns One SDD_DIAGRAM_INVALID (error) per block the parser rejects; empty when all diagrams parse.
 * @sideEffect Lazily loads mermaid + jsdom when at least one block is present.
 */
export async function checkSpecMermaid(file: string, content: string): Promise<Finding[]> {
  const blocks = extractMermaidBlocks(content);
  if (blocks.length === 0) return [];
  const findings: Finding[] = [];
  for (const body of blocks) {
    const err = await validateMermaid(body);
    if (err !== null) {
      findings.push({
        severity: 'error',
        code: 'SDD_DIAGRAM_INVALID',
        file,
        message: `mermaid diagram does not parse: ${err}`,
      });
    }
  }
  return findings;
}
