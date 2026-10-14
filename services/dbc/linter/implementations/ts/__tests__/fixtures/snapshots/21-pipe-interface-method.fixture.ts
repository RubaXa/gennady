// @file: pipe in interface method
// @spec: DBC-DBC-LINTER
// @consumers: test
export interface ISvc {
  /** @purpose Indented pipe in interface. | @param x Input. | @returns Result. */
  m1(x: string): string;
}
