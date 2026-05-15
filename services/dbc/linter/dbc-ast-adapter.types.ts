// @file: Port DbcAstAdapter and AST-related Value Objects for the dbc-linter module.
// @consumers: DbcTsAstAdapter
// @tasks: TSK-07

/**
 * @purpose Describes a single parameter in a function or method signature.
 */
export type DbcParamInfo = {
  /** @purpose Parameter name as declared in source */
  name: string;
  /** @purpose TypeScript type annotation as written in source */
  type: string;
  /** @purpose Whether the parameter is optional (`x?: T`) */
  optional: boolean;
  /** @purpose Whether the parameter is a rest parameter (`...args`) */
  isRest: boolean;
};

/**
 * @purpose Describes the full signature of a callable entity: parameters and return type.
 */
export type DbcSignatureInfo = {
  /** @purpose Ordered list of parameters in the signature */
  params: DbcParamInfo[];
  /** @purpose Return type annotation as written in source, or 'void' */
  returnType: string;
};

/**
 * @purpose Compact representation of a raw JSDoc contract comment associated with an AST node.
 */
type DbcContractInfo = {
  /** @purpose Full text of the JSDoc comment between /** and *​/ */
  text: string;
  /** @purpose One-based line number where the comment starts */
  startLine: number;
  /** @purpose One-based column number where the comment starts */
  startCol: number;
};

/**
 * @purpose A member of an exported entity: field, method, getter, setter, constructor, or interface/enum member.
 */
export type DbcMember = {
  /** @purpose Member name as declared in source */
  name: string;
  /** @purpose Kind of member: 'field' | 'method' | 'getter' | 'setter' | 'constructor' | 'interface-method' | 'interface-property' | 'enum-member' */
  kind: string;
  /** @purpose JSDoc contract associated with this member, if any */
  contract?: DbcContractInfo;
  /** @purpose Extracted signature information for callable members */
  signature: DbcSignatureInfo;
};

/**
 * @purpose An exported entity extracted from a source file: const, function, class, interface, type, enum, or default export.
 * @invariant Every exported entity has a `kind` from the closed set.
 * @invariant `members` is non-empty only for class, interface, and enum entities.
 */
export type DbcExportedEntity = {
  /** @purpose Entity name as declared in source */
  name: string;
  /** @purpose Kind of exported entity: 'const' | 'function' | 'class' | 'interface' | 'type' | 'enum' | 'export-default' */
  kind: string;
  /** @purpose Members of the entity (fields, methods, etc.) — populated for class, interface, enum */
  members: DbcMember[];
  /** @purpose JSDoc contract associated with this entity, if any */
  contract?: DbcContractInfo;
  /** @purpose Extracted signature information for callable entities */
  signature: DbcSignatureInfo;
};

/**
 * @purpose Result of parsing a source file: either a list of exported entities or a parse error.
 */
export type DbcParseResult =
  | { ok: true; exported: DbcExportedEntity[] }
  | { ok: false; error: string };

/**
 * @purpose Abstraction for parsing a source file and extracting exported entities with their contracts and signatures.
 * @invariant The adapter never throws — all error paths are represented via DbcParseResult.
 * @invariant `exported` contains all top-level exported entities, excluding re-exports.
 */
export interface DbcAstAdapter {
  /**
   * @purpose Parse a source file and extract all exported entities with their contracts and signatures.
   * @param filePath Absolute or relative path to the source file.
   * @returns On success: exported entities list. On failure: error description.
   */
  parseFile(filePath: string): Promise<DbcParseResult>;
}
