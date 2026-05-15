/** @purpose A service class. */
export class Service {
  /** @purpose Fetches data. @param id Item identifier. */
  fetchData(id: string): Record<string, unknown> {
    return { id };
  }
}
