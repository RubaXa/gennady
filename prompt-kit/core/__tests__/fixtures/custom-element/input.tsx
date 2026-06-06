import { definePromptElement } from '../../../define-prompt-element.js';
import type { JSXNode } from '../../../types.js';

const Section = definePromptElement({
  role: 'section',
  markdown: { title: (p: Record<string, unknown>) => p.title as string },
});

const tree: JSXNode = {
  type: Section,
  props: { title: 'Custom Element' },
  children: [],
};

export default tree;
