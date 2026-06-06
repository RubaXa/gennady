// @file: Section element — universal section with title and optional id
// @consumers: prompt-kit consumers
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

export const Section = definePromptElement({
  tagName: 'Section',
  role: 'section',
  markdown: {
    title: ({ props }) => props.title as string,
    includeBoundaryComments: true,
  },
});
