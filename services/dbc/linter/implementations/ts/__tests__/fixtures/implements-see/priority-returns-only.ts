// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/implements-see/priority-returns-only.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/** @purpose Agent interface. */
interface Agent {
  scan(x: number): string;
}

/** @purpose Method with only @returns (no @param) — redundancy fires, RETURNS_UNEXPECTED suppressed. */
export class Impl implements Agent {
  /**
   * @see {Agent#scan}
   * @returns result
   */
  scan(x: number): string {
    return `scanned ${x}`;
  }
}
