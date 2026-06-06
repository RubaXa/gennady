// @file: Prompt element — root of a prompt message, wraps content with optional keywords
// @consumers: prompt-kit consumers
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

export type PromptProps = { keywords?: string };

export const Prompt = definePromptElement<PromptProps>({
  tagName: 'Prompt',
  role: 'root',
  html: { tag: 'Prompt' },
  markdown: {
    title: ({ props }) => props.keywords ? `KEYWORDS:\n${props.keywords}` : '',
  },
});
