// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/implements-see/autofix-idempotent.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/** @purpose Agent interface. */
interface Agent {
  scan(x: number): string;
}

/** @purpose Already autofixed — @param and @returns already removed, only @see remains. */
export class Impl implements Agent {
  /** @see {Agent#scan} */
  scan(x: number): string {
    return `scanned ${x}`;
  }
}
