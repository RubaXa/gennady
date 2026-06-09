// @file: Hook element — section container with mandatory id, wraps Purpose + Command + Expected
// @consumers: ai-tsx consumers
// @tasks: TSK-74

import { definePromptElement } from '../../prompt-kit/core/define-prompt-element.js';

/** @purpose Required props for Hook container element. */
export type HookProps = {
  /** @purpose Stable identifier used in anchor names and boundary comments */
  id: string;
};

/**
 * @purpose Section container for a verification hook: Purpose + Command + Expected.
 * @invariant Must contain Purpose, Command, and Expected children.
 */
export const Hook = definePromptElement<HookProps>({
  tagName: 'Hook',
  role: 'section',
  markdown: {
    title: ({ props }) => `Hook (${props.id})`,
    includeBoundaryComments: true,
  },
});
