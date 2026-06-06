import { definePromptElement } from '../../../define-prompt-element.js';
import type { JSXNode } from '../../../types.js';

const Section = definePromptElement({
  role: 'section',
  markdown: { title: (p: Record<string, unknown>) => p.title as string },
});

const Inline = definePromptElement({
  role: 'inline',
  markdown: { wrapper: '**' },
  xml: { tag: 'bold' },
});

const tree = {
  type: Section,
  props: {
    title: 'Mixed',
    children: [
      { type: Inline, props: { id: 'a1' }, children: [] },
      { type: 'b', props: {}, children: [] },
    ] as JSXNode[],
  },
};

export default tree;
