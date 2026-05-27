/**
 * @purpose Build config.
 * @param {string} name Config name.
 * @param {number} port Config port.
 * @returns {object} Config object.
 */
export function buildConfig(name: string, port: number): Record<string, unknown> {
  return { name, port };
}
