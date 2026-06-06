// @file: Bold element — inline bold text wrapping
// @consumers: prompt-kit module
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

/**
 * @purpose Inline element wrapping children in bold (**).
 */
export const Bold = definePromptElement({ tagName: 'Bold',
  role: 'inline',
  markdown: {
    wrapper: '**',
  },
});
