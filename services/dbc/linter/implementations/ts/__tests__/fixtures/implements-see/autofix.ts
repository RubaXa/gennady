/** @purpose Agent interface. */
interface Agent {
  scan(x: number): string;
}

/** @purpose Implementation — autofix should remove param and returns tags. */
export class Impl implements Agent {
  /**
   * @see {Agent#scan}
   * @param x - coordinate
   * @returns result
   */
  scan(x: number): string {
    return `scanned ${x}`;
  }
}
