// @file: Tree walker — recursive JSX tree traversal with role-based dispatch and context propagation
// @consumers: renderPrompt
// @tasks: TSK-64

import { ElementResolver } from './element-resolver.js';
import { htmlTagRegistry } from './html-tag-registry.js';
import type { JSXNode, PromptElement, RenderContext, TFormatEngine } from './types.js';

export class TreeWalker {
  protected _engine: TFormatEngine;
  protected _resolver: ElementResolver;

  constructor(engine: TFormatEngine) {
    this._engine = engine;
    this._resolver = new ElementResolver();
  }

  walk(node: JSXNode, ctx: RenderContext): string {
    return this._walkNode(node, ctx);
  }

  protected _walkNode(node: JSXNode, ctx: RenderContext): string {
    const category = this._resolver.resolve(node.type);
    if (category === 'prompt-element') return this._dispatchPromptElement(node.type as PromptElement, node, ctx);
    if (category === 'html-tag') return this._dispatchHtmlTag(node.type as string, node, ctx);
    if (category === 'transparent') return this._renderChildren(node.children, ctx);
    if (node.children?.length) return this._renderChildren(node.children, ctx);
    return '';
  }

  protected _dispatchPromptElement(element: PromptElement, node: JSXNode, ctx: RenderContext): string {
    const role = element.config.role;
    let childCtx: RenderContext;
    if (role === 'section') childCtx = { ...ctx, depth: ctx.depth + 1 };
    else if (role === 'list') childCtx = { ...ctx, inList: true };
    else childCtx = ctx;

    if (role === 'root') {
      const children = this._renderChildren(node.children, childCtx);
      const cfg = element.config;
      if (ctx.format === 'md' && cfg.markdown?.title) {
        const title = cfg.markdown.title({ tagName: element.tagName, props: node.props, depth: ctx.depth });
        return title ? title + '\n\n' + children : children;
      }
      if (ctx.format === 'xml') {
        const tag = (node.props.is as string) || (cfg.html?.tag as string) || element.tagName;
        return '<' + tag + '>\n' + children + '\n</' + tag + '>';
      }
      return children;
    }

    const children = this._renderChildren(node.children, childCtx);
    if (role === 'section') return this._engine.formatSection(ctx, children, element, node.props);
    if (role === 'list') return this._engine.formatList(ctx, children, element, node.props);
    if (role === 'block') return this._engine.formatBlock(ctx, children, element, node.props);
    if (role === 'inline') return this._engine.formatInline(ctx, children, element, node.props);
    throw new Error(`[TreeWalker#_dispatchPromptElement] unknown role: ${role}`);
  }

  protected _dispatchHtmlTag(tagName: string, node: JSXNode, ctx: RenderContext): string {
    const renderer = htmlTagRegistry.resolve(tagName);
    if (!renderer) throw new Error(`[TreeWalker#_dispatchHtmlTag] unknown HTML tag: ${tagName}`);
    return renderer(ctx, node.children, node.props, (children, childCtx) => this._renderChildren(children, childCtx));
  }

  protected _renderChildren(children: JSXNode[] | string[], ctx: RenderContext): string {
    return children.map((child) => typeof child === 'string' ? child : this._walkNode(child, ctx)).join('');
  }
}
