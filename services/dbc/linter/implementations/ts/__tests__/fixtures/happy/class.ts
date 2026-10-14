// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/happy/class.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/**
 * @purpose A simple counter with increment.
 */
export class Counter {
  /** @purpose Current count value. */
  count: number = 0;

  /**
   * @purpose Creates a counter with initial value.
   * @param initial Starting count value.
   */
  constructor(initial: number) {
    this.count = initial;
  }

  /**
   * @purpose Retrieves the current count value.
   * @returns The new count.
   */
  get value(): number {
    return this.count;
  }

  /** @purpose Increments by one. */
  increment(): void {
    this.count += 1;
  }
}
