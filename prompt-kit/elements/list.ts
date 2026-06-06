// @file: List element — ordered or unordered list with optional title
// @consumers: prompt-kit consumers
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

/** Props for the List element. */
export type ListProps = {
  /** If true, items are numbered (1., 2., …) instead of bulleted (-). */
  ordered?: boolean;
  /** Optional title rendered as `**title**:` before list items in MD. */
  title?: string;
};

/** Ordered or unordered list. All children are treated as list items with auto-punctuation. */
export const List = definePromptElement<ListProps>({
  tagName: 'List',
  role: 'list',
  markdown: {
    title: ({ props }) => (props.title ? `**${props.title}**:` : ''),
  },
});
