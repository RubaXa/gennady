// @file: Group and Node — universal elements. HTML tag = props.is, removed from attributes.
// @consumers: prompt-kit consumers
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

export type GroupProps = { is: string; [key: string]: unknown };

export const Group = definePromptElement<GroupProps>({
  tagName: 'Group',
  role: 'section',
  markdown: {
    title: ({ props }) => (props.is ? `## ${props.is}` : ''),
    includeBoundaryComments: true,
  },
});

export type NodeProps = { is: string; id?: string; [key: string]: unknown };

export const Node = definePromptElement<NodeProps>({
  tagName: 'Node',
  role: 'section',
  markdown: {
    title: ({ props }) => `- **${props.is}:**`,
  },
});
