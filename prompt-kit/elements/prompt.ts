// @file: Prompt element — root of a prompt message, wraps content with optional keywords
// @consumers: prompt-kit consumers
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

export const Prompt = definePromptElement({
  tagName: 'Prompt',
  role: 'root',
  markdown: {
    title: ({ props }) => {
      const kw = props.keywords as string | undefined;
      return kw ? `KEYWORDS:\n${kw}` : '';
    },
  },
  xml: { tag: 'Prompt' },
});
