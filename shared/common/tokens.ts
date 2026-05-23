// @file: Подсчитать приблизительное количество токенов в тексте.
// @consumers: git-diff
// @tasks: N/A

/** @purpose Подсчитать приблизительное количество токенов в тексте. */
export const countTokens = (text: string): number => {
  const tokens = text.match(/[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu);
  return tokens ? tokens.length : 0;
};
