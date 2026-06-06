// @file: PrimaryGoal element — top-level goal section for an agent directive
// @consumers: prompt-kit module
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

/**
 * @purpose Section declaring the primary goal of an agent directive. Emits boundary comments in Markdown.
 */
export const PrimaryGoal = definePromptElement({ tagName: 'PrimaryGoal',
  role: 'section',
  markdown: {
    title: () => 'PRIMARY GOAL',
    includeBoundaryComments: true,
  },
});
