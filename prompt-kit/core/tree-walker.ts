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
    // #region START_FORCED_FORMAT — invariant: overrides subtree format, stripped from props before engine
    const forcedFormat = node.props.forcedFormat as string | undefined;
    const effectiveFormat =
      forcedFormat === 'md' || forcedFormat === 'xml' ? forcedFormat : ctx.format;
    const cleanProps = { ...node.props };
    delete cleanProps.forcedFormat;
    // #endregion END_FORCED_FORMAT

    let childCtx: RenderContext;
    if (role === 'section') childCtx = { ...ctx, depth: ctx.depth + 1, format: effectiveFormat };
    else if (role === 'list') {
      childCtx = { ...ctx, inList: true, format: effectiveFormat };
      // ordered list initialises listStep counter
      if (node.props.ordered === true) childCtx.listStep = 1;
    } else childCtx = { ...ctx, format: effectiveFormat };

    if (role === 'root') {
      const children = this._renderChildren(node.children, childCtx);
      const cfg = element.config;
      if (effectiveFormat === 'md' && cfg.markdown?.title) {
        const title = cfg.markdown.title({
          tagName: element.tagName,
          props: node.props,
          depth: ctx.depth,
        });
        return title ? title + '\n\n' + children : children;
      }
      if (effectiveFormat === 'xml') {
        const tag = (cleanProps.is as string) || cfg.html?.tag || element.tagName;
        return '<' + tag + '>\n' + children + '\n</' + tag + '>';
      }
      return children;
    }

    const children = this._renderChildren(node.children, childCtx);
    const effectiveCtx = { ...ctx, format: effectiveFormat };
    if (role === 'section')
      return this._engine.formatSection(effectiveCtx, children, element, cleanProps);
    if (role === 'list')
      return this._engine.formatList(effectiveCtx, children, element, cleanProps);
    if (role === 'block')
      return this._engine.formatBlock(effectiveCtx, children, element, cleanProps);
    if (role === 'inline')
      return this._engine.formatInline(effectiveCtx, children, element, cleanProps);
    if (role === 'property')
      return this._engine.formatProperty(effectiveCtx, children, element, cleanProps);
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
    const forcedFormat = node.props.forcedFormat as string | undefined;
    const effectiveFormat =
      forcedFormat === 'md' || forcedFormat === 'xml' ? forcedFormat : ctx.format;
    const cleanProps = { ...node.props };
    delete cleanProps.forcedFormat;
    const effectiveCtx = { ...ctx, format: effectiveFormat };
    return renderer(effectiveCtx, node.children, cleanProps, (children, childCtx) =>
      this._renderChildren(children, { ...childCtx, format: effectiveFormat })
    );
  }

  /**
   * @purpose Render an array of child nodes by recursively walking each. Separator: `\n\n` between section siblings in MD, `\n` otherwise.
   * @param children Array of child JSXNodes or strings
   * @param ctx Render context for children
   * @returns Concatenated rendered string
   */
  protected _renderChildren(children: JSXNode[] | string[], ctx: RenderContext): string {
    const results: { text: string; role: string | undefined; isParagraph: boolean }[] = [];
    let step = ctx.listStep ?? 1;
    for (let i = 0; i < children.length; i++) {
      if (typeof children[i] === 'string') {
        results.push({ text: children[i] as string, role: undefined, isParagraph: false });
        if (ctx.listStep !== undefined) step++;
        continue;
      }
      const node = children[i] as JSXNode;
      const childCtx = ctx.listStep !== undefined ? { ...ctx, listStep: step } : ctx;
      const isP = node.type === 'p';
      results.push({
        text: this._walkNode(node, childCtx),
        role: this._getChildRole(node),
        isParagraph: isP,
      });
      // #region START_LISTSTEP_INCREMENT — invariant: non-section, non-transparent children increment counter
      if (ctx.listStep !== undefined && this._getChildRole(node) !== 'section') {
        const category = this._resolver.resolve(node.type);
        if (category !== 'transparent') step++;
      }
      // #endregion END_LISTSTEP_INCREMENT
    }
    const nonEmpty = results.filter((r) => r.text.length > 0);
    let out = '';
    for (let i = 0; i < nonEmpty.length; i++) {
      out += nonEmpty[i].text;
      if (i < nonEmpty.length - 1) {
        const roleA = nonEmpty[i].role;
        const roleB = nonEmpty[i + 1].role;
        const isPA = nonEmpty[i].isParagraph;
        const isPB = nonEmpty[i + 1].isParagraph;
        const bothSections = roleA === 'section' && roleB === 'section';
        // #region START_PARAGRAPH_SPACING — invariant: p↔any → \n\n
        if (isPA || isPB) {
          out += '\n\n';
        } else if (bothSections && ctx.format === 'md') {
          out += '\n\n';
        } else {
          out += '\n';
        }
        // #endregion END_PARAGRAPH_SPACING
      }
    }
    return out;
  }

  /**
   * @purpose Get the role of a child node for separator computation.
   * @param child Child JSX node to inspect.
   * @returns Role string if the child is a known prompt element, undefined otherwise.
   */
  private _getChildRole(child: JSXNode): string | undefined {
    try {
      const category = this._resolver.resolve(child.type);
      if (category === 'prompt-element') {
        return (child.type as PromptElement).config.role;
      }
    } catch {
      /* unknown types treated as non-section */
    }
    return undefined;
  }
}
