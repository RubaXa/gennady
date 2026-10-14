// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/missing-contract/class-all-members.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/** @purpose Class with all members missing contracts. */
export class AllMissing {
  id: string = '';
  constructor(name: string) {}
  run(): void {}
  get value(): number {
    return 1;
  }
  set value(v: number) {}
}
