// @file: Group and Node — universal elements. HTML tag = props.is, removed from attributes.
// @consumers: prompt-kit consumers
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

export const Group = definePromptElement({
  tagName: 'Group',
  role: 'section',
  markdown: {
    title: ({ props }) => (props.is ? `## ${props.is}` : ''),
    includeBoundaryComments: true,
  },
});

export const Node = definePromptElement({
  tagName: 'Node',
  role: 'inline',
  markdown: {
    renderChildren: ({ children, props }) => `- **${props.is}:** ${children}`,
  },
});
