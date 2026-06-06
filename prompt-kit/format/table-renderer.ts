// @file: Table renderer — converts HTML table nodes (thead/tbody/tr/td/th) to Markdown pipe table
// @consumers: MdFormatter
// @tasks: TSK-63

/** @purpose A node in a JSX tree before rendering. */
type JsxNode =
  | string
  | {
      type: string | unknown;
      props: Record<string, unknown>;
      children?: JsxNode[];
    };

/**
 * @purpose Converts an HTML-like table node tree to a Markdown pipe table.
 * @invariant thead and tbody tags are transparent — only their tr children are rendered | Column count is determined by the first row; shorter rows are padded with empty cells, longer rows are truncated | th cells in the header row are rendered as bold text.
 */
export class TableRenderer {
  /**
   * @purpose Render a table node's children as a Markdown pipe table.
   * @param children Children of the table node (tr, thead, tbody, td, th)
   * @returns Markdown pipe table string
   */
  renderToMd(children: JsxNode[]): string {
    const rows = this._collectRows(children);
    if (rows.length === 0) return '';

    const colCount = rows[0].length;

    const lines: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = this._padRow(rows[i], colCount);
      lines.push('| ' + row.join(' | ') + ' |');

      // #region START_ADD_SEPARATOR_HEADER — invariant: separator row after the first (header) row
      if (i === 0) {
        const separators = row.map(() => '---');
        lines.push('|' + separators.join('|') + '|');
      }
      // #endregion END_ADD_SEPARATOR_HEADER
    }

    return lines.join('\n');
  }

  /**
   * @purpose Recursively collect row cells from thead/tbody/tr children.
   * @param children Children of a table/thead/tbody node
   * @returns Array of rows, each row an array of cell text strings
   */
  protected _collectRows(children: JsxNode[]): string[][] {
    const rows: string[][] = [];
    for (const child of children) {
      if (typeof child === 'string') continue;
      const tag = child.type;
      if (typeof tag !== 'string') continue;

      // #region START_RESOLVE_ROW_TAG — thead/tbody transparent, tr collects cells
      if (tag === 'tr') {
        rows.push(this._extractCells(child));
      } else if (tag === 'thead' || tag === 'tbody') {
        if (child.children) {
          rows.push(...this._collectRows(child.children));
        }
      }
      // #endregion END_RESOLVE_ROW_TAG
    }
    return rows;
  }

  /**
   * @purpose Extract cell text from a tr node's td/th children.
   * @param tr A table row JSX node
   * @returns Array of cell text strings, with th cells bold-wrapped
   */
  protected _extractCells(tr: JsxNode): string[] {
    if (typeof tr === 'string' || !tr.children) return [];
    const cells: string[] = [];
    for (const child of tr.children) {
      if (typeof child === 'string') continue;
      const tag = child.type;
      if (typeof tag !== 'string' || (tag !== 'td' && tag !== 'th')) continue;

      // purpose: collect nested text from node children, preserving nested inline elements
      let text = this._collectText(child);

      if (tag === 'th') {
        text = `**${text}**`;
      }
      cells.push(text);
    }
    return cells;
  }

  /**
   * @purpose Recursively collect text content from a JSX node tree.
   * @param node A JSX node or string leaf
   * @returns Concatenated text content
   */
  protected _collectText(node: JsxNode): string {
    if (typeof node === 'string') return node;
    if (!node.children) return '';
    return node.children.map((c) => this._collectText(c)).join('');
  }

  /**
   * @purpose Pad or truncate a row to match the target column count.
   * @param row Cell text strings for one row
   * @param colCount Target number of columns
   * @returns Row padded with empty strings or truncated to colCount
   */
  protected _padRow(row: string[], colCount: number): string[] {
    if (row.length < colCount) {
      return [...row, ...Array(colCount - row.length).fill('')];
    }
    return row.slice(0, colCount);
  }
}
