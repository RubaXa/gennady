// @file: Fixture — indented multi-tag multi-line JSDoc with varying indentation.
// @consumers: DbcTsLinterTest
// @tasks: TSK-21

/**
 * @purpose Service class for testing indentation preservation in autofix.
 */
export class IndentedService {
  /**
   * @purpose Indented multi-tag contract.
   * @param {string} input The input value.
   * @returns {string} The output value.
   */
  parse(input: string): string {
    return input;
  }

  /**
   * @purpose Malformed closing — closing marker on same line as last tag.
   * @returns 0 for clean, 1 for errors. */
  malformedClosing(): number {
    return 0;
  }

  /**
   * @purpose Single-tag indented — should inline.
   */
  singleTag(): void {}

  /**
   * @purpose Multi-tag indented — canonical form.
   * @invariant Must be called after init.
   * @sideEffect Writes to disk.
   */
  multiTagCanonical(): void {}
}
