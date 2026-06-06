// @file: List punctuation utility — appends ; or . to list items, skipping terminal marks
// @consumers: MdFormatter, XmlFormatter
// @tasks: TSK-63

const TERMINAL_PUNCTUATION = new Set(['.', '!', '?', ';']);

/**
 * @purpose Applies list-separator punctuation: semicolon for non-last items, period for last.
 * @invariant Skips punctuation if text already ends with a terminal mark (.!?;) | Empty text is returned unchanged.
 */
export class ListPunctuation {
  /**
   * @purpose Append the appropriate punctuation mark to the text.
   * @param text The list item text
   * @param isLast Whether this is the last element in the list
   * @returns Text with appended punctuation or unchanged text
   */
  punctuate(text: string, isLast: boolean): string {
    if (!text) return text;
    const lastChar = text[text.length - 1];
    if (TERMINAL_PUNCTUATION.has(lastChar)) return text;
    return text + (isLast ? '.' : ';');
  }
}
