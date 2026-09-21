// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/implements-see/override-not-redundant.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/** @purpose Base class with calculate method. */
class Base {
  calculate(x: number): number {
    return x + 1;
  }
}

/** @purpose Child class extending Base with override and changed signature. */
export class Child extends Base {
  /**
   * @see {Base#calculate}
   * @param x
   * @param y
   * @returns sum
   */
  override calculate(x: number, y: number): number {
    return x + y;
  }
}
