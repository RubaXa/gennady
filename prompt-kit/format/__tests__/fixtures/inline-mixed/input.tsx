// @file: Fixture input — mixed inline formatting: bold, text, em in one line
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
      type: 'Bold',
      props: {},
      children: ['bold text'],
    },
    ' plain text ',
    {
      type: 'Em',
      props: {},
      children: ['emphasised text'],
    },
  ],
};
