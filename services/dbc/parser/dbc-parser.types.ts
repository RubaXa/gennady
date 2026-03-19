/**
 * @purpose Defines the universal contract schema and parser interface for DBC parsers.
 * @consumer DbcParserImplementations
 * @invariant Any implementation must return an entries array for every parse invocation.
 */
export type DbcSchema = {
  /** @purpose Parsed contract entries normalized into the universal shape. */
  entries: DbcEntrySchema[];
};

/**
 * @purpose Represents a single parsed contract tag or inferred description block.
 * @consumer DbcSchema
 * @invariant Every entry always contains an `issues` array, even when it is empty.
 */
export type DbcEntrySchema = {
  /** @purpose Tag type without leading at-sign, for example `param` or `returns`. */
  type: string;
  /** @purpose Target identifier attached to the entry, usually a parameter or symbol name. */
  specifier?: string;
  /** @purpose Data type extracted from curly braces when present. */
  dataType?: string;
  /** @purpose Optionality flag set when specifier is wrapped in square brackets. */
  optional?: boolean;
  /** @purpose Human-readable entry content after type and optional metadata. */
  value: string;
  /** @purpose Validation issues related to this entry. */
  issues: DbcDbcEntryIssue[];
};

/**
 * @purpose Represents a single validation issue bound to an issue code and optional source line.
 * @consumer DbcSchema
 */
export type DbcDbcEntryIssue = {
  /** @purpose Stable issue identifier consumed by diagnostics and tooling. */
  code: DbcIssueCode;
  /** @purpose One-based line number in the input contract where the issue was detected. */
  line?: number;
};

/**
 * @purpose Signals a forbidden combination: `@purpose` and `@see` are used together.
 */
export const ERR_DBC_PURPOSE_CONFLICT = 'ERR_DBC_PURPOSE_CONFLICT';

/**
 * @purpose Signals that contract tags violate the required ordering.
 */
export const ERR_DBC_ORDER = 'ERR_DBC_ORDER';

/**
 * @purpose Signals that a `@param` tag misses its specifier.
 */
export const ERR_DBC_PARAM_NAME_MISSING = 'ERR_DBC_PARAM_NAME_MISSING';

/**
 * @purpose Signals that a `@see` tag misses a valid `{specifier}` payload.
 */
export const ERR_DBC_SEE_FORMAT_INVALID = 'ERR_DBC_SEE_FORMAT_INVALID';

/** @purpose Union of all supported parser issue codes. */
export type DbcIssueCode =
  | typeof ERR_DBC_PURPOSE_CONFLICT
  | typeof ERR_DBC_ORDER
  | typeof ERR_DBC_PARAM_NAME_MISSING
  | typeof ERR_DBC_SEE_FORMAT_INVALID;

/**
 * @purpose Defines the universal parser contract for textual Design by Contract blocks.
 * @consumer Any parser implementation in `services/dbc/parser/implementations/*`
 * @param inputContract Raw contract text in plain or JSDoc-like syntax.
 * @returns Parsed entries with entry-local validation diagnostics in the universal schema.
 */
export interface DbcParser {
  parse(inputContract: string): DbcSchema;
}
