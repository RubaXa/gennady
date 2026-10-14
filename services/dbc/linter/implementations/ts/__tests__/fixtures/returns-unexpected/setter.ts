// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/returns-unexpected/setter.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/**
 * @purpose Container.
 */
export class Container {
  private _name: string = '';

  /**
   * @purpose Sets name.
   * @returns Void.
   */
  set name(v: string) {
    this._name = v;
  }
}
