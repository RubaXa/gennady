// @file: Tree walker — recursive JSX tree traversal with role-based dispatch and context propagation
// @consumers: renderPrompt
// @tasks: TSK-64

import { ElementResolver } from './element-resolver.js';
import { htmlTagRegistry } from './html-tag-registry.js';
import type { JSXNode, PromptElement, RenderContext, TFormatEngine } from './types.js';

/**
 * @purpose Recursively walks a normalized JSX tree, dispatching each node by resolved category and role.
 * @invariant Children are rendered before parents (bottom-up). Context depth increments for section children; inList set for list children.
 * @invariant Dispatches: PromptElement → TFormatEngine by role; html-tag → HTMLTagRegistry renderer; transparent → children only; skip → empty string.
 */
export class TreeWalker {
  /** @purpose Format engine used for PromptElement role dispatch. */
  protected _engine: TFormatEngine;

  /** @purpose Element category resolver. */
  protected _resolver: ElementResolver;

  /**
   * @param engine Format engine for PromptElement role dispatch
   */
  constructor(engine: TFormatEngine) {
    this._engine = engine;
    this._resolver = new ElementResolver();
  }

  /**
   * @purpose Walk the full tree starting from the root node.
   * @param node Root JSXNode
   * @param ctx Initial render context
   * @returns Rendered string
   */
  walk(node: JSXNode, ctx: RenderContext): string {
    return this._walkNode(node, ctx);
  }

  /**
   * @purpose Recursively walk a single node: resolve category, dispatch, return rendered string.
   * @param node Current JSXNode
   * @param ctx Current render context
   * @returns Rendered string for this subtree
   */
  protected _walkNode(node: JSXNode, ctx: RenderContext): string {
    const category = this._resolver.resolve(node.type);

    // #region START_DISPATCH_BY_CATEGORY — invariant: prompt-element → engine; html-tag → registry; transparent → children only; skip → empty
    if (category === 'prompt-element') {
      return this._dispatchPromptElement(node.type as PromptElement, node, ctx);
    }

    if (category === 'html-tag') {
      return this._dispatchHtmlTag(node.type as string, node, ctx);
    }

    if (category === 'transparent') {
      return this._renderChildren(node.children, ctx);
    }

    if (node.children?.length) return this._renderChildren(node.children, ctx);
    return '';
    // #endregion END_DISPATCH_BY_CATEGORY
  }

  /**
   * @purpose Dispatch a PromptElement node to the correct TFormatEngine method based on its config.role.
   * @param element The PromptElement factory object
   * @param node The current JSXNode with props and children
   * @param ctx Current render context
   * @throws {Error} Unknown role
   * @returns Rendered string
   */
  protected _dispatchPromptElement(
    element: PromptElement,
    node: JSXNode,
    ctx: RenderContext
  ): string {
    const role = element.config.role;

    // #region START_RESOLVE_CHILD_CONTEXT — invariant: section → depth+1; list → inList=true; others → unchanged
    let childCtx: RenderContext;
    if (role === 'section') {
      childCtx = { ...ctx, depth: ctx.depth + 1 };
    } else if (role === 'list') {
      childCtx = { ...ctx, inList: true };
    } else {
      childCtx = ctx;
    }
    // #endregion END_RESOLVE_CHILD_CONTEXT

    // purpose: root role wraps children with XML tag and MD keywords
    if (role === "root") {
      const children = this._renderChildren(node.children, childCtx);
      if (ctx.format === "md" && element.config.markdown && (element.config.markdown as any).title) {
        const title = (element.config.markdown as any).title({ tagName: element.tagName, props: node.props, depth: ctx.depth });
        return title ? title + "\n\n" + children : children;
      }
      if (ctx.format === "xml") {
        return "<" + element.tagName + ">\n" + children + "\n</" + element.tagName + ">";
      }
      return children;
    }

  /**
   * @purpose Dispatch an HTML tag node via the HTMLTagRegistry renderer.
   * @param tagName Lowercase HTML tag name
   * @param node The current JSXNode with props and children
   * @param ctx Current render context
   * @throws {Error} When tag is not registered
   * @returns Rendered string
   */
  protected _dispatchHtmlTag(tagName: string, node: JSXNode, ctx: RenderContext): string {
    const renderer = htmlTagRegistry.resolve(tagName);

    // #region START_HTML_TAG_DISPATCH — invariant: resolve null → Error; pass raw children + walk callback to renderer
    if (!renderer) {
      throw new Error(`[TreeWalker#_dispatchHtmlTag] unknown HTML tag: ${tagName}`);
    }

    return renderer(ctx, node.children, node.props, (children, childCtx) =>
      this._renderChildren(children, childCtx)
    );
    // #endregion END_HTML_TAG_DISPATCH
  }

  /**
   * @purpose Render an array of child nodes by recursively walking each.
   * @param children Array of child JSXNodes
   * @param ctx Render context for children
   * @returns Concatenated rendered string
   */
  /**
   * @purpose Apply root element formatting (keywords heading in MD, XML wrapper tag).
   */
  protected _applyRootFormat(element: PromptElement, children: string, ctx: RenderContext, props: Record<string, unknown>): string {
    const cfg = element.config;
    if (ctx.format === 'md' && cfg.markdown?.title) {
      const title = cfg.markdown.title({ tagName: element.tagName, props, depth: ctx.depth });
      return title ? title + "\n\n" + children : children;
    }
    if (ctx.format === 'xml' && cfg.xml?.renderChildren) {
      return cfg.xml.renderChildren({ children, props });
    }
    // default XML wrapper
    if (ctx.format === 'xml') {
      return '<' + element.tagName + '>' + children + '</' + element.tagName + '>';
    }
    return children;
  }

  protected _renderChildren(children: JSXNode[] | string[], ctx: RenderContext): string {
    return children
      .map((child) => {
        if (typeof child === 'string') return child;
        return this._walkNode(child, ctx);
      })
      .join('');
  }
}
