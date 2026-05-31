// @file: Fixture with DBC errors for autofix.
// @consumers: FixtureConsumer

/**
 * @purpose Function with extra unmatched @param that autofix removes.
 * @param a First param.
 * @param extra Unmatched param — should be removed by autofix.
 * @returns Result.
 */
export function needsFix(a: number): number {
  return a;
}
