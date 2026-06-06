// @file: HardForbidden element — section with forbidden actions
// @consumers: prompt-kit consumers
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

export type HardForbiddenProps = Record<string, never>;

export const HardForbidden = definePromptElement<HardForbiddenProps>({
  tagName: 'HardForbidden',
  role: 'section',
  markdown: { title: () => 'HARD FORBIDDEN:', includeBoundaryComments: true },
});
