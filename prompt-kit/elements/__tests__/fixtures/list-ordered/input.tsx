import { List, Bold } from '../../../index.js';
import type { JSXNode } from '../../../core/types.js';

const tree: JSXNode = {
  type: List,
  props: { ordered: true },
  children: [
    'первый',
    {
      type: Bold,
      props: {},
      children: ['второй'] as unknown as JSXNode[],
    },
  ],
};

export default tree;
