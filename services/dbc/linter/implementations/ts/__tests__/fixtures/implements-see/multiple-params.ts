/** @purpose Agent interface. */
interface Agent {
  scan(x: number, y: number): string;
}

/** @purpose Implementation with multiple @param and @returns — all are redundant. */
export class Impl implements Agent {
  /**
   * @see {Agent#scan}
   * @param x - first coordinate
   * @param y - second coordinate
   * @returns result
   */
  scan(x: number, y: number): string {
    return `scanned ${x},${y}`;
  }
}
