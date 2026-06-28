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
