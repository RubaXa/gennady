/**
 * @purpose Class with various visibility modifiers.
 */
export class PrivateClass {
  /** @purpose Public field. */
  name: string;

  /** @purpose Private-like field. */
  _secret: string;

  /**
   * @purpose Creates instance.
   * @param name The user name.
   */
  constructor(name: string) {
    this.name = name;
    this._secret = '';
  }

  /**
   * @purpose Returns a greeting.
   * @returns The greeting string.
   */
  greet(): string {
    return `Hello ${this.name}`;
  }
}
