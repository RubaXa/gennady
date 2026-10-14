// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/param-order/partial.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/**
 * @purpose Partial order violation.
 * @param a First.
 * @param c Third.
 * @param b Second.
 */
export function partial(a: string, b: number, c: boolean): void {}
