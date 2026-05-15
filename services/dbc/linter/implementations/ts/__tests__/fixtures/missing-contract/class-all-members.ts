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
