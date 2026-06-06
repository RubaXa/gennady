// @file: HardForbidden element — section declaring forbidden actions for an agent
// @consumers: prompt-kit module
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

/**
 * @purpose Section declaring actions that are strictly forbidden. Typically contains a List. Emits boundary comments in Markdown.
 */
export const HardForbidden = definePromptElement({ tagName: 'HardForbidden',
  role: 'section',
  markdown: {
    title: () => 'HARD FORBIDDEN',
    includeBoundaryComments: true,
  },
});
