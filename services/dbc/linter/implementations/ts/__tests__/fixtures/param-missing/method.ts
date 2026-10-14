// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/param-missing/method.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/** @purpose A worker class. */
export class Worker {
  /** @purpose Runs a task. @returns Result. */
  run(input: string): string {
    return input;
  }
}
