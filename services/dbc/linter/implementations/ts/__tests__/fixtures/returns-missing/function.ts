// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/returns-missing/function.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/** @purpose Gets a name. @param id User identifier. */
export function getName(id: string): string {
  return `user-${id}`;
}
