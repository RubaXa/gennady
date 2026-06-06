// @file: Code element — fenced code block with optional language and title
// @consumers: prompt-kit consumers
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

export type CodeProps = { lang?: string; title?: string };

export const Code = definePromptElement<CodeProps>({
  tagName: 'Code',
  role: 'block',
  markdown: {
    title: ({ props }) => (props.title ? `**${props.title}**:` : ''),
  },
});
