// @file: Bold element — inline bold text
// @consumers: prompt-kit consumers
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

/** No configurable props — Bold wraps children only. */
export type BoldProps = Record<string, never>;

/** Inline bold text. In MD: `**children**`. In HTML: `<bold>children</bold>`. */
export const Bold = definePromptElement<BoldProps>({
  tagName: 'Bold',
  role: 'inline',
});
