/** @purpose Agent interface. */
interface Agent {
  scan(x: number): string;
}

/** @purpose Method with only @returns (no @param) — redundancy fires, RETURNS_UNEXPECTED suppressed. */
export class Impl implements Agent {
  /**
   * @see {Agent#scan}
   * @returns result
   */
  scan(x: number): string {
    return `scanned ${x}`;
  }
}
