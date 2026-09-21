// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/happy/export-default.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/**
 * @purpose Formats a name for display.
 * @param name The raw name.
 * @returns The formatted name.
 */
export default function formatName(name: string): string {
  return name.trim();
}
