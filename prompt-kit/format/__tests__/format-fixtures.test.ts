// @file: Fixture-driven format validation — renders each input.tsx tree and compares XML/MD output to expected
// @consumers: format module QA
// @tasks: TSK-63

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { XmlFormatter } from '../xml-formatter.js';
import { MdFormatter } from '../md-formatter.js';
import { ListPunctuation } from '../list-punctuation.js';
import { TableRenderer } from '../table-renderer.js';

import { tree as nestedSectionsTree } from './fixtures/nested-sections/input.js';
import { tree as sectionInsideListTree } from './fixtures/section-inside-list/input.js';
import { tree as listOrderedTree } from './fixtures/list-ordered/input.js';
import { tree as listUnorderedTree } from './fixtures/list-unordered/input.js';
import { tree as listTitleTree } from './fixtures/list-title/input.js';
import { tree as listPunctuationTree } from './fixtures/list-punctuation/input.js';
import { tree as listNestedSectionsTree } from './fixtures/list-nested-sections/input.js';
import { tree as codeBlockTree } from './fixtures/code-block/input.js';
import { tree as codeInsideListTree } from './fixtures/code-inside-list/input.js';
import { tree as tableBasicTree } from './fixtures/table-basic/input.js';
import { tree as tableTheadTbodyTree } from './fixtures/table-thead-tbody/input.js';
import { tree as anchorsSectionTree } from './fixtures/anchors-section/input.js';
import { tree as anchorsWithIdTree } from './fixtures/anchors-with-id/input.js';
import { tree as anchorsCollisionTree } from './fixtures/anchors-collision/input.js';
import { tree as inlineMixedTree } from './fixtures/inline-mixed/input.js';
import { tree as promptKeywordsTree } from './fixtures/prompt-keywords/input.js';
import { tree as emptyChildrenTree } from './fixtures/empty-children/input.js';
import { tree as deepNestingTree } from './fixtures/deep-nesting/input.js';

// ── Tree node contract ──────────────────────────────────────────────────────

interface Node {
  type: string;
  props: Record<string, unknown>;
  children?: (Node | string)[];
}

// ── XML helpers ─────────────────────────────────────────────────────────────

const xmlFormatter = new XmlFormatter();
const listPunctuation = new ListPunctuation();

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildAttrStr(props: Record<string, unknown>): string {
  const entries = Object.entries(props).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) return '';
  return ' ' + entries.map(([k, v]) => `${k}="${escapeAttr(String(v))}"`).join(' ');
}

// ── XML renderer ────────────────────────────────────────────────────────────

function renderXml(node: Node | string, depth: number): string {
  if (typeof node === 'string') {
    return node
      .split('\n')
      .map((line) => escapeText(line))
      .join('\n');
  }

  const { type, props, children = [] } = node;
  const indent = '  '.repeat(depth);
  const childIndent = '  '.repeat(depth + 1);

  if (type === 'Bold') {
    const childXml = children.map((c) => renderXml(c as Node, depth + 1)).join('');
    return xmlFormatter.formatInline('bold', props, childXml);
  }
  if (type === 'Em') {
    const childXml = children.map((c) => renderXml(c as Node, depth + 1)).join('');
    return xmlFormatter.formatInline('em', props, childXml);
  }

  if (type === 'thead' || type === 'tbody') {
    return children.map((c) => renderXml(c as Node, depth)).join('\n');
  }

  if (type === 'tr') {
    const cellXml = children.map((c) => renderXml(c as Node, depth + 1)).join('');
    const attrStr = buildAttrStr(props);
    if (!cellXml.trim()) return `${indent}<tr${attrStr}/>`;
    return `${indent}<tr${attrStr}>\n${childIndent}${cellXml}\n${indent}</tr>`;
  }

  if (type === 'td' || type === 'th') {
    const cellText = children.map((c) => renderXml(c as Node, 0)).join('');
    const attrStr = buildAttrStr(props);
    if (!cellText.trim()) return `${indent}<${type}${attrStr}/>`;
    return `${indent}<${type}${attrStr}>${escapeText(cellText)}</${type}>`;
  }

  if (type === 'List') {
    const itemCount = children.length;
    const renderedItems = children.map((child, idx) => {
      const raw = renderXml(child as Node, depth + 1);
      return listPunctuation.punctuate(raw, idx === itemCount - 1);
    });
    const joined = renderedItems.join('\n');
    const attrStr = buildAttrStr(props);
    if (joined.trim() === '') return `${indent}<List${attrStr}/>`;
    const indented = joined
      .split('\n')
      .map((ln) => (ln ? childIndent + ln : ''))
      .join('\n');
    return `${indent}<List${attrStr}>\n${indented}\n${indent}</List>`;
  }

  const childFragments = children.map((c) => renderXml(c as Node, depth + 1));
  const joined = childFragments.join('\n');
  const attrStr = buildAttrStr(props);

  if (joined.trim() === '') {
    return `${indent}<${type}${attrStr}/>`;
  }

  const indented = joined
    .split('\n')
    .map((ln) => (ln ? childIndent + ln : ''))
    .join('\n');
  return `${indent}<${type}${attrStr}>\n${indented}\n${indent}</${type}>`;
}

// ── MD renderer ─────────────────────────────────────────────────────────────

const tableRenderer = new TableRenderer();

function renderMd(node: Node | string, depth: number, mdFormatter: MdFormatter): string {
  if (typeof node === 'string') return node;

  const { type, props, children = [] } = node;

  if (type === 'Prompt') {
    return children
      .map((c) => renderMd(c as Node, depth, mdFormatter))
      .filter(Boolean)
      .join('\n\n');
  }

  if (type === 'Section') {
    const title = (props.title as string) ?? '';
    let anchors: { start: string; end: string } | undefined;
    if (props.anchors) {
      const anchorProps: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(props)) {
        if (k !== 'anchors' && k !== 'type') anchorProps[k] = v;
      }
      const ab = (mdFormatter as any)._anchorBuilder;
      anchors = {
        start: ab.buildStart(type, anchorProps),
        end: ab.buildEnd(type, anchorProps),
      };
    }
    const childMd = children
      .map((c) => renderMd(c as Node, depth + 1, mdFormatter))
      .filter(Boolean)
      .join('\n\n');
    return mdFormatter.formatSection(title, childMd, depth, anchors);
  }

  if (type === 'List') {
    const ordered = props.ordered === true;
    const title = props.title as string | undefined;
    const itemCount = children.length;
    const parts: string[] = [];

    if (title) parts.push(`**${title}:**`);

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      let raw: string;
      if (typeof child === 'string') {
        raw = child;
      } else if ((child as Node).type === 'Section') {
        raw = renderSectionInList(child as Node, depth + 1, mdFormatter);
      } else {
        raw = renderMd(child as Node, depth + 1, mdFormatter);
      }
      raw = listPunctuation.punctuate(raw, i === itemCount - 1);
      const prefix = ordered ? `${i + 1}. ` : '- ';
      const lines = raw.split('\n');
      parts.push(prefix + lines[0]);
      for (let j = 1; j < lines.length; j++) {
        parts.push('  ' + lines[j]);
      }
    }

    return parts.join('\n');
  }

  if (type === 'Block') {
    const lang = props.lang as string | undefined;
    const title = props.title as string | undefined;
    const childMd = children.map((c) => renderMd(c as Node, depth + 1, mdFormatter)).join('\n');
    return mdFormatter.formatBlock(childMd, lang, title);
  }

  if (type === 'Table') {
    interface JsxNode {
      type: string | unknown;
      props: Record<string, unknown>;
      children?: JsxNode[];
    }
    function toJsxNode(n: Node | string): JsxNode | string {
      if (typeof n === 'string') return n;
      return { type: n.type, props: n.props, children: n.children?.map(toJsxNode) };
    }
    return tableRenderer.renderToMd(children.map(toJsxNode) as JsxNode[]);
  }

  if (type === 'thead' || type === 'tbody') {
    return children.map((c) => renderMd(c as Node, depth, mdFormatter)).join('\n');
  }

  if (type === 'tr') {
    return children.map((c) => renderMd(c as Node, depth + 1, mdFormatter)).join(' | ');
  }

  if (type === 'td') {
    return children.map((c) => renderMd(c as Node, 0, mdFormatter)).join('');
  }

  if (type === 'th') {
    const cellContent = children.map((c) => renderMd(c as Node, 0, mdFormatter)).join('');
    return `**${cellContent}**`;
  }

  if (type === 'Bold') {
    const childMd = children.map((c) => renderMd(c as Node, 0, mdFormatter)).join('');
    return mdFormatter.formatInline('**', childMd);
  }

  if (type === 'Em') {
    const childMd = children.map((c) => renderMd(c as Node, 0, mdFormatter)).join('');
    return mdFormatter.formatInline('*', childMd);
  }

  return children.map((c) => renderMd(c as Node, depth + 1, mdFormatter)).join('\n');
}

function renderSectionInList(node: Node, depth: number, mdFormatter: MdFormatter): string {
  const title = (node.props.title as string) ?? '';
  const childMd = (node.children ?? [])
    .map((c) => renderMd(c as Node, depth + 1, mdFormatter))
    .filter(Boolean)
    .join(' ');
  return mdFormatter.formatSectionInline(title, childMd);
}

// ── Helper ──────────────────────────────────────────────────────────────────

function trimOne(s: string): string {
  return s.endsWith('\n') ? s.slice(0, -1) : s;
}

function loadExpected(fixtureName: string): { xml: string; md: string } {
  const dir = join(import.meta.dirname ?? __dirname, 'fixtures', fixtureName);
  return {
    xml: trimOne(readFileSync(join(dir, 'expected.xml'), 'utf8')),
    md: trimOne(readFileSync(join(dir, 'expected.md'), 'utf8')),
  };
}

// ── Fixture registry ────────────────────────────────────────────────────────

const fixtures: Record<string, Node> = {
  'nested-sections': nestedSectionsTree as Node,
  'section-inside-list': sectionInsideListTree as Node,
  'list-ordered': listOrderedTree as Node,
  'list-unordered': listUnorderedTree as Node,
  'list-title': listTitleTree as Node,
  'list-punctuation': listPunctuationTree as Node,
  'list-nested-sections': listNestedSectionsTree as Node,
  'code-block': codeBlockTree as Node,
  'code-inside-list': codeInsideListTree as Node,
  'table-basic': tableBasicTree as Node,
  'table-thead-tbody': tableTheadTbodyTree as Node,
  'anchors-section': anchorsSectionTree as Node,
  'anchors-with-id': anchorsWithIdTree as Node,
  'anchors-collision': anchorsCollisionTree as Node,
  'inline-mixed': inlineMixedTree as Node,
  'prompt-keywords': promptKeywordsTree as Node,
  'empty-children': emptyChildrenTree as Node,
  'deep-nesting': deepNestingTree as Node,
};

describe('Format fixtures', () => {
  for (const [name, tree] of Object.entries(fixtures)) {
    it(`should render ${name} to expected XML and Markdown`, () => {
      const expected = loadExpected(name);

      const actualXml = trimOne(renderXml(tree, 0));
      const actualMd = trimOne(renderMd(tree, 0, new MdFormatter()));

      const actual = { xml: actualXml, md: actualMd };
      assert.deepStrictEqual(actual, expected);
    });
  }
});
