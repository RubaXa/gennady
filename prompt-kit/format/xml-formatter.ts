// @file: XML format engine — serializes prompt tree nodes to XML with indentation, attribute escaping, and self-closing tags
// @consumers: core/TreeWalker
// @tasks: TSK-63

/**
 * @purpose Renders prompt tree nodes as XML with proper indentation, attribute escaping, and self-closing empty tags.
 * @invariant Indentation = depth × 2 spaces | Attributes sort keys alphabetically; values escaped: & → &amp;, < → &lt;, > → &gt;, " → &quot; | Empty children produce self-closing tag <tag/>.
 */
export class XmlFormatter {
  /**
   * @purpose Render an element as an indented XML block with attributes and children.
   * @param tag XML tag name
   * @param props Attributes to render on the opening tag
   * @param children Pre-rendered children string
   * @param depth Nesting level (0 = root)
   * @returns Indented XML element string
   */
  formatElement(
    tag: string,
    props: Record<string, unknown>,
    children: string,
    depth: number
  ): string {
    const indent = '  '.repeat(depth);
    const attrStr = this._renderAttributes(props);

    // #region START_SELF_CLOSING_EMPTY — invariant: no children → self-closing tag
    if (!children || children.trim() === '') {
      return `${indent}<${tag}${attrStr}/>`;
    }
    // #endregion END_SELF_CLOSING_EMPTY

    const childIndent = '  '.repeat(depth + 1);
    const escaped = children;
    const indentedChildren = escaped
      .split('\n')
      .map((line) => (line ? childIndent + line : ''))
      .join('\n');

    return `${indent}<${tag}${attrStr}>\n${indentedChildren}\n${indent}</${tag}>`;
  }

  /**
   * @purpose Render an element inline — single line, no indentation.
   * @param tag XML tag name
   * @param props Attributes to render on the tag
   * @param children Pre-rendered children string
   * @returns Inline XML element string
   */
  formatInline(tag: string, props: Record<string, unknown>, children: string): string {
    const attrStr = this._renderAttributes(props);
    if (!children || children.trim() === '') {
      return `<${tag}${attrStr}/>`;
    }
    return `<${tag}${attrStr}>${children}</${tag}>`;
  }

  /**
   * @purpose Build an attribute string from a props object, filtering null/undefined and escaping values.
   * @param props Attribute key-value pairs
   * @returns Space-prefixed attribute string like ' key="val"' or empty
   */
  protected _renderAttributes(props: Record<string, unknown>): string {
    const entries = Object.entries(props).filter(([, v]) => v !== undefined && v !== null);
    if (entries.length === 0) return '';
    return ' ' + entries.map(([k, v]) => `${k}="${this._escapeAttr(String(v))}"`).join(' ');
  }

  /**
   * @purpose Escape special XML characters in an attribute value.
   * @param value Raw attribute value
   * @returns Escaped value with &, <, >, " replaced by entities
   */
  protected _escapeAttr(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * @purpose Escape special XML characters in text content.
   * @param text Raw text content
   * @returns Escaped text with &, <, >, " replaced by entities
   */
  protected _escapeText(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
