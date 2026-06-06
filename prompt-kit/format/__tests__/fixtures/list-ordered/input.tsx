// @file: Fixture input — ordered list with numbered items
// @consumers: format-fixtures.test.ts
// @tasks: TSK-63

export interface Node {
  type: string;
  props: Record<string, unknown>;
  children?: (Node | string)[];
}

export const tree: Node = {
  type: 'List',
  props: { ordered: true },
  children: ['one', 'two', 'three'],
};
