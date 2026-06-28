/** @purpose Agent interface. */
interface Agent {
  scan(x: number): string;
}

/** @purpose Stoppable interface. */
interface Stoppable {
  stop(): void;
}

/** @purpose Class implementing multiple interfaces. */
export class Impl implements Agent, Stoppable {
  /**
   * @see {Agent#scan}
   * @param x
   * @returns result
   */
  scan(x: number): string {
    return `scanned ${x}`;
  }

  /** @purpose Stops the agent. */
  stop(): void {}
}
