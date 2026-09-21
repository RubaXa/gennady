// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/returns-missing/method.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/** @purpose A service class. */
export class Service {
  /** @purpose Fetches data. @param id Item identifier. */
  fetchData(id: string): Record<string, unknown> {
    return { id };
  }
}
