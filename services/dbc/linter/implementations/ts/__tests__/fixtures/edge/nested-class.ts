// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/edge/nested-class.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/**
 * @purpose Outer class.
 */
export class Outer {
  /** @purpose Outer method. */
  run(): void {}
}

/**
 * @purpose Inner class.
 */
export class Inner {
  /** @purpose Inner method. */
  work(): void {}
}
