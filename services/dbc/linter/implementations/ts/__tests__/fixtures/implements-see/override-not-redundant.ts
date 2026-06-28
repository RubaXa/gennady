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
