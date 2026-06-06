import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderPrompt } from '../render-prompt.js';
import { definePromptElement } from '../define-prompt-element.js';
import { PROMPT_ELEMENT_SYMBOL } from '../types.js';
import type { JSXNode } from '../types.js';

describe('renderPrompt', () => {
  describe('direct JSXNode input', () => {
    it('renders a prompt element tree to XML', async () => {
      const Section = definePromptElement({
        role: 'section',
        markdown: {
          title: ({ props }: { props: Record<string, unknown> }) => props.title as string,
        },
      });
      const tree: JSXNode = {
        type: Section,
        props: { title: 'Test' },
        children: [],
      };

      const result = renderPrompt(tree, {}, 'xml');

      assert.match(result, /section/);
      assert.match(result, /Test/);
    });

    it('renders a prompt element tree to MD', async () => {
      const Section = definePromptElement({
        role: 'section',
        markdown: {
          title: ({ props }: { props: Record<string, unknown> }) => props.title as string,
        },
      });
      const tree: JSXNode = {
        type: Section,
        props: { title: 'Test' },
        children: [],
      };

      const result = renderPrompt(tree, {}, 'md');

      assert.match(result, /# Test:/);
    });
  });

  describe('function component', () => {
    it('invokes function component with props and renders result', async () => {
      const Section = definePromptElement({
        role: 'section',
        markdown: {
          title: ({ props }: { props: Record<string, unknown> }) => props.title as string,
        },
      });
      const Component = (props: Record<string, unknown>): JSXNode => ({
        type: Section,
        props: { title: props.kw },
        children: [],
      });

      const result = renderPrompt(Component, { kw: 'hello' }, 'xml');

      assert.match(result, /hello/);
    });
  });

  describe('error with cause', () => {
    it('wraps component error with [prompt-kit] prefix', async () => {
      const Failing = (_props: Record<string, unknown>): JSXNode => {
        throw new Error('boom');
      };

      assert.throws(
        () => renderPrompt(Failing, {}, 'md'),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.match((err as Error).message, /\[prompt-kit\] render failed/);
          assert.ok((err as Error).cause instanceof Error);
          assert.strictEqual(((err as Error).cause as Error).message, 'boom');
          return true;
        }
      );
    });

    it('wraps unknown element type error from ElementResolver', async () => {
      // contract: error from element resolver wrapped in prompt-kit
      const tree: JSXNode = {
        type: 42 as unknown as JSXNode['type'],
        props: {},
        children: [],
      };

      assert.throws(
        () => renderPrompt(tree, {}, 'md'),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.match((err as Error).message, /\[prompt-kit\] render failed/);
          assert.ok((err as Error).cause instanceof Error);
          assert.match(((err as Error).cause as Error).message, /\[ElementResolver#resolve\]/);
          return true;
        }
      );
    });

    it('wraps unknown HTML tag error from TreeWalker', async () => {
      const tree: JSXNode = {
        type: 'foo',
        props: {},
        children: [],
      };

      assert.throws(
        () => renderPrompt(tree, {}, 'md'),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.match((err as Error).message, /\[prompt-kit\] render failed/);
          assert.ok((err as Error).cause instanceof Error);
          assert.match(((err as Error).cause as Error).message, /unknown HTML tag: foo/);
          return true;
        }
      );
    });
  });

  describe('format validation', () => {
    it('rejects unknown format', async () => {
      const Section = definePromptElement({ role: 'section' });
      const tree: JSXNode = {
        type: Section,
        props: {},
        children: [],
      };

      assert.throws(
        () => renderPrompt(tree, {}, 'html' as 'md'),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.match((err as Error).message, /unknown format/);
          return true;
        }
      );
    });
  });
});
