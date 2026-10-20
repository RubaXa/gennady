// @file: Fuzzy title matching for peer resolution across runtimes.
// @spec: PEER
// @consumers: opencode.transport, codex.transport

/**
 * @purpose Split a query into lowercase stems long enough to match on.
 */
export const queryStems = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length >= 3)
    .map((word) => word.slice(0, 5));

/**
 * @purpose Score how many query stems appear in a title.
 */
export const fuzzyTitleScore = (title: string, query: string): number => {
  const lower = title.toLowerCase();
  return queryStems(query).filter((stem) => lower.includes(stem)).length;
};

/**
 * @purpose Pick the best fuzzy title match above a threshold.
 */
export const bestFuzzyMatch = <T extends { id: string; title?: string }>(
  items: T[],
  query: string
): T | undefined => {
  const stems = queryStems(query);
  if (stems.length === 0) return undefined;
  const threshold = Math.max(1, Math.ceil(stems.length / 2));
  let best: { item: T; score: number } | undefined;
  for (const item of items) {
    const score = fuzzyTitleScore(item.title ?? '', query);
    if (score >= threshold && (!best || score > best.score)) best = { item, score };
  }
  return best?.item;
};
