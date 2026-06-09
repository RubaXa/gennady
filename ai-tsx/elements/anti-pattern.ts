// @file: AntiPattern element — section container with mandatory id, wraps Bad + WhyBad + Good
// @consumers: ai-tsx consumers
// @tasks: TSK-74

import { definePromptElement } from '../../prompt-kit/core/define-prompt-element.js';

/** @purpose Required props for AntiPattern container element. */
export type AntiPatternProps = {
  /** @purpose Stable identifier used in anchor names and boundary comments */
  id: string;
};

/**
 * @purpose Section container for an anti-pattern example: Bad + WhyBad + Good.
 * @invariant Must contain Bad, WhyBad, and Good children.
 */
export const AntiPattern = definePromptElement<AntiPatternProps>({
  tagName: 'AntiPattern',
  role: 'section',
  markdown: {
    title: ({ props }) => `AntiPattern (${props.id})`,
    includeBoundaryComments: true,
  },
});
