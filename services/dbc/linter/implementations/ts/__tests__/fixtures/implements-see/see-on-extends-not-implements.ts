// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/implements-see/see-on-extends-not-implements.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/** @purpose Agent interface. */
interface Agent {
  scan(x: number): string;
}

/** @purpose Base class. */
class Base {
  scan(x: number): string {
    return `base ${x}`;
  }
}

/** @purpose Class extending Base and implementing Agent, but @see references Base (extends), not Agent. */
export class Impl extends Base implements Agent {
  /**
   * @see {Base#scan}
   * @param x
   * @returns result
   */
  scan(x: number): string {
    return `impl ${x}`;
  }
}
