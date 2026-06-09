// @file: Definition element — section container with mandatory id, wraps arbitrary content
// @consumers: ai-tsx consumers
// @tasks: TSK-74

import { definePromptElement } from '../../prompt-kit/core/define-prompt-element.js';

/** @purpose Required props for Definition container element. */
export type DefinitionProps = {
  /** @purpose Stable identifier used in anchor names and boundary comments */
  id: string;
};

/**
 * @purpose Section container for a named definition with arbitrary text or nested elements.
 * @invariant Must have a unique id within the enclosing scope.
 */
export const Definition = definePromptElement<DefinitionProps>({
  tagName: 'Definition',
  role: 'section',
  markdown: {
    title: ({ props }) => `Definition (${props.id})`,
    includeBoundaryComments: true,
  },
});
