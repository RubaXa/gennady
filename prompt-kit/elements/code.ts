// @file: Code element — fenced code block with optional language and title
// @consumers: prompt-kit module
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

/**
 * @purpose Renders a fenced code block with optional syntax-highlighting language and title header.
 */
export const Code = definePromptElement({ tagName: 'Code',
  role: 'block',
  markdown: {
    title: (props: Record<string, unknown>) => (props.title as string) ?? undefined,
  },
});
