// @file: Markdown format engine — serializes prompt tree nodes to Markdown with headings, lists, code blocks, anchors, and inline formatting
// @consumers: core/TreeWalker
// @tasks: TSK-63

import { AnchorBuilder } from './anchor-builder.js';

/**
 * @purpose Renders prompt tree nodes as Markdown with heading levels by depth, list formatting, code blocks, anchors, and inline wrappers.
 * @invariant depth 0 → #, depth n → # repeated n+1 times | Section inside list context renders as inline bold form | Inline wrappers are symmetric: **...** or *...*.
 */
export class MdFormatter {
  /** @purpose Deduplicating anchor builder for section boundary comments. */
  protected _anchorBuilder: AnchorBuilder;

  /** @purpose Initialise the formatter with a fresh anchor builder. */
  constructor() {
    this._anchorBuilder = new AnchorBuilder();
  }

  /**
   * @purpose Render a section with heading, optional anchors, and children.
   * @param title Section title (empty string omits heading)
   * @param children Pre-rendered children string
   * @param depth Nesting depth (0 = top-level heading #)
   * @param [anchors] Optional start/end anchor strings
   * @returns Markdown section string
   */
  formatSection(
    title: string,
    children: string,
    depth: number,
    anchors?: { start: string; end: string }
  ): string {
    const headingMark = '#'.repeat(depth + 1);
    const parts: string[] = [];

    if (anchors?.start) {
      parts.push(anchors.start);
    }

    if (title) {
      parts.push(`${headingMark} ${title}:`);
    }

    if (children) {
      if (parts.length > 0) parts.push('');
      parts.push(children);
    }

    if (anchors?.end) {
      parts.push(anchors.end);
    }

    return parts.join('\n');
  }

  /**
   * @purpose Render a section in inline form when inside a list context.
   * @param title Section title
   * @param children Pre-rendered children string
   * @returns Inline bold section string
   */
  formatSectionInline(title: string, children: string): string {
    if (!children) return `**${title}**`;
    return `**${title}** — ${children}`;
  }

  /**
   * @purpose Render a list with ordered/unordered items and optional title.
   * @param children Pre-rendered children string (items separated by newline)
   * @param [ordered] Whether the list is numbered
   * @param [title] Optional list title rendered as bold header
   * @returns Markdown list string
   */
  formatList(children: string, ordered: boolean = false, title?: string): string {
    const parts: string[] = [];

    if (title) {
      parts.push(`**${title}:**`);
    }

    if (children) {
      const items = children.split('\n').filter((l) => l.trim());
      for (let i = 0; i < items.length; i++) {
        const prefix = ordered ? `${i + 1}. ` : '- ';
        parts.push(`${prefix}${items[i]}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * @purpose Render a code block with optional language and title.
   * @param children Pre-rendered code content string
   * @param [lang] Optional language identifier for syntax highlighting
   * @param [title] Optional title rendered as bold header before the block
   * @returns Fenced code block Markdown string
   */
  formatBlock(children: string, lang?: string, title?: string): string {
    const parts: string[] = [];

    if (title) {
      parts.push(`**${title}:**`);
    }

    const fence = '```' + (lang ?? '');
    parts.push(fence);

    if (children) {
      parts.push(children);
    }

    parts.push('```');

    return parts.join('\n');
  }

  /**
   * @purpose Render inline text with a symmetric wrapper (e.g. **bold**, *italic*).
   * @param wrapper The wrapper character(s) applied symmetrically (e.g. '**', '*')
   * @param children Pre-rendered children string
   * @returns Wrapped inline string
   */
  formatInline(wrapper: string, children: string): string {
    if (!children) return '';
    return `${wrapper}${children}${wrapper}`;
  }
}
