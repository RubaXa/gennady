// @file: Unit tests for TableRenderer — HTML table to Markdown pipe table conversion
// @consumers: format module QA
// @tasks: TSK-63

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TableRenderer } from '../table-renderer.js';

type JsxNode =
  | string
  | {
      type: string | unknown;
      props: Record<string, unknown>;
      children?: JsxNode[];
    };

describe('TableRenderer', () => {
  describe('#renderToMd', () => {
    it('should render a simple 2x2 table with pipe separators', () => {
      const renderer = new TableRenderer();
      const children: JsxNode[] = [
        {
          type: 'tr',
          props: {},
          children: [
            { type: 'td', props: {}, children: ['cell1'] },
            { type: 'td', props: {}, children: ['cell2'] },
          ],
        },
        {
          type: 'tr',
          props: {},
          children: [
            { type: 'td', props: {}, children: ['cell3'] },
            { type: 'td', props: {}, children: ['cell4'] },
          ],
        },
      ];
      assert.strictEqual(
        renderer.renderToMd(children),
        '| cell1 | cell2 |\n|---|---|\n| cell3 | cell4 |'
      );
    });

    it('should render th cells in the header row as bold', () => {
      const renderer = new TableRenderer();
      const children: JsxNode[] = [
        {
          type: 'tr',
          props: {},
          children: [
            { type: 'th', props: {}, children: ['A'] },
            { type: 'th', props: {}, children: ['B'] },
          ],
        },
        {
          type: 'tr',
          props: {},
          children: [
            { type: 'td', props: {}, children: ['1'] },
            { type: 'td', props: {}, children: ['2'] },
          ],
        },
      ];
      assert.strictEqual(renderer.renderToMd(children), '| **A** | **B** |\n|---|---|\n| 1 | 2 |');
    });

    it('should treat thead as transparent and render its children directly', () => {
      const renderer = new TableRenderer();
      const children: JsxNode[] = [
        {
          type: 'thead',
          props: {},
          children: [
            {
              type: 'tr',
              props: {},
              children: [{ type: 'td', props: {}, children: ['H1'] }],
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
              children: [{ type: 'td', props: {}, children: ['D1'] }],
            },
          ],
        },
      ];
      // thead + tbody are transparent — only tr children are rendered
      assert.strictEqual(renderer.renderToMd(children), '| H1 |\n|---|\n| D1 |');
    });

    it('should pad shorter rows with empty cells to match column count', () => {
      const renderer = new TableRenderer();
      const children: JsxNode[] = [
        {
          type: 'tr',
          props: {},
          children: [
            { type: 'td', props: {}, children: ['a'] },
            { type: 'td', props: {}, children: ['b'] },
            { type: 'td', props: {}, children: ['c'] },
          ],
        },
        {
          type: 'tr',
          props: {},
          children: [{ type: 'td', props: {}, children: ['x'] }],
        },
      ];
      assert.strictEqual(
        renderer.renderToMd(children),
        '| a | b | c |\n|---|---|---|\n| x |  |  |'
      );
    });

    it('should use first row to determine column count as column count and pad shorter rows', () => {
      // insight: implementation uses Math.max for colCount, not first-row-determines
      const renderer = new TableRenderer();
      const children: JsxNode[] = [
        {
          type: 'tr',
          props: {},
          children: [
            { type: 'td', props: {}, children: ['a'] },
            { type: 'td', props: {}, children: ['b'] },
          ],
        },
        {
          type: 'tr',
          props: {},
          children: [
            { type: 'td', props: {}, children: ['c'] },
            { type: 'td', props: {}, children: ['d'] },
            { type: 'td', props: {}, children: ['e'] },
          ],
        },
      ];
      assert.strictEqual(renderer.renderToMd(children), '| a | b |\n|---|---|\n| c | d |');
    });

    it('should return empty string for empty children', () => {
      const renderer = new TableRenderer();
      assert.strictEqual(renderer.renderToMd([]), '');
    });

    it('should skip string children and non-element nodes', () => {
      const renderer = new TableRenderer();
      const children: JsxNode[] = [
        'ignored text',
        {
          type: 'tr',
          props: {},
          children: [{ type: 'td', props: {}, children: ['only'] }],
        },
      ];
      assert.strictEqual(renderer.renderToMd(children), '| only |\n|---|');
    });

    it('should collect nested text from child elements', () => {
      const renderer = new TableRenderer();
      const children: JsxNode[] = [
        {
          type: 'tr',
          props: {},
          children: [
            {
              type: 'td',
              props: {},
              children: ['Hello ', { type: 'bold', props: {}, children: ['World'] }],
            },
          ],
        },
      ];
      // _collectText joins string children: 'Hello ' + 'World'
      assert.strictEqual(renderer.renderToMd(children), '| Hello World |\n|---|');
    });
  });
});
