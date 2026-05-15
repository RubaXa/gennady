/** @purpose Shape for a user record. */
export interface UserShape {
  /** @purpose Unique identifier. */
  id: string;

  /**
   * @purpose Retrieves the display name.
   * @returns The user's display name.
   */
  getName(): string;
}
