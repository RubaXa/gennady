// @file: PrimaryGoal element — section with the agent's primary goal
// @consumers: prompt-kit consumers
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

/** No configurable props — PrimaryGoal has only children. */
export type PrimaryGoalProps = Record<string, never>;

/** Section declaring the agent's primary objective. Includes boundary anchors in MD output. */
export const PrimaryGoal = definePromptElement<PrimaryGoalProps>({
  tagName: 'PrimaryGoal',
  role: 'section',
  markdown: { title: () => 'PRIMARY GOAL:', includeBoundaryComments: true },
});
