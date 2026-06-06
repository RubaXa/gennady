// @file: Fixture input — code block inside a list
// @consumers: format-fixtures.test.ts
// @tasks: TSK-63

export interface Node {
  type: string;
  props: Record<string, unknown>;
  children?: (Node | string)[];
}

export const tree: Node = {
  type: 'List',
  props: {},
  children: [
    'description item',
    {
      type: 'Block',
      props: { lang: 'json' },
      children: ['{\n  "key": "value"\n}'],
    },
    'final item',
  ],
};
