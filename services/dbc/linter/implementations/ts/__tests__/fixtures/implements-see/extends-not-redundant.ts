// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/implements-see/extends-not-redundant.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/** @purpose Base class with calculate method. */
class Base {
  calculate(x: number): number {
    return x + 1;
  }
}

/** @purpose Child class extending Base (NOT implements). */
export class Child extends Base {
  /**
   * @see {Base#calculate}
   * @param x
   * @returns result
   */
  calculate(x: number): number {
    return x * 2;
  }
}
