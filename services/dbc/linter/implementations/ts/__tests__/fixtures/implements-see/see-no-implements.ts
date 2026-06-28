/** @purpose Agent interface. */
interface Agent {
  scan(x: number): string;
}

/** @purpose Class without implements clause — @see does NOT make params redundant. */
export class Helper {
  /**
   * @see {Agent#scan}
   * @param x
   * @returns result
   */
  scan(x: number): string {
    return `scanned ${x}`;
  }
}
