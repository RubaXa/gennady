// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/implements-see/see-wrong-interface.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/** @purpose Agent interface. */
interface Agent {
  scan(x: number): string;
}

/** @purpose Other interface (not implemented). */
interface Other {
  scan(x: number): string;
}

/** @purpose Class implementing Agent, but @see references Other which is not implemented. */
export class Impl implements Agent {
  /**
   * @see {Other#scan}
   * @param x
   * @returns result
   */
  scan(x: number): string {
    return `scanned ${x}`;
  }
}
