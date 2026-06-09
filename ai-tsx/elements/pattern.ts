// @file: Pattern element — section container with mandatory id, wraps Intent + Snippet + Why
// @consumers: ai-tsx consumers
// @tasks: TSK-74

import { definePromptElement } from '../../prompt-kit/core/define-prompt-element.js';

/** @purpose Required props for Pattern container element. */
export type PatternProps = {
  /** @purpose Stable identifier used in anchor names and boundary comments */
  id: string;
};

/**
 * @purpose Section container for a code pattern: Intent + Snippet + Why.
 * @invariant Must contain Intent, Snippet, and Why children.
 */
export const Pattern = definePromptElement<PatternProps>({
  tagName: 'Pattern',
  role: 'section',
  markdown: {
    title: ({ props }) => `Pattern (${props.id})`,
    includeBoundaryComments: true,
  },
});
