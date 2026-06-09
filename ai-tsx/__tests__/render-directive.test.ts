// @file: renderDirective tests — simple tree rendering, unsupported format, component error with cause
// @consumers: ai-tsx directives module
// @tasks: TSK-76

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderDirective } from '../render-directive.js';
import { Prompt, Group } from '../../prompt-kit/elements/index.js';
import type { JSXNode } from '../../prompt-kit/core/types.js';

describe('renderDirective', () => {
  it('renders simple tree', () => {
    const tree: JSXNode = {
      type: Prompt,
      props: { is: 'TestDirective', type: 'test', ver: '1.0' },
      children: [
        {
          type: Group,
          props: { is: 'Mission' },
          children: ['Test mission content.' as unknown as JSXNode],
        },
      ],
    };
    const result = renderDirective(tree, 'xml');
    assert.match(result, /<TestDirective>/);
    assert.match(result, /<Mission>/);
    assert.match(result, /Test mission content/);
    assert.match(result, /<\/Mission>/);
    assert.match(result, /<\/TestDirective>/);
  });

  it('throws on unsupported format', () => {
    const tree: JSXNode = {
      type: Prompt,
      props: { is: 'Test' },
      children: [],
    };
    assert.throws(() => renderDirective(tree, 'html' as any), /unsupported format/);
  });

  it('throws on component error', () => {
    // contract: component errors wrapped with [ai-tsx] prefix and cause preserved
    const FailingComponent = (): JSXNode => {
      throw new Error('BOOM');
    };
    assert.throws(
      () => renderDirective(FailingComponent, 'xml'),
      (error: Error) => {
        assert.match(error.message, /\[ai-tsx\] render failed/);
        assert.ok(error.cause instanceof Error);
        assert.match((error.cause as Error).message, /BOOM/);
        return true;
      }
    );
  });
});
