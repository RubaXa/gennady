// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/returns-missing/getter.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/** @purpose A container. */
export class Container {
  /** @purpose Retrieves name. */
  get name(): string {
    return 'container';
  }
}
