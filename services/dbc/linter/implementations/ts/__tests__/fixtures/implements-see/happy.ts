// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/implements-see/happy.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/** @purpose Simple agent interface. */
interface Agent {
  scan(x: number): string;
}

/** @purpose Implementation of Agent. */
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
