// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/implements-see/extends-no-see.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/** @purpose Base class. */
class Base {
  calculate(x: number): number {
    return x + 1;
  }
}

/** @purpose Child class extending Base without @see and without override. */
export class Child extends Base {
  /**
   * @param x
   * @returns result
   */
  calculate(x: number): number {
    return x * 2;
  }
}
