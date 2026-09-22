// @file: rest param
// @spec: DBC-DBC-LINTER
// @consumers: test
/**
 * @purpose Rest param.
 * @param ...args Varargs.
 * @returns Result.
 */
export function f16(...args: string[]): string { return args.join(','); }
