// @file: Загрузить шаблон review-verify из проекта или fallback из библиотеки.
// @consumers: render-review-verify.xml
// @tasks: N/A

import { loadAgentTemplate } from '../../../_shared/prompt/io/load-agent-template.io.ts';

/**
 * @purpose Загрузить шаблон review-verify из проекта или fallback из библиотеки.
 * @consumer render-review-verify.xml
 * @returns Содержимое XML-шаблона.
 */
export async function loadReviewVerifyTemplate(): Promise<string> {
  return loadAgentTemplate('agent-review-verifier.xml');
}
