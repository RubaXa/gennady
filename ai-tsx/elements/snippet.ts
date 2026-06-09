// @file: Snippet element — block code without markdown fences, optional language
// @consumers: Pattern, ai-tsx consumers
// @tasks: TSK-74

import { definePromptElement } from '../../prompt-kit/core/define-prompt-element.js';

/** @purpose Optional props for the Snippet block element. */
export type SnippetProps = {
  /** @purpose Programming language for syntax highlighting (e.g. 'typescript') */
  language?: string;
};

/**
 * @purpose Block element for code content without markdown fences.
 * @invariant Fences added by formatter only in MD output. HTML: <Snippet language="ts">code</Snippet>.
 */
export const Snippet = definePromptElement<SnippetProps>({
  tagName: 'Snippet',
  role: 'block',
});
