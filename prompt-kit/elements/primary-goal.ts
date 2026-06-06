// @file: PrimaryGoal element — section with the agent's primary goal
// @consumers: prompt-kit consumers
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

export type PrimaryGoalProps = Record<string, never>;

export const PrimaryGoal = definePromptElement<PrimaryGoalProps>({
  tagName: 'PrimaryGoal',
  role: 'section',
  markdown: { title: () => 'PRIMARY GOAL:', includeBoundaryComments: true },
});
