// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/implements-see/see-wrong-method.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/** @purpose Agent interface. */
interface Agent {
  scan(x: number): string;
  otherMethod(): void;
}

/** @purpose Class implementing Agent, but @see methodName differs from member name. */
export class Impl implements Agent {
  /**
   * @see {Agent#otherMethod}
   * @param x
   * @returns result
   */
  scan(x: number): string {
    return `scanned ${x}`;
  }

  /** @purpose Another method. */
  otherMethod(): void {}
}
