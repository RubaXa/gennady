// @file: Prompt element — root of a prompt message, wraps content with optional keywords
// @consumers: prompt-kit consumers
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

/** Props for the Prompt root element. */
export type PromptProps = {
  /** Space-separated keywords rendered as XML attribute and MD heading. */
  keywords?: string;
};

/** Root element of a prompt message. Renders keywords as XML attribute + MD heading, wraps children. */
export const Prompt = definePromptElement<PromptProps>({
  tagName: 'Prompt',
  role: 'root',
  html: { tag: 'Prompt' },
  markdown: {
    title: ({ props }) => (props.keywords ? `KEYWORDS:\n${props.keywords}` : ''),
  },
});
