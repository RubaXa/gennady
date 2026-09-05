// @file: Shared line-oriented Markdown fence state for SDD structural parsers.
// @consumers: requirement-budget
// @tasks: N/A

/** @purpose Active CommonMark-style backtick or tilde fence. */
export type MarkdownFence = {
  /** @purpose Delimiter character that opened the fence. */
  marker: '`' | '~';
  /** @purpose Minimum delimiter length required to close the fence. */
  length: number;
};

/** @purpose Advance a Markdown fence state for one line. | @param line Raw line. | @param active Current fence. | @returns Next fence state. */
export function nextMarkdownFence(
  line: string,
  active: MarkdownFence | null
): MarkdownFence | null {
  if (active !== null) {
    const close = /^[ \t]{0,3}(`+|~+)[ \t]*$/.exec(line);
    if (close && close[1]?.[0] === active.marker && (close[1]?.length ?? 0) >= active.length)
      return null;
    return active;
  }
  const open = /^[ \t]{0,3}(`{3,}|~{3,})(?:[^\r\n]*)$/.exec(line);
  if (!open?.[1]) return null;
  return { marker: open[1][0] as '`' | '~', length: open[1].length };
}
