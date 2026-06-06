// @file: Group and Node — universal elements with dynamic HTML tag via `is` prop
// @consumers: prompt-kit consumers
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

/** Props for the Group universal container. `is` determines the HTML tag name. Extra props become attributes. */
export type GroupProps = {
  /** HTML tag name for this element. Consumed to determine the tag, removed from output attributes. */
  is: string;
  /** Additional attributes passed through to the rendered HTML element. */
  [key: string]: unknown;
};

/** Universal container section. HTML tag = `props.is`. Supports arbitrary extra props as attributes. */
export const Group = definePromptElement<GroupProps>({
  tagName: 'Group',
  role: 'section',
  markdown: {
    title: ({ props }) => (props.is ? `## ${props.is}` : ''),
    includeBoundaryComments: true,
  },
});

/** Props for the Node universal leaf element. `is` determines the HTML tag. */
export type NodeProps = {
  /** HTML tag name for this element. Consumed to determine the tag, removed from output attributes. */
  is: string;
  /** Optional identifier included in anchor name (e.g. `START_CROSSREF_TYPESCRIPT-RULES`). */
  id?: string;
  /** Additional attributes passed through to the rendered HTML element. */
  [key: string]: unknown;
};

/** Universal leaf element. HTML tag = `props.is`. In MD: `- **is:** children`. */
export const Node = definePromptElement<NodeProps>({
  tagName: 'Node',
  role: 'section',
  markdown: {
    title: ({ props }) => `- **${props.is}:**`,
  },
});
