// @file: Fixture input — unordered list with bullet items
// @consumers: format-fixtures.test.ts
// @tasks: TSK-63

export interface Node {
  type: string;
  props: Record<string, unknown>;
  children?: (Node | string)[];
}

export const tree: Node = {
  type: 'List',
  props: { ordered: false },
  children: ['alpha', 'beta', 'gamma'],
};
