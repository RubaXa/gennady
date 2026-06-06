import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { TreeWalker } from '../tree-walker.js';
import { definePromptElement } from '../define-prompt-element.js';
import { htmlTagRegistry } from '../html-tag-registry.js';
import type { RenderContext, TFormatEngine, JSXNode } from '../types.js';

function makeCtx(overrides?: Partial<RenderContext>): RenderContext {
  return { depth: 0, inList: false, format: 'xml', ...overrides };
}

function createMockEngine(): TFormatEngine {
  return {
    formatSection: mock.fn((_ctx, children) => `[section:${children}]`),
    formatList: mock.fn((_ctx, children) => `[list:${children}]`),
    formatBlock: mock.fn((_ctx, children) => `[block:${children}]`),
    formatInline: mock.fn((_ctx, children) => `[inline:${children}]`),
  };
}

describe('TreeWalker', () => {
  describe('section → formatSection', () => {
    it('calls formatSection with depth+1 for children', async () => {
      const engine = createMockEngine();
      const walker = new TreeWalker(engine);
      const section = definePromptElement({ role: 'section' });
      const childNode: JSXNode = {
        type: definePromptElement({ role: 'inline' }),
        props: {},
        children: [],
      };
      const tree: JSXNode = {
        type: section,
        props: {},
        children: [childNode],
      };
      const ctx = makeCtx();

      walker.walk(tree, ctx);

      // contract: formatSection called; child in inline rendered before parent
      const formatSectionCalls = (engine.formatSection as ReturnType<typeof mock.fn>).mock;
      const formatInlineCalls = (engine.formatInline as ReturnType<typeof mock.fn>).mock;

      assert.strictEqual(formatSectionCalls.callCount(), 1);

      // verify context: section receives depth 0
      const secCtx = formatSectionCalls.calls[0].arguments[0] as RenderContext;
      assert.strictEqual(secCtx.depth, 0);

      // verify child inline was rendered
      assert.strictEqual(formatInlineCalls.callCount(), 1);
    });
  });

  describe('list → formatList + inList:true', () => {
    it('passes inList=true to children context', async () => {
      const engine = createMockEngine();
      const walker = new TreeWalker(engine);
      const list = definePromptElement({ role: 'list' });
      const inlineChild = definePromptElement({ role: 'inline' });
      const tree: JSXNode = {
        type: list,
        props: {},
        children: [{ type: inlineChild, props: {}, children: [] }],
      };
      const ctx = makeCtx();

      walker.walk(tree, ctx);

      const formatListCalls = (engine.formatList as ReturnType<typeof mock.fn>).mock;
      assert.strictEqual(formatListCalls.callCount(), 1);

      const formatInlineCalls = (engine.formatInline as ReturnType<typeof mock.fn>).mock;
      const inlineCtx = formatInlineCalls.calls[0].arguments[0] as RenderContext;
      assert.strictEqual(inlineCtx.inList, true);
    });
  });

  describe('block → formatBlock', () => {
    it('dispatches block role to formatBlock', async () => {
      const engine = createMockEngine();
      const walker = new TreeWalker(engine);
      const blockEl = definePromptElement({ role: 'block' });
      const tree: JSXNode = {
        type: blockEl,
        props: {},
        children: [],
      };
      const ctx = makeCtx();

      const result = walker.walk(tree, ctx);

      const blockCalls = (engine.formatBlock as ReturnType<typeof mock.fn>).mock;
      assert.strictEqual(blockCalls.callCount(), 1);
      assert.match(result, /^\[block:/);
    });
  });

  describe('inline → formatInline', () => {
    it('dispatches inline role to formatInline', async () => {
      const engine = createMockEngine();
      const walker = new TreeWalker(engine);
      const inlineEl = definePromptElement({ role: 'inline' });
      const tree: JSXNode = {
        type: inlineEl,
        props: {},
        children: [],
      };
      const ctx = makeCtx();

      const result = walker.walk(tree, ctx);

      const inlineCalls = (engine.formatInline as ReturnType<typeof mock.fn>).mock;
      assert.strictEqual(inlineCalls.callCount(), 1);
      assert.match(result, /^\[inline:/);
    });
  });

  describe('transparent → children only', () => {
    it('renders children without calling formatter', async () => {
      const engine = createMockEngine();
      const walker = new TreeWalker(engine);
      const transparentFn = () => {};
      const inlineEl = definePromptElement({ role: 'inline' });
      const tree: JSXNode = {
        type: transparentFn,
        props: {},
        children: [{ type: inlineEl, props: {}, children: [] }],
      };
      const ctx = makeCtx();

      const result = walker.walk(tree, ctx);

      // contract: transparent renders children directly; inline output present
      assert.match(result, /^\[inline:/);
      // section/block/list NOT called for transparent
      const secCalls = (engine.formatSection as ReturnType<typeof mock.fn>).mock;
      const listCalls = (engine.formatList as ReturnType<typeof mock.fn>).mock;
      const blockCalls = (engine.formatBlock as ReturnType<typeof mock.fn>).mock;
      assert.strictEqual(secCalls.callCount(), 0);
      assert.strictEqual(listCalls.callCount(), 0);
      assert.strictEqual(blockCalls.callCount(), 0);
    });
  });

  describe('skip → empty string', () => {
    it('returns empty string for skip category', async () => {
      const engine = createMockEngine();
      const walker = new TreeWalker(engine);
      const tree: JSXNode = {
        type: null,
        props: {},
        children: [],
      };
      const ctx = makeCtx();

      const result = walker.walk(tree, ctx);

      assert.strictEqual(result, '');
    });
  });

  describe('html-tag → HTMLTagRegistry.resolve', () => {
    it('throws Error when tag is not registered', async () => {
      const engine = createMockEngine();
      const walker = new TreeWalker(engine);
      const tree: JSXNode = {
        type: 'nonexistent',
        props: {},
        children: [],
      };
      const ctx = makeCtx();

      assert.throws(
        () => walker.walk(tree, ctx),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.match(
            (err as Error).message,
            /\[TreeWalker#_dispatchHtmlTag\] unknown HTML tag: nonexistent/
          );
          return true;
        }
      );
    });

    it('dispatches to registered renderer for built-in tag b', async () => {
      const engine = createMockEngine();
      const walker = new TreeWalker(engine);
      const tree: JSXNode = {
        type: 'b',
        props: {},
        children: [],
      };
      const ctx = makeCtx();

      const result = walker.walk(tree, ctx);

      // b is registered → dispatches to htmlTagRegistry renderer
      // empty children → renderer returns empty string
      assert.strictEqual(result, '');
    });
  });

  describe('root role', () => {
    it('acts as transparent wrapper rendering only children', async () => {
      const engine = createMockEngine();
      const walker = new TreeWalker(engine);
      const root = definePromptElement({ role: 'root' });
      const inlineChild = definePromptElement({ role: 'inline' });
      const tree: JSXNode = {
        type: root,
        props: {},
        children: [{ type: inlineChild, props: {}, children: [] }],
      };
      const ctx = makeCtx();

      const result = walker.walk(tree, ctx);

      // contract: root renders children only; no formatter call for root
      const secCalls = (engine.formatSection as ReturnType<typeof mock.fn>).mock;
      assert.strictEqual(secCalls.callCount(), 0);
      assert.match(result, /^\[inline:/);
    });
  });
});
