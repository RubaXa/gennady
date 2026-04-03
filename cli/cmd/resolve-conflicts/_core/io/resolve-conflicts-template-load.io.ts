import { loadAgentTemplate } from '../../../_shared/prompt/io/load-agent-template.io.ts';

/**
 * @purpose Загрузить шаблон resolve-conflicts из проекта или fallback из библиотеки.
 * @consumer resolve-conflicts-render.xml
 * @returns Содержимое XML-шаблона.
 */
export async function loadResolveConflictsTemplate(): Promise<string> {
  return loadAgentTemplate('agent-resolve-conflicts.xml');
}
