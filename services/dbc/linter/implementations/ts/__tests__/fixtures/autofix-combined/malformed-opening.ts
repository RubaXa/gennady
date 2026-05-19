// @file: Fixture — multi-line JSDoc with malformed opening (content on opening line).
// @consumers: DbcTsLinterTest
// @consumers: DbcTsLinterTest
// @tasks: TSK-21
/** @purpose Multi-line with malformed opening — content on first line after /**. | @invariant Y. | @sideEffect Z. */
export function malformedOpening(): void {}
