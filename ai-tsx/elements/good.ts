// @file: Good element — block code without markdown fences, optional language (inside AntiPattern)
// @consumers: AntiPattern, ai-tsx consumers
// @tasks: TSK-74

import { definePromptElement } from '../../prompt-kit/core/define-prompt-element.js';

/** @purpose Optional props for the Good block element. */
export type GoodProps = {
  /** @purpose Programming language for syntax highlighting (e.g. 'typescript') */
  language?: string;
};

/**
 * @purpose Block element for correct code content inside AntiPattern, without markdown fences.
 * @invariant Fences added by formatter only in MD output. HTML: <Good language="ts">code</Good>.
 */
export const Good = definePromptElement<GoodProps>({
  tagName: 'Good',
  role: 'block',
});
