import { Code } from '../../../index.js';

const tree = {
  type: Code,
  props: { title: 'Пример', lang: 'ts' },
  children: ['const x = 1'] as unknown as never[],
};

export default tree;
