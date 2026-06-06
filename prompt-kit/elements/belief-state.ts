// @file: BeliefState element — container section for Axiom elements
// @consumers: prompt-kit module
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

/**
 * @purpose Section acting as a container for Axiom elements. Emits boundary comments in Markdown.
 */
export const BeliefState = definePromptElement({ tagName: 'BeliefState',
  role: 'section',
  markdown: {
    title: () => 'BELIEF STATE',
    includeBoundaryComments: true,
  },
});
