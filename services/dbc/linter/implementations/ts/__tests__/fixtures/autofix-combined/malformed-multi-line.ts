// @file: Fixture — multi-line JSDoc with malformed closing (*/ on same line as last tag).
// @consumers: DbcTsLinterTest
// @tasks: TSK-21
/** @purpose Multi-line with malformed closing. | @returns 0 for clean, 1 for errors. */
export function malformedClosing(): number {
  return 0;
}
