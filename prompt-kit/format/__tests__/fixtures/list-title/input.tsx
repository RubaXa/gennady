// @file: Fixture input — list with a title
// @consumers: format-fixtures.test.ts
// @tasks: TSK-63

export interface Node {
  type: string;
  props: Record<string, unknown>;
  children?: (Node | string)[];
}

export const tree: Node = {
  type: 'List',
  props: { title: 'My List' },
  children: ['apples', 'oranges', 'bananas'],
};
