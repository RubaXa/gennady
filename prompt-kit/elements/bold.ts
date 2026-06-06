// @file: Bold element — inline bold text
// @consumers: prompt-kit consumers
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

export type BoldProps = Record<string, never>;

export const Bold = definePromptElement<BoldProps>({
  tagName: 'Bold',
  role: 'inline',
});
