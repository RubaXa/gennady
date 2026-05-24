// @file: Estimate approximate token count in text.
// @consumers: git-diff
// @tasks: N/A

/** @purpose Estimate approximate token count in text. */
export const countTokens = (text: string): number => {
  const tokens = text.match(/[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu);
  return tokens ? tokens.length : 0;
};
