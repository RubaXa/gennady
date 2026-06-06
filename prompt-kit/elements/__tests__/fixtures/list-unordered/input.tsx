import { List, Bold } from '../../../index.js';
import type { JSXNode } from '../../../core/types.js';

const tree: JSXNode = {
  type: List,
  props: {},
  children: [
    'a',
    {
      type: Bold,
      props: {},
      children: ['b'] as unknown as JSXNode[],
    },
  ],
};

export default tree;
