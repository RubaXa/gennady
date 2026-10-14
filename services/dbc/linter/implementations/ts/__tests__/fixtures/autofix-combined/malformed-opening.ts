// @file: Fixture — multi-line JSDoc with malformed opening (content on opening line).
// @spec: DBC-DBC-LINTER
// @consumers: DbcTsLinterTest
/** @purpose Multi-line with malformed opening — content on first line after /**. | @invariant Y. | @sideEffect Z. */
export function malformedOpening(): void {}
