// @file: Async mermaid validation for SDD artifacts — every ```mermaid block parses via the real grammar (honest, not presence-only). Kept out of check.ts (pure + sync).
// @consumers: sdd-check.cmd
// @tasks: N/A

import { extractMermaidBlockRefs, validateMermaid } from '../mermaid/mermaid.ts';
import type { Finding } from './check.ts';

// Top parse-failure causes, appended to the raw mermaid error the way a compiler prints "did you
// mean" hints — the model already knows mermaid; on a slip it needs the line (carried on the finding)
// plus a short recheck list, not upfront how-to instructions in a directive.
const MERMAID_TOP_CAUSES =
  'Топ причин перепроверить: (1) метка со спецсимволом — (), :, запятой, кавычкой, # — должна быть в двойных кавычках: `nth["compute F(n)"]`, а не `nth[compute F(n)]`; (2) один оператор на строку; (3) объявляй узел до ссылки на него; (4) не используй зарезервированные слова (`end`, `graph`) как id узла.';

/**
 * @purpose Validate every mermaid diagram in one artifact through the real mermaid parser.
 * @invariant Fires for any `.md` with a ```mermaid block, regardless of flow version. Diagram-free files skip the heavy parser load.
 * @param file Artifact path — carried into each finding for location.
 * @param content Full artifact markdown.
 * @returns One SDD_DIAGRAM_INVALID (error) per block the parser rejects; empty when all diagrams parse.
 * @sideEffect Lazily loads mermaid + jsdom when at least one block is present.
 */
export async function checkSpecMermaid(file: string, content: string): Promise<Finding[]> {
  const blocks = extractMermaidBlockRefs(content);
  if (blocks.length === 0) return [];
  const findings: Finding[] = [];
  for (const { body, line } of blocks) {
    const err = await validateMermaid(body);
    if (err !== null) {
      const diagramLine = Number(/\bline\s+(\d+)\b/i.exec(err)?.[1] ?? '1');
      findings.push({
        severity: 'error',
        code: 'SDD_DIAGRAM_INVALID',
        file,
        message: `mermaid diagram does not parse: ${err}\n  ${MERMAID_TOP_CAUSES}`,
        line: line + Math.max(0, diagramLine - 1),
      });
    }
  }
  return findings;
}
