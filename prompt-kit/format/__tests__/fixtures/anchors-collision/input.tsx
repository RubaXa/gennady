// @file: Fixture input — two sections with identical params, second anchor suppressed
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
      type: 'Section',
      props: { title: 'Collide Me', anchors: true },
      children: ['first occurrence'],
    },
    {
      type: 'Section',
      props: { title: 'Collide Me', anchors: true },
      children: ['second occurrence — anchor suppressed'],
    },
  ],
};
