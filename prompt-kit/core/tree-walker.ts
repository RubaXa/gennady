// @file: Tree walker — recursive JSX tree traversal with role-based dispatch and context propagation
// @consumers: renderPrompt
// @tasks: TSK-64

import { ElementResolver } from './element-resolver.js';
import { htmlTagRegistry } from './html-tag-registry.js';
import type { JSXNode, PromptElement, RenderContext, TFormatEngine } from './types.js';

/**
 * @purpose Recursively walks a normalized JSX tree, dispatching each node by resolved category and role.
 * @invariant Children rendered before parents (bottom-up). Depth increments for sections; inList set for list children.
 */
export class TreeWalker {
  /** @purpose Format engine used for PromptElement role dispatch. */
  protected _engine: TFormatEngine;
  /** @purpose Element category resolver. */
  protected _resolver: ElementResolver;

  /**
   * @purpose Create a tree walker with the given format engine.
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
    if (category === 'prompt-element')
      return this._dispatchPromptElement(node.type as PromptElement, node, ctx);
    if (category === 'html-tag') return this._dispatchHtmlTag(node.type as string, node, ctx);
    if (category === 'transparent') return this._renderChildren(node.children, ctx);
    if (node.children?.length) return this._renderChildren(node.children, ctx);
    return '';
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
    let childCtx: RenderContext;
    if (role === 'section') childCtx = { ...ctx, depth: ctx.depth + 1 };
    else if (role === 'list') childCtx = { ...ctx, inList: true };
    else childCtx = ctx;

    if (role === 'root') {
      const children = this._renderChildren(node.children, childCtx);
      const cfg = element.config;
      if (ctx.format === 'md' && cfg.markdown?.title) {
        const title = cfg.markdown.title({
          tagName: element.tagName,
          props: node.props,
          depth: ctx.depth,
        });
        return title ? title + '\n\n' + children : children;
      }
      if (ctx.format === 'xml') {
        const tag = (node.props.is as string) || cfg.html?.tag || element.tagName;
        return '<' + tag + '>\n' + children + '\n</' + tag + '>';
      }
      return children;
    }

    const children = this._renderChildren(node.children, childCtx);
    if (role === 'section') return this._engine.formatSection(ctx, children, element, node.props);
    if (role === 'list') return this._engine.formatList(ctx, children, element, node.props);
    if (role === 'block') return this._engine.formatBlock(ctx, children, element, node.props);
    if (role === 'inline') return this._engine.formatInline(ctx, children, element, node.props);
    if (role === 'property') return this._engine.formatProperty(ctx, children, element, node.props);
    throw new Error(`[TreeWalker#_dispatchPromptElement] unknown role: ${role}`);
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
    if (!renderer) throw new Error(`[TreeWalker#_dispatchHtmlTag] unknown HTML tag: ${tagName}`);
    return renderer(ctx, node.children, node.props, (children, childCtx) =>
      this._renderChildren(children, childCtx)
    );
  }

  /**
   * @purpose Render an array of child nodes by recursively walking each, joining with format-appropriate separator.
   * @param children Array of child JSXNodes or strings
   * @param ctx Render context for children
   * @returns Concatenated rendered string
   */
  protected _renderChildren(children: JSXNode[] | string[], ctx: RenderContext): string {
    const results: string[] = [];
    for (let i = 0; i < children.length; i++) {
      if (typeof children[i] === 'string') {
        results.push(children[i] as string);
        continue;
      }
      results.push(this._walkNode(children[i] as JSXNode, ctx));
    }
    return results.filter((r) => r.length > 0).join('\n');
  }
}
