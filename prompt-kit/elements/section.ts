// @file: Section element — universal section with title and optional id
// @consumers: prompt-kit consumers
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

export type SectionProps = { title: string; id?: string };

export const Section = definePromptElement<SectionProps>({
  tagName: 'Section',
  role: 'section',
  markdown: {
    title: ({ props }) => props.title,
    includeBoundaryComments: true,
  },
});
