// @file: Code element — fenced code block with optional language and title
// @consumers: prompt-kit consumers
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

/** Props for the Code block element. */
export type CodeProps = {
  /** Programming language for syntax-highlighted fenced block (e.g. `ts`, `python`). */
  lang?: string;
  /** Optional title rendered as `**title**:` before the fenced block in MD. */
  title?: string;
};

/** Fenced code block. In MD: ` ```lang\nchildren\n``` `. Supports optional title. */
export const Code = definePromptElement<CodeProps>({
  tagName: 'Code',
  role: 'block',
  markdown: {
    title: ({ props }) => (props.title ? `**${props.title}**:` : ''),
  },
});
