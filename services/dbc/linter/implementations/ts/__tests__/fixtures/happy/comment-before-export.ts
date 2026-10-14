// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/happy/comment-before-export.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/**
 * @purpose A description placed before the export keyword.
 * @returns Always 'ok'.
 */
export function described(): string {
  return 'ok';
}
