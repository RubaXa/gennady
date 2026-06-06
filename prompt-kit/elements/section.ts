// @file: Section element — general-purpose titled section with optional id-based anchors
// @consumers: prompt-kit module
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

/**
 * @purpose General-purpose section with a required title and optional id for anchor generation.
 */
export const Section = definePromptElement({ tagName: 'Section',
  role: 'section',
  markdown: {
    title: (props: Record<string, unknown>) => props.title as string,
    includeBoundaryComments: true,
  },
});
