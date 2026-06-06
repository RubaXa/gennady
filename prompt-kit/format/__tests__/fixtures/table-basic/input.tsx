// @file: Fixture input — basic table with tr/td cells
// @consumers: format-fixtures.test.ts
// @tasks: TSK-63

export interface Node {
  type: string;
  props: Record<string, unknown>;
  children?: (Node | string)[];
}

export const tree: Node = {
  type: 'Table',
  props: {},
  children: [
    {
      type: 'tr',
      props: {},
      children: [
        { type: 'td', props: {}, children: ['Cell 1'] },
        { type: 'td', props: {}, children: ['Cell 2'] },
      ],
    },
    {
      type: 'tr',
      props: {},
      children: [
        { type: 'td', props: {}, children: ['Cell 3'] },
        { type: 'td', props: {}, children: ['Cell 4'] },
      ],
    },
  ],
};
