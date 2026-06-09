import { Section, List } from '../../../index.js';
import type { JSXNode } from '../../../core/types.js';

const tree: JSXNode = {
  type: Section,
  props: { title: 'Protocol' },
  children: [
    'Some text',
    {
      type: List,
      props: { ordered: true, forcedFormat: 'md' } as Record<string, unknown>,
      children: ['alpha', 'beta', 'gamma'],
    } as unknown as JSXNode,
  ],
};

export default tree;
