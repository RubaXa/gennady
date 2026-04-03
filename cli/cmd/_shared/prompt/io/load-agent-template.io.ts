import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @purpose Загрузить agent-шаблон из проекта (override) или fallback из gennady.
 * @consumer render-review-verify.xml, render-resolve-conflicts.xml
 * @param templateFilename Имя XML-файла в `.ai/agents`.
 * @returns Содержимое XML-шаблона.
 */
export async function loadAgentTemplate(templateFilename: string): Promise<string> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(process.cwd(), '.ai/agents', templateFilename),
    path.join(__dirname, '../../../../../.ai/agents', templateFilename),
  ];

  for (const candidatePath of candidates) {
    if (fs.existsSync(candidatePath)) {
      return fs.promises.readFile(candidatePath, 'utf-8');
    }
  }

  throw new Error(`Не найден файл шаблона ${templateFilename} в .ai/agents.`, {
    cause: candidates,
  });
}
