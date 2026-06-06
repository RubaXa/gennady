// @file: Prompt element — root of a prompt message, wraps content with optional keywords
// @consumers: prompt-kit module
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

/**
 * @purpose Root element of a prompt message. Carries optional keywords rendered as XML attribute and Markdown heading.
 */
export const Prompt = definePromptElement({ tagName: 'Prompt',
  role: 'root',
  markdown: {
    title: (props: Record<string, unknown>) => {
      const kw = props.keywords as string | undefined;
      return kw ? `KEYWORDS:\n${kw}` : '';
    },
  },
  xml: { tag: 'Prompt' },
});
