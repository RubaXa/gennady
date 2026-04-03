import fs from 'node:fs';
import path from 'node:path';

/**
 * @purpose Сформировать текст для замены `<!--ai:first-->`: обязательное чтение найденных файлов знаний проекта.
 * @param projectRoot Корень репозитория (обычно process.cwd() при запуске gennady).
 * @returns Пустая строка, если ни один кандидат не найден; иначе блок инструкций на русском.
 */
export function buildAiFirstKnowledgeBlock(projectRoot: string): string {
  const PROJECT_KNOWLEDGE_FILE_CANDIDATES: readonly string[] = [
    'ai.knowledge.md',
    '.ai/ai.knowledge.md',
  ];

  const found: string[] = [];
  for (const rel of PROJECT_KNOWLEDGE_FILE_CANDIDATES) {
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
