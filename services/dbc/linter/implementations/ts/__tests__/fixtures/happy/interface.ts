// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/happy/interface.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
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
