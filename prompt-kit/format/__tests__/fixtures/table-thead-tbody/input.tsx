// @file: Fixture input — table with thead/tbody transparent wrappers
// @consumers: format-fixtures.test.ts
// @tasks: TSK-63

export interface Node {
  type: string;
  props: Record<string, unknown>;
  children?: (Node | string)[];
}

export const tree: Node = {
  type: 'Table',
  props: {},
  children: [
    {
      type: 'thead',
      props: {},
      children: [
        {
          type: 'tr',
          props: {},
          children: [
            { type: 'th', props: {}, children: ['Name'] },
            { type: 'th', props: {}, children: ['Value'] },
          ],
        },
      ],
    },
    {
      type: 'tbody',
      props: {},
      children: [
        {
          type: 'tr',
          props: {},
          children: [
            { type: 'td', props: {}, children: ['alpha'] },
            { type: 'td', props: {}, children: ['1'] },
          ],
        },
      ],
    },
  ],
};
