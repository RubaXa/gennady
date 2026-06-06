// @file: Fixture input — list punctuation: semicolons, dots, and skip existing marks
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
  children: ['regular item', 'has question?', 'ends with dot.', 'shouts!', 'last one'],
};
