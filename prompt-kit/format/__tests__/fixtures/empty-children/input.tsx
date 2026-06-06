// @file: Fixture input — elements with empty children
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
    { type: 'Section', props: { title: 'Empty Section' }, children: [] },
    { type: 'List', props: {}, children: [] },
  ],
};
