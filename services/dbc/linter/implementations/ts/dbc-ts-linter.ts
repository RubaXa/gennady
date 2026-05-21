// @file: DbcContractMatchValidator (pure validation) and DbcTsLinter adapter implementing DbcLinter with autofix chain.
// @consumers: DbcLinter
// @tasks: TSK-09, TSK-11, TSK-20, TSK-21

import { readFileSync, writeFileSync } from 'node:fs';
import { logger } from '#logger';
import type { DbcParser, DbcEntrySchema, DbcSchema } from '../../../parser/dbc-parser.types.ts';
import type { DbcIssueCode } from '../../../parser/dbc-parser.types.ts';
import type {
  DbcAstAdapter,
  DbcExportedEntity,
  DbcParseResult,
  DbcSignatureInfo,
} from '../../dbc-ast-adapter.types.ts';
import type {
  DbcLinter,
  DbcLintReport,
  DbcLintFixReport,
  DbcLintError,
  DbcLintOptions,
  DbcLintIssueCode,
} from '../../dbc-linter.types.ts';
import {
  ERR_DBC_LINT_MISSING_CONTRACT,
  ERR_DBC_LINT_PARSE_FAILED,
  ERR_DBC_LINT_PARAM_MISSING,
  ERR_DBC_LINT_PARAM_EXTRA,
  ERR_DBC_LINT_PARAM_ORDER,
  ERR_DBC_LINT_RETURNS_MISSING,
  ERR_DBC_LINT_RETURNS_UNEXPECTED,
  ERR_DBC_LINT_TYPE_REDUNDANT,
} from '../../dbc-linter.types.ts';

// #region START_KIND_CLASSIFICATION
/** @purpose Set of entity/member kinds that require parameter matching against signature. */
const KINDS_WITH_PARAMS: ReadonlySet<string> = new Set([
  'function',
  'method',
  'interface-method',
  'constructor',
  'export-default',
]);

/** @purpose Set of kinds that require @returns when return type is non-void. */
const KINDS_WITH_RETURNS_WHEN_NON_VOID: ReadonlySet<string> = new Set([
  'function',
  'method',
  'interface-method',
  'export-default',
]);

/** @purpose Set of kinds that always require @returns regardless of return type. */
const KINDS_ALWAYS_RETURNS: ReadonlySet<string> = new Set(['getter']);

/** @purpose Set of kinds that must never have @returns (its presence is unexpected). */
const KINDS_NO_RETURNS: ReadonlySet<string> = new Set([
  'constructor',
  'setter',
  'field',
  'interface-property',
  'const',
  'type',
  'enum',
  'enum-member',
  'class',
  'interface',
]);

/** @purpose All known entity and member kinds — used to detect truly unknown kinds. */
const ALL_KNOWN_KINDS: ReadonlySet<string> = new Set([
  ...KINDS_WITH_PARAMS,
  ...KINDS_WITH_RETURNS_WHEN_NON_VOID,
  ...KINDS_ALWAYS_RETURNS,
  ...KINDS_NO_RETURNS,
  'export-default',
]);
// #endregion END_KIND_CLASSIFICATION

// #region START_VALIDATOR_HELPERS

/**
 * @purpose Normalise a contract entry specifier for comparison with a signature parameter name.
 * Strips leading `...` (rest) and wrapping `[...]` (optional).
 * @param specifier Raw specifier from a `@param` entry.
 * @returns Cleaned parameter name suitable for matching.
 */
function normalizeSpecifier(specifier: string): string {
  let cleaned = specifier;
  if (cleaned.startsWith('...')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
    cleaned = cleaned.slice(1, -1);
  }
  return cleaned;
}

/**
 * @purpose Build a minimal DbcLintError with placeholder file/line/col (caller fills real positions).
 */
function blankError(code: DbcLintIssueCode | DbcIssueCode, message: string): DbcLintError {
  return {
    file: '',
    line: 1,
    col: 1,
    severity: 'error',
    code,
    message,
  };
}

// #endregion END_VALIDATOR_HELPERS

// #region START_DBC_CONTRACT_MATCH_VALIDATOR

/** @purpose Pure-function validator that compares parsed contract entries against | a code signature and returns structural mismatches. | @invariant Never throws. Unknown `kind` returns an empty error array. | @invariant Errors are returned in stable order: PARAM_MISSING → PARAM_EXTRA → | PARAM_ORDER → RETURNS_MISSING → RETURNS_UNEXPECTED → TYPE_REDUNDANT. | @param entries Parsed contract entries from `DbcParser.parse()`. | @param signature Signature information extracted from AST. | @param kind Entity or member kind — drives the validation matrix (FR-24). | @returns Array of lint errors (empty when contract matches signature). */
export function validate(
  entries: DbcEntrySchema[],
  signature: DbcSignatureInfo,
  kind: string
): DbcLintError[] {
  // Unknown kind → no validation (FR-24 safety valve)
  if (!ALL_KNOWN_KINDS.has(kind)) {
    return [];
  }

  const errors: DbcLintError[] = [];
  const paramEntries = entries.filter((e) => e.type === 'param');
  const returnsEntry = entries.find((e) => e.type === 'returns');

  const hasParams = KINDS_WITH_PARAMS.has(kind);
  const checksReturns = KINDS_WITH_RETURNS_WHEN_NON_VOID.has(kind);
  const alwaysReturns = KINDS_ALWAYS_RETURNS.has(kind);
  const noReturns = KINDS_NO_RETURNS.has(kind);

  // #region START_PARAM_VALIDATION
  if (hasParams) {
    const sigParamNames = signature.params.map((p) => p.name);
    const contractParamNames = paramEntries.map((pe) => normalizeSpecifier(pe.specifier ?? ''));

    // PARAM_MISSING: signature param not found in contract
    for (const sigName of sigParamNames) {
      if (!contractParamNames.includes(sigName)) {
        errors.push(
          blankError(ERR_DBC_LINT_PARAM_MISSING, `Parameter '${sigName}' is missing from contract`)
        );
      }
    }

    // PARAM_EXTRA: contract @param not found in signature
    for (let i = 0; i < paramEntries.length; i += 1) {
      const cpName = contractParamNames[i];
      if (!sigParamNames.includes(cpName)) {
        errors.push(
          blankError(
            ERR_DBC_LINT_PARAM_EXTRA,
            `Extra @param '${paramEntries[i].specifier ?? ''}' not in signature`
          )
        );
      }
    }

    // PARAM_ORDER: contract @param order differs from signature order
    // Skip order check if there are extra/missing params (already reported)
    if (
      sigParamNames.length === contractParamNames.length &&
      sigParamNames.every((n) => contractParamNames.includes(n))
    ) {
      let sigCursor = 0;
      let orderViolation = false;
      for (const cpName of contractParamNames) {
        const sigPos = sigParamNames.indexOf(cpName);
        if (sigPos >= 0) {
          if (sigPos < sigCursor) {
            orderViolation = true;
            break;
          }
          sigCursor = sigPos;
        }
      }
      if (orderViolation) {
        errors.push(blankError(ERR_DBC_LINT_PARAM_ORDER, '@param order does not match signature'));
      }
    }
  } else {
    // Kinds that should have no params at all
    for (let i = 0; i < paramEntries.length; i += 1) {
      errors.push(blankError(ERR_DBC_LINT_PARAM_EXTRA, `@param not applicable for kind '${kind}'`));
    }
  }
  // #endregion END_PARAM_VALIDATION

  // #region START_RETURNS_VALIDATION
  if (alwaysReturns) {
    // getter: must have @returns
    if (!returnsEntry) {
      errors.push(blankError(ERR_DBC_LINT_RETURNS_MISSING, `Missing @returns for kind '${kind}'`));
    }
  } else if (checksReturns) {
    // function / method / interface-method
    if (signature.returnType !== 'void' && !returnsEntry) {
      errors.push(
        blankError(
          ERR_DBC_LINT_RETURNS_MISSING,
          `Missing @returns for non-void return type '${signature.returnType}'`
        )
      );
    }
    if (signature.returnType === 'void' && returnsEntry) {
      errors.push(
        blankError(ERR_DBC_LINT_RETURNS_UNEXPECTED, 'Unexpected @returns for void return type')
      );
    }
  } else if (noReturns && returnsEntry) {
    // constructor / setter / field / const / type / enum / …
    errors.push(
      blankError(ERR_DBC_LINT_RETURNS_UNEXPECTED, `@returns not applicable for kind '${kind}'`)
    );
  }
  // #endregion END_RETURNS_VALIDATION

  // #region START_TYPE_REDUNDANT_CHECK
  for (const entry of entries) {
    if ((entry.type === 'param' || entry.type === 'returns') && entry.dataType) {
      errors.push(
        blankError(ERR_DBC_LINT_TYPE_REDUNDANT, `Redundant {${entry.dataType}} in @${entry.type}`)
      );
    }
  }
  // #endregion END_TYPE_REDUNDANT_CHECK

  return errors;
}

// #endregion END_DBC_CONTRACT_MATCH_VALIDATOR

// #region START_ESLINT_FORMATTER

/**
 * @purpose Format an array of errors in ESLint-compatible output.
 * @invariant Each line follows `file:line:col: severity: code: message` format.
 */
function formatErrors(errors: DbcLintError[]): string {
  return errors
    .map((e) => `${e.file}:${e.line}:${e.col}: ${e.severity}: ${e.code}: ${e.message}`)
    .join('\n');
}

// #endregion END_ESLINT_FORMATTER

// #region START_DBC_TS_LINTER

/** @purpose TypeScript adapter implementing the DbcLinter contract. | Pass 1: AST extraction. Pass 2: contract validation + signature matching. | Pass 3: ESLint report. Pass 4: autofix chain. | @implements {DbcLinter} in ../../dbc-linter.types.ts | @invariant Never throws — all errors are returned via report objects. | @invariant Error order is stable (top-to-bottom by entity position). */
export class DbcTsLinter implements DbcLinter {
  protected _parser: DbcParser;
  protected _astAdapter: DbcAstAdapter;

  /** @purpose Construct a linter with injected parser and AST adapter. | @param parser DbcParser instance for contract parsing. | @param astAdapter DbcAstAdapter instance for source file parsing. */
  constructor(parser: DbcParser, astAdapter: DbcAstAdapter) {
    this._parser = parser;
    this._astAdapter = astAdapter;
  }

  /** @see {DbcLinter#lint} in ../../dbc-linter.types.ts */
  async lint(filePath: string, options?: DbcLintOptions): Promise<DbcLintReport> {
    logger.debug(`[DbcTsLinter#lint] [idle → parsing] ${filePath}`);

    try {
      const parseResult: DbcParseResult = await this._astAdapter.parseFile(
        filePath,
        options?.content
      );

      if (!parseResult.ok) {
        const error: DbcLintError = {
          file: filePath,
          line: 1,
          col: 1,
          severity: 'error',
          code: ERR_DBC_LINT_PARSE_FAILED,
          message: parseResult.error,
        };
        logger.warn(`[DbcTsLinter#lint] [parsing → parse-failed] ${filePath}`);
        return { errors: [error], format: () => formatErrors([error]) };
      }

      const errors = this._lintEntities(parseResult.exported, filePath);

      logger.info(`[DbcTsLinter#lint] [parsing → linted] ${filePath} (${errors.length} errors)`);
      return {
        errors,
        format: () => formatErrors(errors),
      };
    } catch (cause) {
      const error = new Error(`[DbcTsLinter#lint] Lint failed for ${filePath}`, { cause });
      logger.error(`[DbcTsLinter#lint] [parsing → failed] ${filePath}`, {
        error,
      });
      const lintError: DbcLintError = {
        file: filePath,
        line: 1,
        col: 1,
        severity: 'error',
        code: ERR_DBC_LINT_PARSE_FAILED,
        message: `Unexpected error: ${String(cause)}`,
      };
      return { errors: [lintError], format: () => formatErrors([lintError]) };
    }
  }

  /** @see {DbcLinter#lintAndFix} in ../../dbc-linter.types.ts */
  async lintAndFix(filePath: string, options?: DbcLintOptions): Promise<DbcLintFixReport> {
    logger.debug(`[DbcTsLinter#lintAndFix] [idle → linting] ${filePath}`);

    try {
      // #region START_INITIAL_LINT
      const initialReport = await this.lint(filePath, options);
      const initialCount = initialReport.errors.length;
      // #endregion END_INITIAL_LINT

      // #region START_AUTOFIX_CHAIN
      const parseResult = await this._astAdapter.parseFile(filePath, options?.content);
      if (!parseResult.ok) {
        return {
          errors: initialReport.errors,
          autoFixed: 0,
          format: () => formatErrors(initialReport.errors),
        };
      }

      let source = options?.content ?? readFileSync(filePath, 'utf8');

      // Collect all contracts from entities and members for autofix
      const contractBlocks = this._collectContracts(parseResult.exported);

      // Apply autofix chain to each contract block
      let anyChanged = false;
      for (const block of contractBlocks) {
        const original = block.text;
        let fixed = original;

        // Chain step 1: remove {type} annotations
        fixed = this._removeRedundantTypes(fixed);

        // Chain step 2: remove extra @param
        fixed = this._removeExtraParams(fixed, block.signature);

        // Chain step 3: remove unexpected @returns
        fixed = this._removeUnexpectedReturns(fixed, block.kind, block.signature);

        // Chain step 4: reorder @param to match signature
        fixed = this._reorderParams(fixed, block.signature);

        // Chain step 5: reorder tags to canonical order
        fixed = this._reorderTags(fixed);

        // Chain step 6: normalize multi-line format (always, even on clean)
        fixed = this._normalizeMultiLine(fixed);

        // Chain step 7: inline if safe (dry-run)
        fixed = this._inlineIfSafe(fixed);

        if (fixed !== original) {
          source = source.replace(original, fixed);
          anyChanged = true;
        }
      }

      if (anyChanged) {
        writeFileSync(filePath, source, 'utf8');
        logger.info(`[DbcTsLinter#lintAndFix] [fixing → written] ${filePath}`);
      } else {
        logger.info(`[DbcTsLinter#lintAndFix] [linting → clean] ${filePath} (nothing to fix)`);
      }
      // #endregion END_AUTOFIX_CHAIN

      // #region START_RELINT
      // purpose: re-lint from disk (not cached content) to verify autofix result
      const finalReport = anyChanged
        ? await this.lint(filePath, { strategy: 'full' })
        : initialReport;
      const finalCount = finalReport.errors.length;
      const autoFixed = initialCount - finalCount;

      logger.info(`[DbcTsLinter#lintAndFix] [written → done] ${filePath} (autoFixed=${autoFixed})`);
      return {
        errors: finalReport.errors,
        autoFixed: autoFixed >= 0 ? autoFixed : 0,
        format: () => formatErrors(finalReport.errors),
      };
      // #endregion END_RELINT
    } catch (cause) {
      const error = new Error(`[DbcTsLinter#lintAndFix] Fix failed for ${filePath}`, { cause });
      logger.error(`[DbcTsLinter#lintAndFix] [linting → failed] ${filePath}`, { error });
      return {
        errors: [
          {
            file: filePath,
            line: 1,
            col: 1,
            severity: 'error',
            code: ERR_DBC_LINT_PARSE_FAILED,
            message: `Autofix error: ${String(cause)}`,
          },
        ],
        autoFixed: 0,
        format: () =>
          formatErrors([
            {
              file: filePath,
              line: 1,
              col: 1,
              severity: 'error',
              code: ERR_DBC_LINT_PARSE_FAILED,
              message: `Autofix error: ${String(cause)}`,
            },
          ]),
      };
    }
  }

  // #region START_LINT_HELPERS

  /** @purpose Walk all exported entities and their members, collecting lint errors. */
  protected _lintEntities(entities: DbcExportedEntity[], filePath: string): DbcLintError[] {
    const errors: DbcLintError[] = [];

    for (const entity of entities) {
      // #region START_ENTITY_CONTRACT_CHECK
      if (!entity.contract) {
        errors.push(
          blankError(
            ERR_DBC_LINT_MISSING_CONTRACT,
            `Entity '${entity.name}' (${entity.kind}) is missing a DBC contract`
          )
        );
      } else {
        const entityErrors = this._validateContract(
          entity.contract.text,
          entity.signature,
          entity.kind,
          filePath,
          entity.contract.startLine,
          entity.contract.startCol
        );
        errors.push(...entityErrors);
      }
      // #endregion END_ENTITY_CONTRACT_CHECK

      // #region START_MEMBER_CONTRACT_CHECK
      for (const member of entity.members) {
        if (!member.contract) {
          errors.push(
            blankError(
              ERR_DBC_LINT_MISSING_CONTRACT,
              `Member '${member.name}' (${member.kind}) of '${entity.name}' is missing a DBC contract`
            )
          );
        } else {
          const memberErrors = this._validateContract(
            member.contract.text,
            member.signature,
            member.kind,
            filePath,
            member.contract.startLine,
            member.contract.startCol
          );
          errors.push(...memberErrors);
        }
      }
      // #endregion END_MEMBER_CONTRACT_CHECK
    }

    // Assign file path and stable positions (entity order)
    return errors.map((e, idx) => ({
      ...e,
      file: filePath || e.file,
      line: e.line > 1 ? e.line : idx + 1,
    }));
  }

  /** @purpose Parse a contract text and validate it, returning both parser issues | (translated per FR-23) and structural mismatches via DbcContractMatchValidator. */
  protected _validateContract(
    contractText: string,
    signature: DbcSignatureInfo,
    kind: string,
    filePath: string,
    startLine: number,
    startCol: number
  ): DbcLintError[] {
    const errors: DbcLintError[] = [];

    // #region START_PARSER_VALIDATION
    const schema: DbcSchema = this._parser.parse(contractText);

    // Flatten entries to include inline entries from single-line contracts
    const flatEntries: DbcEntrySchema[] = [];
    for (const entry of schema.entries) {
      flatEntries.push(entry);
      if (entry.inline) {
        for (const ie of entry.inline) {
          flatEntries.push(ie);
        }
      }
    }

    // Translate parser issues to linter errors (FR-23) — check both flat and inline
    for (const entry of flatEntries) {
      for (const issue of entry.issues) {
        const issueLine = startLine + (issue.line ?? 1) - 1;
        errors.push({
          file: filePath,
          line: issueLine > 0 ? issueLine : startLine,
          col: startCol,
          severity: 'error',
          code: issue.code,
          message: `Parser issue in contract: ${issue.code}`,
        });
      }
    }
    // #endregion END_PARSER_VALIDATION

    // #region START_SIGNATURE_VALIDATION
    const matchErrors = validate(flatEntries, signature, kind);
    for (const me of matchErrors) {
      errors.push({
        ...me,
        file: filePath,
        line: startLine,
        col: startCol,
      });
    }
    // #endregion END_SIGNATURE_VALIDATION

    return errors;
  }

  // #endregion END_LINT_HELPERS

  // #region START_AUTOFIX_COLLECT

  /** @purpose Internal record of a contract block with context for autofix. */
  protected _ContractBlock = class {
    text: string;
    kind: string;
    signature: DbcSignatureInfo;
    constructor(text: string, kind: string, signature: DbcSignatureInfo) {
      this.text = text;
      this.kind = kind;
      this.signature = signature;
    }
  };

  /** @purpose Walk entities and members, collecting all JSDoc contract blocks | with their associated kind and signature for autofix processing. */
  protected _collectContracts(
    entities: DbcExportedEntity[]
  ): InstanceType<typeof this._ContractBlock>[] {
    const blocks: InstanceType<typeof this._ContractBlock>[] = [];

    for (const entity of entities) {
      if (entity.contract) {
        blocks.push(new this._ContractBlock(entity.contract.text, entity.kind, entity.signature));
      }
      for (const member of entity.members) {
        if (member.contract) {
          blocks.push(new this._ContractBlock(member.contract.text, member.kind, member.signature));
        }
      }
    }

    return blocks;
  }

  // #endregion END_AUTOFIX_COLLECT

  // #region START_AUTOFIX_CHAIN_METHODS

  /** @purpose Remove redundant `{dataType}` annotations from @param and @returns tags. | @param jsdocText Raw JSDoc comment text. | @returns JSDoc text with types stripped. */
  protected _removeRedundantTypes(jsdocText: string): string {
    // Remove {type} right after @param or @returns (optionally preceded by `* `):
    // `* @param {string} name` → `* @param name`
    return jsdocText.replace(/(\*?\s*)@(param|returns)\s+\{[^}]*\}\s+/g, '$1@$2 ');
  }

  /** @purpose Remove @param entries whose specifier does not match any signature parameter. | Handles both multi-line and single-line contracts. | @param jsdocText Raw JSDoc comment text. | @param signature Signature to match against. | @returns JSDoc text with extra params removed. */
  protected _removeExtraParams(jsdocText: string, signature: DbcSignatureInfo): string {
    const sigNames = new Set(signature.params.map((p) => p.name));
    const lines = jsdocText.split('\n');
    const result: string[] = [];
    let skipMode = false;

    for (const line of lines) {
      let trimmed = line.trim();
      // Never skip closing marker — always push and reset skipMode
      if (trimmed === '*/' || trimmed === '*/ ') {
        skipMode = false;
        result.push(line);
        continue;
      }
      // Strip JSDoc `* ` prefix if present
      if (trimmed.startsWith('* ')) {
        trimmed = trimmed.slice(2).trimStart();
      } else if (trimmed.startsWith('*')) {
        trimmed = trimmed.slice(1).trimStart();
      }
      // Detect start of a @param tag
      if (/^@param\s/.test(trimmed)) {
        const spec = this._extractParamSpecifier(trimmed);
        const normalized = normalizeSpecifier(spec);
        if (sigNames.has(normalized)) {
          skipMode = false;
          result.push(line);
        } else {
          // Extra param — skip this line and its continuation
          skipMode = true;
        }
      } else if (/^@\w/.test(trimmed)) {
        // Another tag — exit skip mode
        skipMode = false;
        result.push(line);
      } else if (!skipMode) {
        // Continuation line — keep only if not skipping
        result.push(line);
      }
      // When skipMode is true, continuation lines are silently dropped
    }

    return result.join('\n');
  }

  /** @purpose Remove @returns tag when the kind does not allow it or return type is void. | @param jsdocText Raw JSDoc comment text. | @param kind Entity or member kind. | @param signature Optional signature info to check void return type. | @returns JSDoc text with unexpected @returns removed. */
  protected _removeUnexpectedReturns(
    jsdocText: string,
    kind: string,
    signature?: DbcSignatureInfo
  ): string {
    // Remove if kind is in no-returns set OR (checkable kind with void return)
    const shouldRemove =
      KINDS_NO_RETURNS.has(kind) ||
      (KINDS_WITH_RETURNS_WHEN_NON_VOID.has(kind) && signature?.returnType === 'void');

    if (!shouldRemove) {
      return jsdocText;
    }

    const lines = jsdocText.split('\n');
    const result: string[] = [];
    let skipMode = false;

    for (const line of lines) {
      let trimmed = line.trim();
      // Never skip closing marker — always push and reset skipMode
      if (trimmed === '*/' || trimmed === '*/ ') {
        skipMode = false;
        result.push(line);
        continue;
      }
      // Strip JSDoc `* ` prefix if present
      if (trimmed.startsWith('* ')) {
        trimmed = trimmed.slice(2).trimStart();
      } else if (trimmed.startsWith('*')) {
        trimmed = trimmed.slice(1).trimStart();
      }
      if (/^@returns\b/.test(trimmed)) {
        skipMode = true;
      } else if (/^@\w/.test(trimmed)) {
        skipMode = false;
        result.push(line);
      } else if (!skipMode) {
        result.push(line);
      }
    }

    return result.join('\n');
  }

  /** @purpose Reorder @param entries to match the signature parameter order. | @param jsdocText Raw JSDoc comment text. | @param signature Signature with desired parameter order. | @returns JSDoc text with params reordered. */
  protected _reorderParams(jsdocText: string, signature: DbcSignatureInfo): string {
    if (signature.params.length === 0) {
      return jsdocText;
    }

    const sigOrder = signature.params.map((p) => p.name);
    const lines = jsdocText.split('\n');

    // #region START_EXTRACT_PARAM_BLOCKS
    // Extract @param blocks: each block = the @param line + its continuation lines
    type ParamBlock = { name: string; lines: string[] };
    const paramBlocks: ParamBlock[] = [];
    const preamble: string[] = [];
    const postamble: string[] = [];
    let inParams = false;
    let afterParams = false;
    let currentBlock: ParamBlock | null = null;

    for (const line of lines) {
      let trimmed = line.trim();
      // Strip JSDoc `* ` prefix if present
      if (trimmed.startsWith('* ')) {
        trimmed = trimmed.slice(2).trimStart();
      } else if (trimmed.startsWith('*')) {
        trimmed = trimmed.slice(1).trimStart();
      }

      if (!inParams && !afterParams) {
        if (/^@param\s/.test(trimmed)) {
          inParams = true;
        }
      }

      if (!inParams && !afterParams) {
        preamble.push(line);
        if (/^@param\s/.test(trimmed)) {
          inParams = true;
          const spec = this._extractParamSpecifier(trimmed);
          currentBlock = {
            name: normalizeSpecifier(spec),
            lines: [line],
          };
        }
        continue;
      }

      if (inParams) {
        if (/^@param\s/.test(trimmed)) {
          // Save previous block
          if (currentBlock) {
            paramBlocks.push(currentBlock);
          }
          const spec = this._extractParamSpecifier(trimmed);
          currentBlock = {
            name: normalizeSpecifier(spec),
            lines: [line],
          };
        } else if (/^@\w/.test(trimmed)) {
          // End of param section — another tag
          if (currentBlock) {
            paramBlocks.push(currentBlock);
            currentBlock = null;
          }
          inParams = false;
          afterParams = true;
          postamble.push(line);
        } else if (currentBlock) {
          // Continuation line
          currentBlock.lines.push(line);
        }
      } else if (afterParams) {
        postamble.push(line);
      }
    }
    if (currentBlock) {
      paramBlocks.push(currentBlock);
    }
    // #endregion END_EXTRACT_PARAM_BLOCKS

    // #region START_REORDER_BLOCKS
    // Sort param blocks to match signature order; unmatched stay at end
    const nameToBlock = new Map<string, ParamBlock>();
    for (const block of paramBlocks) {
      nameToBlock.set(block.name, block);
    }

    const reordered: ParamBlock[] = [];
    for (const sigName of sigOrder) {
      const block = nameToBlock.get(sigName);
      if (block) {
        reordered.push(block);
        nameToBlock.delete(sigName);
      }
    }
    // Append any remaining (unmatched) blocks
    for (const [, block] of nameToBlock) {
      reordered.push(block);
    }
    // #endregion END_REORDER_BLOCKS

    // #region START_REBUILD
    const rebuilt: string[] = [...preamble];
    for (const block of reordered) {
      rebuilt.push(...block.lines);
    }
    rebuilt.push(...postamble);
    return rebuilt.join('\n');
    // #endregion END_REBUILD
  }

  /** @purpose Reorder contract tags to canonical DBC order. | Order: description → purpose → implements → invariant → pre → param(*) → | throws → returns → post → sideEffect → other tags. | @param jsdocText Raw JSDoc comment text. | @returns JSDoc text with tags in canonical order. */
  protected _reorderTags(jsdocText: string): string {
    const TAG_ORDER: ReadonlyMap<string, number> = new Map([
      ['purpose', 0],
      ['implements', 1],
      ['invariant', 2],
      ['pre', 3],
      ['param', 4],
      ['throws', 5],
      ['returns', 6],
      ['post', 7],
      ['sideEffect', 8],
      ['see', 9],
      ['consumer', 9],
      ['consumers', 9],
      ['author', 9],
      ['deprecated', 9],
    ]);

    const lines = jsdocText.split('\n');

    // Extract description (lines before first @), excluding closing */
    const description: string[] = [];
    type TagBlock = { tag: string; order: number; lines: string[] };
    const tagBlocks: TagBlock[] = [];
    let currentBlock: TagBlock | null = null;
    let inTags = false;
    let closingLine: string | null = null;

    // #region START_PARSE_TAG_BLOCKS — purpose: separate description, tag blocks, and closing */
    for (const line of lines) {
      let trimmed = line.trim();
      if (trimmed === '*/' || trimmed === '*/ ') {
        closingLine = line;
        continue;
      }
      if (trimmed.startsWith('* ')) {
        trimmed = trimmed.slice(2).trimStart();
      } else if (trimmed.startsWith('*')) {
        trimmed = trimmed.slice(1).trimStart();
      }
      const tagMatch = trimmed.match(/^@(\w+)/);

      if (!inTags && !tagMatch) {
        description.push(line);
      } else if (tagMatch) {
        inTags = true;
        const tag = tagMatch[1];
        if (currentBlock) {
          tagBlocks.push(currentBlock);
        }
        currentBlock = {
          tag,
          order: TAG_ORDER.get(tag) ?? 99,
          lines: [line],
        };
      } else if (inTags && currentBlock) {
        currentBlock.lines.push(line);
      } else {
        description.push(line);
      }
    }
    if (currentBlock) {
      tagBlocks.push(currentBlock);
    }
    // #endregion END_PARSE_TAG_BLOCKS

    // #region START_SORT_AND_REBUILD — purpose: sort by canonical order, preserve relative for same-order
    const stable = tagBlocks.map((b, i) => ({ ...b, origIdx: i }));
    stable.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.origIdx - b.origIdx;
    });

    const rebuilt: string[] = [...description];
    for (const block of stable) {
      rebuilt.push(...block.lines);
    }
    if (closingLine !== null) {
      rebuilt.push(closingLine);
    }
    // #endregion END_SORT_AND_REBUILD

    return rebuilt.join('\n');
  }

  /** @purpose Normalize multi-line JSDoc format: ensure closing marker is on its own line | and opening marker is bare (no content after it). | Preserves original indentation by patching specific format issues | rather than reconstructing the entire block. | @invariant Single-line contracts pass through unchanged. | @param jsdocText Raw JSDoc comment text. | @returns Normalized JSDoc text. */
  protected _normalizeMultiLine(jsdocText: string): string {
    if (!jsdocText.includes('\n')) {
      return jsdocText;
    }

    const lines = jsdocText.split('\n');

    // Step 1: if first line has content after /**, move it to a new line
    let firstLine = lines[0];
    const openMatch = firstLine.match(/^(\s*\/\*\*)\s+(.+)/);
    if (openMatch) {
      lines[0] = openMatch[1]; // bare /**
      // Determine indent for the new line from existing content lines
      const contentIndent = this._detectContentIndent(lines);
      // Insert content as a new line after the opening
      lines.splice(1, 0, contentIndent + openMatch[2]);
    }

    // Step 2: if last line has content before */, move */ to its own line
    const lastIdx = lines.length - 1;
    const lastLine = lines[lastIdx];
    // Check if the last line has */ preceded by content (not just whitespace and */)
    const closeMatch = lastLine.match(/^(\s*)\*\s+(.+?)\s*\*\/\s*$/);
    if (closeMatch) {
      const starIndent = closeMatch[1]; // indent before * on this line
      // Keep the content line without */
      lines[lastIdx] = starIndent + '* ' + closeMatch[2];
      // */ should be at the indent level of /** (one space less than * lines)
      const baseIndent = starIndent.length > 0 ? starIndent.slice(0, -1) : '';
      lines.push(baseIndent + ' */');
    }

    return lines.join('\n');
  }

  /** @purpose Detect the indentation pattern used by content lines. | Returns the whitespace prefix before `*` on the first content line, | or the indent of the opening line as fallback. | @param lines All lines of the JSDoc block (may be mutated by Step 1). | @returns Indent string for `*`-prefixed content lines. */
  protected _detectContentIndent(lines: string[]): string {
    for (let i = 1; i < lines.length - 1; i += 1) {
      const match = lines[i].match(/^(\s*)\*\s/);
      if (match) {
        return match[1];
      }
    }
    // Fallback: use indent of opening line + one space (canonical convention)
    const openIndent = lines[0].match(/^(\s*)/)?.[1] ?? '';
    return openIndent + ' ';
  }

  /** @purpose Attempt to convert a multi-line JSDoc comment to single-line format. | Inlines only single-tag contracts (1 @tag); multi-tag contracts stay multi-line. | Performs a dry-run through the parser: if the inline version introduces new | parse errors, the original multi-line text is returned unchanged. | @param jsdocText Raw JSDoc comment text. | @returns Inline text if safe, otherwise the original text. */
  protected _inlineIfSafe(jsdocText: string): string {
    if (!jsdocText.includes('\n')) {
      return jsdocText;
    }

    // #region START_BUILD_INLINE
    const lines = jsdocText
      .replace(/^\/\*\*\s*/, '')
      .replace(/\s*\*\/\s*$/, '')
      .split('\n')
      .map((l) => l.replace(/^\s*\*\s?/, '').trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      return jsdocText;
    }

    // Only inline if the contract has exactly ONE @tag
    const tagCount = lines.filter((l) => /^@\w/.test(l)).length;
    if (tagCount > 1) {
      return jsdocText;
    }

    // Preserve original indentation
    const indentMatch = jsdocText.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '';

    const inlineText = indent + '/** ' + lines.join(' | ') + ' */';

    // Dry-run: parse inline version; if parse issues appear, keep original
    const schema: DbcSchema = this._parser.parse(inlineText);
    const hasIssues = schema.entries.some((e) => e.issues.length > 0);

    if (hasIssues) {
      return jsdocText;
    }

    return inlineText;
    // #endregion END_BUILD_INLINE
  }

  /** @purpose Extract the specifier (parameter name) from a @param tag line. | Example: `@param userId Description` → `userId` | @param line Trimmed line content starting with `@param`. | @returns The specifier or empty string. */
  protected _extractParamSpecifier(line: string): string {
    // Strip leading `@param`, optional `{type}`, and optional JSDoc `* ` prefix
    let afterTag = line.replace(/^(\*?\s*)?@param\s+/, '');
    // If there's a {type}, skip it
    const afterType = afterTag.replace(/^\{[^}]*\}\s+/, '');
    // First word is the specifier (may have `...` or `[...]`)
    const match = afterType.match(/^(\S+)/);
    return match ? match[1] : '';
  }

  // #endregion END_AUTOFIX_CHAIN_METHODS
}

// #endregion END_DBC_TS_LINTER
