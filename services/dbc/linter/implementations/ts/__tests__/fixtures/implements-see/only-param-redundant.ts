// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/implements-see/only-param-redundant.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/** @purpose Agent interface. */
interface Agent {
  getInfo(id: string): void;
}

/** @purpose Void method in implements class — only @param is redundant, @returns absent. */
export class Impl implements Agent {
  /**
   * @see {Agent#getInfo}
   * @param id
   */
  getInfo(id: string): void {
    console.log(`info: ${id}`);
  }
}
