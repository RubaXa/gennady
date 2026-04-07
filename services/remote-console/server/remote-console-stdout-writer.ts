import type { RemoteConsoleLogEntry } from '../client/remote-console-client.types.ts';

/**
 * @purpose Renders remote log entries into deterministic flat stdout lines for terminal consumers.
 * @consumer RemoteConsoleHttpServer
 */
export class RemoteConsoleStdoutWriter {
  /** @purpose Stores low-level line sink used to emit already-rendered stdout entries. */
  protected readonly _writeLine: (line: string) => void;

  /** @purpose Configures writer with injected sink or defaults to process.stdout line output. */
  constructor(writeLine?: (line: string) => void) {
    this._writeLine = writeLine ?? ((line) => process.stdout.write(`${line}\n`));
  }

  /**
   * @purpose Prints ordered log entries as one normalized line per entry.
   * @param items Parsed log entry list from command envelope payload.
   * @sideEffect IO: writes rendered lines into stdout stream (or injected writer).
   */
  write(items: RemoteConsoleLogEntry[]): void {
    for (const item of items) {
      const line = this.render(item);
      this._writeLine(line);
    }
  }

  /**
   * @purpose Creates stable text format independent from platform util.inspect behavior.
   * @param item Single remote log entry with serialized args.
   * @returns Flat line in format `[console.<level>] <arg1> <arg2> ...`.
   */
  render(item: RemoteConsoleLogEntry): string {
    const argsText = item.args
      .map((arg) => arg.text)
      .join(' ')
      .trim();
    return argsText ? `[console.${item.level}] ${argsText}` : `[console.${item.level}]`;
  }
}
