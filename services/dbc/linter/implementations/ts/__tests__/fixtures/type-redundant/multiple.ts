// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/type-redundant/multiple.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/**
 * @purpose Build config.
 * @param {string} name Config name.
 * @param {number} port Config port.
 * @returns {object} Config object.
 */
export function buildConfig(name: string, port: number): Record<string, unknown> {
  return { name, port };
}
