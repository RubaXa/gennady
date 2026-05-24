// @file: openai-like-provider
// @consumers: N/A
// @tasks: N/A

import { createOpenAI } from '@ai-sdk/openai';

/**
 * @purpose Factory re-export of the OpenAI-compatible provider creation function.
 */
export const createOpenAiLikeProvider = createOpenAI;
