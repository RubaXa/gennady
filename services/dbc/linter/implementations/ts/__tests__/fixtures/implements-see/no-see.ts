/** @purpose Simple agent interface. */
interface Agent {
  scan(x: number): string;
}

/** @purpose Implementation of Agent. */
export class Impl implements Agent {
  /**
   * @param x - coordinate
   * @returns result
   */
  scan(x: number): string {
    return `scanned ${x}`;
  }
}
