import { List } from '../../../index.js';
import type { JSXNode } from '../../../core/types.js';

const tree: JSXNode = {
  type: List,
  props: { ordered: true } as Record<string, unknown>,
  children: [
    { type: 'li', props: {}, children: ['first'] } as unknown as JSXNode,
    { type: 'li', props: {}, children: ['second'] } as unknown as JSXNode,
  ],
};

export default tree;
