// @file: BeliefState element — section container for axioms
// @consumers: prompt-kit consumers
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

export const BeliefState = definePromptElement({
  tagName: 'BeliefState',
  role: 'section',
  markdown: { title: () => 'BELIEF STATE:', includeBoundaryComments: true },
});
