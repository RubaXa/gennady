import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROMPTS_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * @purpose Централизованный доступ к шаблонам промптов (agent, commit, review) из .md-файлов.
 * @consumer CommitGen, ReviewGen, cmd/agent
 * @invariant Имена файлов: agent/<name> → agent-{name}-prompt.md, commit → commit-{name}-prompt.md, review → review-{name}-prompt.md.
 * @sideEffect Filesystem: чтение файла при каждом вызове.
 */
export const prompts = {
  /** @purpose Загрузить промпт для agent по имени (например 'keywords'). */
  agent: (name: string): string =>
    readFileSync(join(PROMPTS_DIR, 'agent', `agent-${name}-prompt.md`)).toString(),
  /** @purpose Загрузить промпт для commit по имени ('message' | 'changeset'). */
  commit: (name: string): string =>
    readFileSync(join(PROMPTS_DIR, 'commit', `commit-${name}-prompt.md`)).toString(),
  /** @purpose Загрузить промпт для review по имени (например 'base'). */
  review: (name: string): string =>
    readFileSync(join(PROMPTS_DIR, 'review', `review-${name}-prompt.md`)).toString(),
};
