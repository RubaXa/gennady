// @file: HardForbidden element — section with forbidden actions
// @consumers: prompt-kit consumers
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

/** No configurable props — HardForbidden has only children (typically List elements). */
export type HardForbiddenProps = Record<string, never>;

/** Section listing actions that must not be performed. Includes boundary anchors in MD. */
export const HardForbidden = definePromptElement<HardForbiddenProps>({
  tagName: 'HardForbidden',
  role: 'section',
  markdown: { title: () => 'HARD FORBIDDEN:', includeBoundaryComments: true },
});
