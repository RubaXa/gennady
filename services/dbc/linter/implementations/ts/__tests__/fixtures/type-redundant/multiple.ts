/**
 * @purpose Build config.
 * @param name Config name.
 * @param port Config port.
 * @returns Config object.
 */
export function buildConfig(name: string, port: number): Record<string, unknown> {
  return { name, port };
}
