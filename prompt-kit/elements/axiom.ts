// @file: Axiom element — named axiom section with required id
// @consumers: prompt-kit consumers
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

export const Axiom = definePromptElement({
  tagName: 'Axiom',
  role: 'section',
  markdown: {
    title: ({ tagName, props }) => `${tagName} \`${props.id}\``,
    includeBoundaryComments: true,
  },
});
