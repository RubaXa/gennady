// @file: Сформировать подстановку `<!--ai:first-->` с обязательными knowledge-файлами проекта.
// @consumers: render-review-verify.xml, resolve-conflicts-render.xml
// @tasks: N/A

import fs from 'node:fs';
import path from 'node:path';

/**
 * @purpose Сформировать подстановку `<!--ai:first-->` с обязательными knowledge-файлами проекта.
 * @consumer render-review-verify.xml, render-resolve-conflicts.xml
 * @param projectRoot Корень репозитория.
 * @returns Пустая строка, если knowledge-файлы не найдены; иначе текст обязательного чтения.
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
