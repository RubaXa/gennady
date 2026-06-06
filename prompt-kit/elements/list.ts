// @file: List element — ordered or unordered list with optional title
// @consumers: prompt-kit consumers
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

export type ListProps = { ordered?: boolean; title?: string };

export const List = definePromptElement<ListProps>({
  tagName: 'List',
  role: 'list',
  markdown: {
    title: ({ props }) => (props.title ? `**${props.title}**:` : ''),
  },
});
