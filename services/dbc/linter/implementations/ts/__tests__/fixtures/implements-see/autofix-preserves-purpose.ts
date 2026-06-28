/** @purpose Agent interface. */
interface Agent {
  scan(x: number): string;
}

/** @purpose Autofix preserves purpose and see while removing param and returns tags. */
export class Impl implements Agent {
  /**
   * @see {Agent#scan}
   * @purpose Scans the area
   * @param x - coordinate
   * @returns result
   */
  scan(x: number): string {
    return `scanned ${x}`;
  }
}
