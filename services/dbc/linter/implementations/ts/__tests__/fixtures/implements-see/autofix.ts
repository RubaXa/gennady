// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/implements-see/autofix.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
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
