// @file: BeliefState element — section container for axioms
// @consumers: prompt-kit consumers
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

/** No configurable props — BeliefState has only children (Axiom elements). */
export type BeliefStateProps = Record<string, never>;

/** Section containing Axiom elements. Includes boundary anchors in MD. */
export const BeliefState = definePromptElement<BeliefStateProps>({
  tagName: 'BeliefState',
  role: 'section',
  markdown: { title: () => 'BELIEF STATE:', includeBoundaryComments: true },
});
