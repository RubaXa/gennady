import { List } from '../../../index.js';
import type { JSXNode } from '../../../core/types.js';

const tree: JSXNode = {
  type: List,
  props: {} as Record<string, unknown>,
  children: [
    { type: 'li', props: {}, children: ['alpha'] } as unknown as JSXNode,
  ],
};

export default tree;
