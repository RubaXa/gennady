// @file: HardForbidden element — section with forbidden actions
// @consumers: prompt-kit consumers
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

export const HardForbidden = definePromptElement({
  tagName: 'HardForbidden',
  role: 'section',
  markdown: { title: () => 'HARD FORBIDDEN:', includeBoundaryComments: true },
});
