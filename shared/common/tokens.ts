/**
 * @purpose Подсчитать приблизительное количество токенов в тексте.
 * @param text Исходный текст.
 * @returns Количество токенов (по разбиению на слова и символы).
 */
export const countTokens = (text: string): number => {
  const tokens = text.match(/[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu);
  return tokens ? tokens.length : 0;
};
