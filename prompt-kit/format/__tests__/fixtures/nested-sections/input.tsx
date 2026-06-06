// @file: Fixture input — nested sections at depth 0, 1, 2
// @consumers: format-fixtures.test.ts
// @tasks: TSK-63

export interface Node {
  type: string;
  props: Record<string, unknown>;
  children?: (Node | string)[];
}

export const tree: Node = {
  type: 'Section',
  props: { title: 'Top Level' },
  children: [
    'Content at depth 0',
    {
      type: 'Section',
      props: { title: 'Nested Level 1' },
      children: [
        'Content at depth 1',
        {
          type: 'Section',
          props: { title: 'Nested Level 2' },
          children: ['Content at depth 2'],
        },
      ],
    },
  ],
};
