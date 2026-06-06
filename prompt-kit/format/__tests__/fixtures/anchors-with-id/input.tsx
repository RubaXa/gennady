// @file: Fixture input — axiom with id attribute in anchor name
// @consumers: format-fixtures.test.ts
// @tasks: TSK-63

export interface Node {
  type: string;
  props: Record<string, unknown>;
  children?: (Node | string)[];
}

export const tree: Node = {
  type: 'Section',
  props: { title: 'Axiom', id: 'AX_1', anchors: true },
  children: ['Axiom text content'],
};
