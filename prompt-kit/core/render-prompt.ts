// @file: renderPrompt — top-level render service: component invocation, normalization, tree walking
// @consumers: CLI, prompt generation scripts, external consumers
// @tasks: TSK-64

import { XmlFormatter } from '../format/xml-formatter.js';
import { MdFormatter } from '../format/md-formatter.js';
import { JSXTreeNormalizer } from './jsx-normalizer.js';
import { TreeWalker } from './tree-walker.js';
import type { JSXNode, PromptElement, RenderContext, TFormatEngine } from './types.js';

/**
 * @purpose XML format engine — adapts XmlFormatter to the TFormatEngine contract for TreeWalker dispatch.
 * @implements {TFormatEngine} in ./types.ts
 */
class XmlFormatEngine implements TFormatEngine {
  protected _formatter = new XmlFormatter();

  /** @see {TFormatEngine#formatSection} in ./types.ts */
  formatSection(
    ctx: RenderContext,
    children: string,
    element: PromptElement,
    props: Record<string, unknown>
  ): string {
    const tag = (props.is as string) || (element.config.html?.tag as string) || element.tagName;
    const attrs = { ...props };
    delete attrs.is;
    return this._formatter.formatElement(tag, attrs, children, ctx.depth);
  }

  /** @see {TFormatEngine#formatList} in ./types.ts */
  formatList(
    ctx: RenderContext,
    children: string,
    element: PromptElement,
    props: Record<string, unknown>
  ): string {
    const tag = (props.is as string) || (element.config.html?.tag as string) || element.tagName;
    const attrs = { ...props };
    delete attrs.is;
    return this._formatter.formatElement(tag, attrs, children, ctx.depth);
  }

  /** @see {TFormatEngine#formatBlock} in ./types.ts */
  formatBlock(
    ctx: RenderContext,
    children: string,
    element: PromptElement,
    props: Record<string, unknown>
  ): string {
    const tag = (props.is as string) || (element.config.html?.tag as string) || element.tagName;
    const attrs = { ...props };
    delete attrs.is;
    return this._formatter.formatElement(tag, attrs, children, ctx.depth);
  }

  /** @see {TFormatEngine#formatInline} in ./types.ts */
  formatInline(
    _ctx: RenderContext,
    children: string,
    element: PromptElement,
    props: Record<string, unknown>
  ): string {
    const tag = (props.is as string) || (element.config.html?.tag as string) || element.tagName;
    const attrs = { ...props };
    delete attrs.is;
    return this._formatter.formatInline(tag, attrs, children);
  }

  /** @see {TFormatEngine#formatProperty} in ./types.ts */
  formatProperty(
    ctx: RenderContext,
    children: string,
    element: PromptElement,
    props: Record<string, unknown>
  ): string {
    const tag = (props.is as string) || (element.config.html?.tag as string) || element.tagName;
    const attrs = { ...props };
    delete attrs.is;
    return this._formatter.formatElement(tag, attrs, children, ctx.depth);
  }
}

/**
 * @purpose Markdown format engine — adapts MdFormatter to the TFormatEngine contract for TreeWalker dispatch.
 * @implements {TFormatEngine} in ./types.ts
 */
class MdFormatEngine implements TFormatEngine {
  protected _formatter = new MdFormatter();

  /** @see {TFormatEngine#formatSection} in ./types.ts */
  formatSection(
    ctx: RenderContext,
    children: string,
    element: PromptElement,
    props: Record<string, unknown>
  ): string {
    const title =
      element.config.markdown?.title?.({ tagName: element.tagName, props, depth: ctx.depth }) ?? '';
    const resolvedTag = (props.is as string) || element.config.html?.tag || element.tagName;
    // PascalCase → SNAKE_CASE: AiKnowledge → AI_KNOWLEDGE, SddSetup → SDD_SETUP
    const anchorName = resolvedTag
      .replace(/([A-Z])/g, '_$1')
      .replace(/^_/, '')
      .toUpperCase();
    const anchors = element.config.markdown?.includeBoundaryComments
      ? { start: `<!--START_${anchorName}-->`, end: `<!--END_${anchorName}-->` }
      : undefined;

    if (ctx.inList) {
      return this._formatter.formatSectionInline(title, children);
    }
    return this._formatter.formatSection(title, children, ctx.depth, anchors);
  }

  /** @see {TFormatEngine#formatList} in ./types.ts */
  formatList(
    _ctx: RenderContext,
    children: string,
    element: PromptElement,
    props: Record<string, unknown>
  ): string {
    const ordered = element.config.markdown?.ordered ?? false;
    const title = element.config.markdown?.title?.({
      tagName: element.tagName,
      props,
      depth: _ctx.depth,
    });
    return this._formatter.formatList(children, ordered, title);
  }

  /** @see {TFormatEngine#formatBlock} in ./types.ts */
  formatBlock(
    _ctx: RenderContext,
    children: string,
    element: PromptElement,
    props: Record<string, unknown>
  ): string {
    const lang = element.config.markdown?.lang;
    const title = element.config.markdown?.title?.({
      tagName: element.tagName,
      props,
      depth: _ctx.depth,
    });
    return this._formatter.formatBlock(children, lang, title);
  }

  /** @see {TFormatEngine#formatInline} in ./types.ts */
  formatInline(
    _ctx: RenderContext,
    children: string,
    element: PromptElement,
    _props: Record<string, unknown>
  ): string {
    const wrapper = element.config.markdown?.wrapper ?? '';
    return this._formatter.formatInline(wrapper, children);
  }

  /** @see {TFormatEngine#formatProperty} in ./types.ts */
  formatProperty(
    _ctx: RenderContext,
    children: string,
    element: PromptElement,
    props: Record<string, unknown>
  ): string {
    const title =
      element.config.markdown?.title?.({
        tagName: element.tagName,
        props,
        depth: _ctx.depth,
      }) ?? '';
    // MD: inline key-value — `- **File:** setup.xml`
    return title ? `- **${title}**` + (children ? ` ${children}` : '') : children;
  }
}

/**
 * @purpose Render a prompt component or JSX tree to a string in the target format.
 * @invariant Errors are wrapped with [prompt-kit] prefix and cause-chain preserved.
 * @param component A JSXNode tree or a function component returning JSX
 * @param props Props to pass to the function component (ignored for JSXNode input)
 * @param format Target output format: 'xml' or 'md'
 * @throws {Error} Unknown format or rendering failure — wrapped with [prompt-kit] prefix and original cause
 * @returns Rendered string output
 */
export function renderPrompt(
  component: JSXNode | ((props: Record<string, unknown>) => JSXNode),
  props: Record<string, unknown>,
  format: 'xml' | 'md'
): string {
  // #region START_VALIDATE_AND_RENDER — invariant: validate format; invoke component / pass-through JSXNode; normalize; walk
  if (format !== 'xml' && format !== 'md') {
    throw new Error(`[renderPrompt] unknown format: ${String(format)}`);
  }

  try {
    const rawTree: unknown = typeof component === 'function' ? component(props) : component;

    const tree = JSXTreeNormalizer.normalize(rawTree);

    const engine = format === 'xml' ? new XmlFormatEngine() : new MdFormatEngine();

    const walker = new TreeWalker(engine);
    const ctx: RenderContext = { depth: 0, inList: false, format };
    return walker.walk(tree, ctx);
  } catch (cause) {
    throw new Error(`[prompt-kit] render failed`, { cause });
  }
  // #endregion END_VALIDATE_AND_RENDER
}
