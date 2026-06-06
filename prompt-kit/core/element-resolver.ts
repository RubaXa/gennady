// @file: Element type resolver — determines rendering category from a JSX node's type field
// @consumers: TreeWalker
// @tasks: TSK-64

import { PROMPT_ELEMENT_SYMBOL } from './types.js';

/**
 * @purpose Resolves a JSX node type into one of four rendering categories for TreeWalker dispatch.
 * @invariant prompt-element detected via brand symbol; html-tag via string type; transparent via function without brand; skip via null/undefined type.
 */
export class ElementResolver {
  /**
   * @purpose Classify a node type into a dispatch category.
   * @param type The `node.type` field from a JSXNode
   * @throws {Error} When type is neither object-with-brand, string, function, nor null/undefined
   * @returns Category string for TreeWalker dispatch
   */
  resolve(type: unknown): 'prompt-element' | 'html-tag' | 'transparent' | 'skip' {
    // #region START_DETECT_PROMPT_ELEMENT — invariant: brand symbol presence distinguishes PromptElement from plain objects
    if (typeof type === 'object' && type !== null && PROMPT_ELEMENT_SYMBOL in type) {
      return 'prompt-element';
    }
    // #endregion END_DETECT_PROMPT_ELEMENT

    // #region START_DETECT_REMAINING — invariant: string → html-tag; function → transparent; null/undefined → skip; other → Error
    if (typeof type === 'string') return 'html-tag';
    if (typeof type === 'function') return 'transparent';
    if (type === null || type === undefined) return 'skip';

    throw new Error(`[ElementResolver#resolve] unknown element type: ${typeof type}`);
    // #endregion END_DETECT_REMAINING
  }
}
