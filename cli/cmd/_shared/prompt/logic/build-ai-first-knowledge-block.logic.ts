// @file: Build `<!--ai:first-->` substitution with mandatory project knowledge files.
// @consumers: render-review-verify.xml, resolve-conflicts-render.xml
// @tasks: N/A

import fs from 'node:fs';
import path from 'node:path';

/**
 * @purpose Build `<!--ai:first-->` substitution with mandatory project knowledge files.
 * @param projectRoot Repository root.
 * @returns Empty string if knowledge files are not found; otherwise mandatory read text.
 * @consumer render-review-verify.xml, render-resolve-conflicts.xml
 */
export function buildAiFirstKnowledgeBlock(projectRoot: string): string {
  const projectKnowledgeFileCandidates: readonly string[] = [
    'ai.knowledge.md',
    'ai/ai.knowledge.md',
  ];

  const found: string[] = [];
  for (const rel of projectKnowledgeFileCandidates) {
    const abs = path.join(projectRoot, rel);
    try {
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        found.push(rel);
      }
    } catch {
      // ignore unreadable paths
    }
  }

  if (found.length === 0) {
    return '';
  }

  return `**MUST READ PROJECT KNOWLEDGE FILES**: ${found.join(', ')}.`;
}
