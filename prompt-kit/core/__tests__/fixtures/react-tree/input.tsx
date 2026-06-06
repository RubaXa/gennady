import { definePromptElement } from '../../../define-prompt-element.js';

const Section = definePromptElement({
  role: 'section',
  markdown: { title: (p: Record<string, unknown>) => p.title as string },
});

const tree = {
  type: Section,
  props: { title: 'React Style', children: 'nested via props' },
};

export default tree;
