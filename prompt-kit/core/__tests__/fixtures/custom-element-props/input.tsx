import { definePromptElement } from '../../../define-prompt-element.js';
import type { JSXNode } from '../../../types.js';

const Section = definePromptElement({
  role: 'section',
  markdown: { title: (p: Record<string, unknown>) => p.title as string },
  xml: { tag: 'my-section' },
});

const tree: JSXNode = {
  type: Section,
  props: { title: 'Advanced', id: 'sec-1', tags: 'a, b' },
  children: [],
};

export default tree;
