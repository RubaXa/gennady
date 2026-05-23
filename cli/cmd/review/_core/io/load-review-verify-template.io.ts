// @file: Load review-verify template from the project or fallback from the library.
// @consumers: render-review-verify.xml
// @tasks: N/A

import { loadAgentTemplate } from '../../../_shared/prompt/io/load-agent-template.io.ts';

/**
 * @purpose Load review-verify template from the project or fallback from the library.
 * @returns XML template content.
 * @consumer render-review-verify.xml
 */
export async function loadReviewVerifyTemplate(): Promise<string> {
  return loadAgentTemplate('agent-review-verifier.xml');
}
