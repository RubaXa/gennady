import { definePromptElement } from '../../../define-prompt-element.js';
import type { JSXNode } from '../../../types.js';

const Section = definePromptElement({
  role: 'section',
  markdown: { title: (p: Record<string, unknown>) => p.title as string },
});

const Wrapper = (_props: Record<string, unknown>): JSXNode => ({
  type: Section,
  props: { title: 'Wrapped Content' },
  children: [],
});

export default Wrapper;
