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
