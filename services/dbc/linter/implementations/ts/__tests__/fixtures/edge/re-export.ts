// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/edge/re-export.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/** @purpose Real export. */
export const local = 1;

export { local as reexported } from './other';
