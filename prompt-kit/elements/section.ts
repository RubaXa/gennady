// @file: Section element — universal section with title and optional id
// @consumers: prompt-kit consumers
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

/** Props for the universal Section element. */
export type SectionProps = {
  /** Heading text rendered in MD output. */
  title: string;
  /** Optional identifier — if present, included in anchor name (e.g. `START_SECTION_HELP`). */
  id?: string;
};

/** Universal section with a title. Supports optional id for named anchors. */
export const Section = definePromptElement<SectionProps>({
  tagName: 'Section',
  role: 'section',
  markdown: {
    title: ({ props }) => props.title,
    includeBoundaryComments: true,
  },
});
