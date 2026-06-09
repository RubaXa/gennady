// @file: renderDirective — thin wrapper over prompt-kit renderPrompt, ai-tsx error prefix
// @consumers: directives module, scripts, tests
// @tasks: TSK-76

import { renderPrompt } from '../prompt-kit/core/render-prompt.js';
import type { JSXNode } from '../prompt-kit/core/types.js';

/**
 * @purpose Render a JSX directive tree or function component to an HTML string.
 * @invariant Only 'xml' format is supported. Function components are invoked with no props.
 * @param tree A JSXNode tree or a function returning a JSXNode
 * @param format Output format — only 'xml' is supported
 * @throws {Error} Unsupported format or rendering failure — wrapped with [ai-tsx] prefix and cause
 * @returns Rendered HTML string
 */
export function renderDirective(tree: JSXNode | (() => JSXNode), format: 'xml'): string {
  if (format !== 'xml') {
    throw new Error('[renderDirective] unsupported format');
  }

  try {
    const resolved = typeof tree === 'function' ? tree() : tree;
    return renderPrompt(resolved, {}, 'xml');
  } catch (cause) {
    throw new Error('[ai-tsx] render failed', { cause });
  }
}
