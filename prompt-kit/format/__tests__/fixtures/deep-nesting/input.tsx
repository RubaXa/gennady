// @file: Fixture input — 6 levels of deep section nesting
// @consumers: format-fixtures.test.ts
// @tasks: TSK-63

export interface Node {
  type: string;
  props: Record<string, unknown>;
  children?: (Node | string)[];
}

const buildLevel = (depth: number, max: number): Node => {
  if (depth >= max) {
    return { type: 'Section', props: { title: `Level ${depth}` }, children: ['deepest content'] };
  }
  return {
    type: 'Section',
    props: { title: `Level ${depth}` },
    children: [buildLevel(depth + 1, max)],
  };
};

export const tree: Node = buildLevel(0, 5);
