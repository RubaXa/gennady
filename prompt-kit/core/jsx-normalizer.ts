// @file: JSX tree normalizer — converts trees from different JSX runtimes to canonical {type, props, children} form
// @consumers: renderPrompt
// @tasks: TSK-64

import type { JSXNode } from './types.js';

/**
 * @purpose Normalizes JSX trees from React (children in props), Preact (children as __c), fragments, and raw primitives.
 * @invariant Normalization is lossless pass-through: unrecognized structures are preserved as-is; no errors thrown.
 * @invariant Output is always {type, props, children[]} shape; null/undefined children produce type=undefined (skip category).
 */
export class JSXTreeNormalizer {
  /**
   * @purpose Normalize a JSX tree node to canonical form.
   * @param node Any JSX node shape from React, Preact, or raw JSX
   * @returns Canonical JSXNode with {type, props, children[]}
   */
  static normalize(node: unknown): JSXNode {
    // #region START_NORMALIZE_LEAF — invariant: null/undefined → skip node; primitives → skip node with string child
    if (node === null || node === undefined) {
      return { type: undefined, props: {}, children: [] };
    }
    if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
      return { type: undefined, props: {}, children: [String(node)] as unknown as JSXNode[] };
    }
    // #endregion END_NORMALIZE_LEAF

    // Flatten nested arrays (React passes array children as-is)
    if (Array.isArray(node)) {
      return { type: undefined, props: {}, children: JSXTreeNormalizer._normalizeChildren(node) };
    }

    if (typeof node !== 'object') {
      return { type: undefined, props: {}, children: [] };
    }

    const obj = node as Record<string, unknown>;

    // #region START_NORMALIZE_STRUCTURAL — invariant: Fragment unwrapped; other objects → extract type, props, normalized children
    if (obj.type === Symbol.for('react.fragment') || obj.type === 'Fragment') {
      const rawChildren = JSXTreeNormalizer._extractChildren(obj);
      return {
        type: undefined,
        props: {},
        children: JSXTreeNormalizer._normalizeChildren(rawChildren),
      };
    }

    const nodeType = 'type' in obj ? obj.type : undefined;
    const rawChildren = JSXTreeNormalizer._extractChildren(obj);
    const children = JSXTreeNormalizer._normalizeChildren(rawChildren);

    const props = (
      typeof obj.props === 'object' && obj.props !== null
        ? (() => {
            const p = { ...(obj.props as Record<string, unknown>) };
            delete p.children;
            return p;
          })()
        : {}
    ) as Record<string, unknown>;

    return { type: nodeType, props, children };
    // #endregion END_NORMALIZE_STRUCTURAL
  }

  /**
   * @purpose Extract raw children from a JSX node object, handling React props.children and Preact __c patterns.
   * @param obj Raw JSX node object
   * @returns Array of raw child nodes (may be empty)
   */
  protected static _extractChildren(obj: Record<string, unknown>): unknown[] {
    // #region START_EXTRACT_CHILDREN — invariant: React stores children in props.children; Preact uses __c; both single-or-array
    // ALSO check top-level children array (post-normalization canonical form)
    if ('children' in obj && Array.isArray(obj.children)) {
      return obj.children as unknown[];
    }

    if ('props' in obj && typeof obj.props === 'object' && obj.props !== null) {
      const propsObj = obj.props as Record<string, unknown>;
      if ('children' in propsObj && propsObj.children !== undefined && propsObj.children !== null) {
        const ch = propsObj.children;
        return Array.isArray(ch) ? ch : [ch];
      }
    }

    if ('__c' in obj && obj.__c !== undefined && obj.__c !== null) {
      const ch = obj.__c;
      return Array.isArray(ch) ? ch : [ch];
    }
    // #endregion END_EXTRACT_CHILDREN

    return [];
  }

  /**
   * @purpose Recursively normalize an array of raw child nodes.
   * @param rawChildren Array of raw child nodes
   * @returns Array of canonical JSXNode
   */
  protected static _normalizeChildren(rawChildren: unknown[]): JSXNode[] {
    return rawChildren
      .map((child) => JSXTreeNormalizer.normalize(child))
      .filter((child) => {
        // purpose: skip null/boolean children that carry no visible output
        if (child.type === undefined && child.children.length === 0) return false;
        return true;
      });
  }
}
