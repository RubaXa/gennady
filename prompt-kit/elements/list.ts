// @file: List element — ordered or unordered list with optional title
// @consumers: prompt-kit module
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

/**
 * @purpose List element rendering children as list items. Supports ordered numbering and optional title.
 */
export const List = definePromptElement({ tagName: 'List',
  role: 'list',
  markdown: {
    // ordered is read from node.props at render time by MdFormatEngine
    title: (props: Record<string, unknown>) => (props.title as string) ?? undefined,
  },
});
