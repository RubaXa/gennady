// @file: Fixture input — multiple sections nested inside a list
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
    {
      type: 'Section',
      props: { title: 'First axiom' },
      children: ['axiom one body'],
    },
    {
      type: 'Section',
      props: { title: 'Second axiom' },
      children: ['axiom two body'],
    },
    {
      type: 'Section',
      props: { title: 'Third rule' },
      children: ['rule three body'],
    },
  ],
};
