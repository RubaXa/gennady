// @file: Fixture input — prompt with keywords attribute
// @consumers: format-fixtures.test.ts
// @tasks: TSK-63

export interface Node {
  type: string;
  props: Record<string, unknown>;
  children?: (Node | string)[];
}

export const tree: Node = {
  type: 'Prompt',
  props: { keywords: 'format,xml,markdown' },
  children: ['Prompt body with keywords'],
};
