// @file: Bold element — inline bold text
// @consumers: prompt-kit consumers
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

export const Bold = definePromptElement({
  tagName: 'Bold',
  role: 'inline',
});
