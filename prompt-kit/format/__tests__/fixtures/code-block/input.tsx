// @file: Fixture input — code block with language and title
// @consumers: format-fixtures.test.ts
// @tasks: TSK-63

export interface Node {
  type: string;
  props: Record<string, unknown>;
  children?: (Node | string)[];
}

export const tree: Node = {
  type: 'Block',
  props: { lang: 'typescript', title: 'Example' },
  children: ['const x = 42;\nconsole.log(x);'],
};
