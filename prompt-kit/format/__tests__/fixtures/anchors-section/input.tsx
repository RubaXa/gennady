// @file: Fixture input — sections with paired boundary anchors
// @consumers: format-fixtures.test.ts
// @tasks: TSK-63

export interface Node {
  type: string;
  props: Record<string, unknown>;
  children?: (Node | string)[];
}

export const tree: Node = {
  type: 'Section',
  props: { title: 'Primary Goal', anchors: true },
  children: ['This is the primary goal content'],
};
