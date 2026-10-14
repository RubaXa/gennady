// @file: Fixture — multi-line JSDoc with malformed closing (*/ on same line as last tag).
// @spec: DBC-DBC-LINTER
// @consumers: DbcTsLinterTest
/** @purpose Multi-line with malformed closing. | @returns 0 for clean, 1 for errors. */
export function malformedClosing(): number {
  return 0;
}
