// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/implements-see/multiple-implements.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
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
