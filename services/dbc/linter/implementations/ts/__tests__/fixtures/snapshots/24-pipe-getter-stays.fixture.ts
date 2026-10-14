// @file: pipe getter stays
// @spec: DBC-DBC-LINTER
// @consumers: test
export class Svc {
  /** @purpose Getter pipe stays. */
  get val(): number { return 1; }
}
