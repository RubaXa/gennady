// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/type-redundant/returns.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/**
 * @purpose Create user.
 * @returns {object} New user.
 */
export function createUser(): Record<string, unknown> {
  return {};
}
