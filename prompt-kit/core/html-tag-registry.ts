// @file: HTML tag registry — maps lowercase tag names to format-aware renderers; auto-filled with built-in tags
// @consumers: TreeWalker
// @tasks: TSK-64

import { XmlFormatter } from '../format/xml-formatter.js';
import { MdFormatter } from '../format/md-formatter.js';
import { TableRenderer } from '../format/table-renderer.js';
import type { HtmlTagRenderer, JSXNode, RenderContext } from './types.js';

const xmlFormatter = new XmlFormatter();
const mdFormatter = new MdFormatter();
const tableRenderer = new TableRenderer();

/**
 * @purpose Registry mapping HTML tag names to renderer functions; auto-populated with built-in tags at import time.
 * @invariant Re-registration overwrites; resolve returns null for unknown tags.
 * @invariant Built-in tags: b, em, i, u, strong, p, table, thead, tbody, tr, th, td.
 */
export class HTMLTagRegistry {
  /** @purpose Internal map of tag name → renderer */
  protected _registry: Map<string, HtmlTagRenderer> = new Map();

  /**
   * @purpose Register a renderer for an HTML tag name.
   * @param name Lowercase tag name
   * @param renderer Format-aware renderer function
   */
  register(name: string, renderer: HtmlTagRenderer): void {
    this._registry.set(name, renderer);
  }

  /**
   * @purpose Resolve a tag name to its registered renderer.
   * @param name Lowercase tag name
   * @returns The renderer function or null if not registered
   */
  resolve(name: string): HtmlTagRenderer | null {
    return this._registry.get(name) ?? null;
  }

  /** @purpose Pre-fill the registry with built-in HTML tag renderers. */
  autoFill(): void {
    // #region START_AUTOFILL_INLINE — invariant: b/em/i/u/strong produce symmetric MD wrapper; XML uses tag element
    const inlineTags: Record<string, string> = {
      b: '**',
      em: '*',
      i: '*',
      u: '__',
      strong: '**',
    };

    for (const [tag, wrapper] of Object.entries(inlineTags)) {
      this.register(tag, this._createInlineRenderer(tag, wrapper));
    }
    // #endregion END_AUTOFILL_INLINE

    // purpose: p renders transparent in both formats
    this.register('p', this._createParagraphRenderer());
    // purpose: li renders as Item/Step in XML, transparent in MD
    this.register('li', this._createLiRenderer());

    // #region START_AUTOFILL_TABLE — invariant: table/thead/tbody/tr/th/td delegate to TableRenderer for MD, XmlFormatter for XML
    this.register('table', this._createTableRenderer());
    this.register('thead', this._createTransparentTagRenderer('thead'));
    this.register('tbody', this._createTransparentTagRenderer('tbody'));
    this.register('tr', this._createTransparentTagRenderer('tr'));
    this.register('th', this._createTableCellRenderer('th'));
    this.register('td', this._createTableCellRenderer('td'));
    // #endregion END_AUTOFILL_TABLE
  }

  /**
   * @purpose Create a renderer for an inline text tag (b, em, i, u, strong).
   * @param tag XML tag name
   * @param mdWrapper Symmetric wrapper string for MD (e.g. '**')
   * @returns HtmlTagRenderer that wraps rendered children
   */
  protected _createInlineRenderer(tag: string, mdWrapper: string): HtmlTagRenderer {
    return (
      ctx: RenderContext,
      children: JSXNode[],
      props: Record<string, unknown>,
      walk: (children: JSXNode[], ctx: RenderContext) => string
    ): string => {
      const rendered = walk(children, ctx);
      if (!rendered) return '';
      if (ctx.format === 'xml') {
        return xmlFormatter.formatInline(tag, props, rendered);
      }
      return mdFormatter.formatInline(mdWrapper, rendered);
    };
  }

  /**
   * @purpose Create a renderer for the paragraph tag.
   * @returns HtmlTagRenderer that wraps children as paragraph
   */
  protected _createParagraphRenderer(): HtmlTagRenderer {
    return (
      _ctx: RenderContext,
      children: JSXNode[],
      _props: Record<string, unknown>,
      walk: (children: JSXNode[], ctx: RenderContext) => string
    ): string => {
      return walk(children, _ctx);
    };
  }

  /**
   * @purpose Create a renderer for li — Item in unordered XML, Step num=N in ordered XML, transparent in MD.
   * @returns HtmlTagRenderer for list item
   */
  protected _createLiRenderer(): HtmlTagRenderer {
    return (
      ctx: RenderContext,
      children: JSXNode[],
      _props: Record<string, unknown>,
      walk: (children: JSXNode[], ctx: RenderContext) => string
    ): string => {
      const rendered = walk(children, ctx);
      if (!rendered) return '';
      if (ctx.format === 'xml') {
        if (ctx.listStep !== undefined) {
          return xmlFormatter.formatInline('Step', { num: ctx.listStep }, rendered);
        }
        return xmlFormatter.formatInline('Item', {}, rendered);
      }
      return rendered;
    };
  }

  /**
   * @purpose Create a renderer for table/thead/tbody tags.
   * @returns HtmlTagRenderer that delegates to TableRenderer for MD, wraps in element for XML
   */
  protected _createTableRenderer(): HtmlTagRenderer {
    return (
      ctx: RenderContext,
      children: JSXNode[],
      _props: Record<string, unknown>,
      walk: (children: JSXNode[], ctx: RenderContext) => string
    ): string => {
      // #region START_TABLE_RENDER — invariant: XML wraps children in element; MD delegates to TableRenderer on raw children
      if (ctx.format === 'xml') {
        const rendered = walk(children, ctx);
        return xmlFormatter.formatElement('table', {}, rendered, ctx.depth);
      }
      return tableRenderer.renderToMd(children);
      // #endregion END_TABLE_RENDER
    };
  }

  /**
   * @purpose Create a renderer for thead/tbody/tr — transparent in MD, wraps in XML element.
   * @param tag XML tag name
   * @returns HtmlTagRenderer that passes children through for MD
   */
  protected _createTransparentTagRenderer(tag: string): HtmlTagRenderer {
    return (
      ctx: RenderContext,
      children: JSXNode[],
      _props: Record<string, unknown>,
      walk: (children: JSXNode[], ctx: RenderContext) => string
    ): string => {
      const rendered = walk(children, ctx);
      if (ctx.format === 'xml') {
        return xmlFormatter.formatElement(tag, {}, rendered, ctx.depth);
      }
      return rendered;
    };
  }

  /**
   * @purpose Create a renderer for th/td — renders cell content, wraps th in bold for MD.
   * @param tag XML tag name ('th' or 'td')
   * @returns HtmlTagRenderer for table cell
   */
  protected _createTableCellRenderer(tag: string): HtmlTagRenderer {
    return (
      ctx: RenderContext,
      children: JSXNode[],
      _props: Record<string, unknown>,
      walk: (children: JSXNode[], ctx: RenderContext) => string
    ): string => {
      const rendered = walk(children, ctx);
      if (ctx.format === 'xml') {
        return xmlFormatter.formatElement(tag, {}, rendered, ctx.depth);
      }
      if (tag === 'th') {
        return `**${rendered}**`;
      }
      return rendered;
    };
  }
}

/** @purpose Singleton registry instance with auto-filled built-in tags. */
export const htmlTagRegistry = new HTMLTagRegistry();
htmlTagRegistry.autoFill();
