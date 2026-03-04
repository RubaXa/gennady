import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @purpose Загрузить шаблон review-verify из проекта или fallback из библиотеки.
 * @consumer render-review-verify.xml
 * @returns Содержимое XML-шаблона.
 */
export async function loadReviewVerifyTemplate(): Promise<string> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const libDir = path.resolve(__dirname, '../../../../../..');
  const candidates = [
    path.join(process.cwd(), '.ai/agents/agent-review-verifier.xml'),
    path.join(__dirname, '../.ai/agents/agent-review-verifier.xml'),
    path.join(__dirname, '../../.ai/agents/agent-review-verifier.xml'),
    path.join(libDir, '.ai/agents/agent-review-verifier.xml'),
  ];

  for (const candidatePath of candidates) {
    if (fs.existsSync(candidatePath)) {
      return fs.promises.readFile(candidatePath, 'utf-8');
    }
  }

  throw new Error('Не найден файл шаблона agent-review-verifier.xml в .ai/agents.');
}
