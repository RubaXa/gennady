// @file: Code element — fenced code block with optional language and title
// @consumers: prompt-kit consumers
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

export const Code = definePromptElement({
  tagName: 'Code',
  role: 'block',
  markdown: {
    title: ({ props }) => (props.title ? `**${props.title}**:` : ''),
  },
});
