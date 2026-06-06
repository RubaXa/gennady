import { definePromptElement } from '../../../define-prompt-element.js';

const Section = definePromptElement({
  role: 'section',
  markdown: { title: (p: Record<string, unknown>) => p.title as string },
});

const tree = {
  type: Symbol.for('react.fragment'),
  props: { children: [{ type: Section, props: { title: 'First' }, children: [] }] },
};

export default tree;
