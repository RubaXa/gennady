// @file: Fixture input — section inside a list
// @consumers: format-fixtures.test.ts
// @tasks: TSK-63

export interface Node {
  type: string;
  props: Record<string, unknown>;
  children?: (Node | string)[];
}

export const tree: Node = {
  type: 'Prompt',
  props: {},
  children: [
    {
      type: 'List',
      props: {},
      children: [
        'First item',
        {
          type: 'Section',
          props: { title: 'Inside List Section' },
          children: ['text inside section in list'],
        },
        'Last item',
      ],
    },
  ],
};
