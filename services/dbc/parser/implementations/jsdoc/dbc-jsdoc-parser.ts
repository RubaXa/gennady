// @file: JSDoc implementation of the DbcParser contract.
// @consumers: DbcSchema consumers (analysis, generation, verification, documentation, agent processing)
// @tasks: TSK-02

import {
  ERR_DBC_ORDER,
  ERR_DBC_PARAM_NAME_MISSING,
  ERR_DBC_PURPOSE_CONFLICT,
  ERR_DBC_SEE_FORMAT_INVALID,
  type DbcEntrySchema,
  type DbcIssueCode,
  type DbcParser,
  type DbcSchema,
  type DbcSchemaFormat,
} from '../../dbc-parser.types.ts';

type ParsedEntryWithLine = DbcEntrySchema & { line: number };

const CONTRACT_ORDER = [
  'implements',
  'invariant',
  'pre',
  'param',
  'throws',
  'returns',
  'post',
  'sideEffect',
] as const;

const CONTRACT_ORDER_INDEX = new Map<string, number>(
  CONTRACT_ORDER.map((type, index) => [type, index])
);

/**
 * @purpose Parses JSDoc-like contract blocks into a universal DBC schema and validates contract rules.
 * @implements {DbcParser} in ../../dbc-parser.types.ts
 * @invariant Input is handled line-by-line with explicit support for leading `*` markers.
 */
export class DbcJsDocParser implements DbcParser {
  /** @see {DbcParser#parse} in ../../dbc-parser.types.ts */
  parse(inputContract: string): DbcSchema {
    const entries: ParsedEntryWithLine[] = [];
    const raw = inputContract.trim();
    let content = raw;
    if (content.startsWith('/**')) content = content.slice(3);
    if (content.endsWith('*/')) content = content.slice(0, -2);
    content = content.trim();
    const format: DbcSchemaFormat = content.includes('\n') ? 'multi-line' : 'single-line';
    const lines = inputContract.split(/\r?\n/u);

    let activeEntry: ParsedEntryWithLine | undefined;
    let hasSeenTag = false;
    const descriptionBuffer: string[] = [];

    for (let index = 0; index < lines.length; index += 1) {
      const lineNumber = index + 1;
      const normalized = this.normalizeLine(lines[index] ?? '');

      if (normalized.length === 0) {
        continue;
      }

      if (normalized.startsWith('@')) {
        if (!hasSeenTag && descriptionBuffer.length > 0) {
          entries.push({
            type: 'description',
            value: descriptionBuffer.join('\n'),
            issues: [],
            line: 1,
          });
          descriptionBuffer.length = 0;
        }

        hasSeenTag = true;
        const parsedTag = this.parseTagLine(normalized, lineNumber);
        if (!parsedTag) {
          continue;
        }

        entries.push(parsedTag);
        activeEntry = parsedTag;
        continue;
      }

      if (!hasSeenTag) {
        descriptionBuffer.push(normalized);
        continue;
      }

      if (!activeEntry) {
        continue;
      }

      activeEntry.value =
        activeEntry.value.length > 0 ? `${activeEntry.value}\n${normalized}` : normalized;
    }

    if (!hasSeenTag && descriptionBuffer.length > 0) {
      entries.push({
        type: 'description',
        value: descriptionBuffer.join('\n'),
        issues: [],
        line: 1,
      });
    }

    this.validatePurposeConflict(entries);
    this.validateContractOrder(entries);
    this.validateParamSpecifier(entries);
    this.validateSeeSpecifier(entries);

    let inlineEntriesForFirst: ParsedEntryWithLine[] | undefined;

    if (format === 'single-line' && entries.length > 0) {
      const firstEntry = entries[0];
      if (firstEntry && firstEntry.value.includes(' | @')) {
        const parts = firstEntry.value.split(' | @');
        firstEntry.value = (parts[0] ?? '').trim();
        const inlineList: ParsedEntryWithLine[] = [];
        for (let i = 1; i < parts.length; i += 1) {
          const tagLine = `@${parts[i] ?? ''}`;
          const parsed = this.parseTagLine(tagLine, firstEntry.line);
          if (parsed) {
            inlineList.push(parsed);
          }
        }
        if (inlineList.length > 0) {
          inlineEntriesForFirst = inlineList;
        }
      }
    }

    return {
      entries: entries.map(({ line: _line, ...entry }, idx) => {
        if (idx === 0 && inlineEntriesForFirst) {
          return {
            ...entry,
            inline: inlineEntriesForFirst.map(({ line: _, ...e }) => e),
          };
        }
        return entry;
      }),
      format,
    };
  }

  /**
   * @purpose Normalizes a raw source line by stripping JSDoc framing tokens and edge whitespace.
   * @param sourceLine Raw line from the input contract.
   * @returns Line prepared for tag and multiline-value parsing.
   */
  protected normalizeLine(sourceLine: string): string {
    let line = sourceLine.trimStart();
    if (line.startsWith('*/')) {
      return '';
    }

    if (line.startsWith('/**')) {
      line = line.slice(3);
    }

    line = line.trimStart();

    if (line.startsWith('*')) {
      line = line.slice(1).trimStart();
    }

    if (line.endsWith('*/')) {
      line = line.slice(0, -2).trimEnd();
    }

    return line.trim();
  }

  /**
   * @purpose Parses a normalized tag line into an entry object with a source line reference.
   * @param tagLine Normalized line starting with `@`.
   * @param line One-based source line number.
   * @returns Parsed entry or undefined when the tag name is missing.
   */
  protected parseTagLine(tagLine: string, line: number): ParsedEntryWithLine | undefined {
    const match = /^@(\S+)(?:\s+([\s\S]*))?$/u.exec(tagLine);
    if (!match) {
      return undefined;
    }

    const type = match[1]?.trim();
    if (!type) {
      return undefined;
    }

    const tail = (match[2] ?? '').trim();

    if (type === 'param') {
      return this.parseParamTag(type, tail, line);
    }

    if (type === 'see') {
      return this.parseSeeTag(type, tail, line);
    }

    if (type === 'implements') {
      return this.parseImplementsTag(type, tail, line);
    }

    if (type === 'returns' || type === 'throws') {
      return this.parseTagWithOptionalDataType(type, tail, line);
    }

    if (type === 'description') {
      return {
        type: 'description',
        value: tail,
        issues: [],
        line,
      };
    }

    return {
      type,
      value: tail,
      issues: [],
      line,
    };
  }

  /**
   * @purpose Parses tags where `{dataType}` is optional and the remainder is a plain value.
   * @param type Tag type.
   * @param tail Content after the tag name.
   * @param line One-based source line number.
   * @returns Parsed entry.
   */
  protected parseTagWithOptionalDataType(
    type: string,
    tail: string,
    line: number
  ): ParsedEntryWithLine {
    const dataTypeMatch = /^\{([^}]+)\}\s*(.*)$/u.exec(tail);
    if (!dataTypeMatch) {
      return {
        type,
        value: tail,
        issues: [],
        line,
      };
    }

    return {
      type,
      dataType: dataTypeMatch[1]?.trim(),
      value: (dataTypeMatch[2] ?? '').trim(),
      issues: [],
      line,
    };
  }

  /**
   * @purpose Parses `@param` into `dataType`, optional `specifier`, `optional`, and value fields.
   * @param type Tag type.
   * @param tail Content after `@param`.
   * @param line One-based source line number.
   * @returns Parsed entry.
   */
  protected parseParamTag(type: string, tail: string, line: number): ParsedEntryWithLine {
    const result: ParsedEntryWithLine = {
      type,
      value: '',
      issues: [],
      line,
    };

    let rest = tail;
    const dataTypeMatch = /^\{([^}]+)\}\s*(.*)$/u.exec(rest);
    if (dataTypeMatch) {
      result.dataType = dataTypeMatch[1]?.trim();
      rest = (dataTypeMatch[2] ?? '').trim();
    }

    if (rest.length === 0) {
      return result;
    }

    const specifierMatch = /^(\[[^\]]+\]|\S+)(?:\s+([\s\S]*))?$/u.exec(rest);
    if (!specifierMatch) {
      result.value = rest;
      return result;
    }

    const rawSpecifier = specifierMatch[1] ?? '';
    if (rawSpecifier.startsWith('[') && rawSpecifier.endsWith(']')) {
      result.optional = true;
      result.specifier = rawSpecifier.slice(1, -1).trim();
    } else {
      result.specifier = rawSpecifier.trim();
    }

    result.value = (specifierMatch[2] ?? '').trim();
    return result;
  }

  /**
   * @purpose Parses `@see` into required `{specifier}` and optional trailing value.
   * @param type Tag type.
   * @param tail Content after `@see`.
   * @param line One-based source line number.
   * @returns Parsed entry.
   */
  protected parseSeeTag(type: string, tail: string, line: number): ParsedEntryWithLine {
    const result: ParsedEntryWithLine = {
      type,
      value: '',
      issues: [],
      line,
    };

    const seeMatch = /^\{([^}]+)\}\s*(.*)$/u.exec(tail);
    if (!seeMatch) {
      result.value = tail;
      return result;
    }

    result.specifier = seeMatch[1]?.trim();
    result.value = (seeMatch[2] ?? '').trim();
    return result;
  }

  /**
   * @purpose Parses `@implements` into required `{ContractName}` and optional trailing value.
   * @param type Tag type.
   * @param tail Content after `@implements`.
   * @param line One-based source line number.
   * @returns Parsed entry.
   */
  protected parseImplementsTag(type: string, tail: string, line: number): ParsedEntryWithLine {
    const result: ParsedEntryWithLine = {
      type,
      value: '',
      issues: [],
      line,
    };

    const match = /^\{([^}]+)\}\s*(.*)$/u.exec(tail);
    if (!match) {
      result.value = tail;
      return result;
    }

    result.specifier = match[1]?.trim();
    result.value = (match[2] ?? '').trim();
    return result;
  }

  /**
   * @purpose Emits a conflict issue when `purpose` and `see` are both present in the parsed entries.
   * @param entries Parsed entries with source lines.
   */
  protected validatePurposeConflict(entries: ParsedEntryWithLine[]): void {
    let hasPurpose = false;
    let hasSee = false;

    for (const entry of entries) {
      if (entry.type === 'purpose') {
        if (hasSee) {
          this.attachIssue(entry, ERR_DBC_PURPOSE_CONFLICT);
        }
        hasPurpose = true;
        continue;
      }
      if (entry.type === 'see') {
        if (hasPurpose) {
          this.attachIssue(entry, ERR_DBC_PURPOSE_CONFLICT);
        }
        hasSee = true;
      }
    }
  }

  /**
   * @purpose Verifies that contract tags follow the strict sequence required by the DBC standard.
   * @param entries Parsed entries with source lines.
   */
  protected validateContractOrder(entries: ParsedEntryWithLine[]): void {
    let maxSeenOrderIndex = -1;

    for (const entry of entries) {
      const entryOrderIndex = CONTRACT_ORDER_INDEX.get(entry.type);
      if (entryOrderIndex === undefined) {
        continue;
      }

      if (entryOrderIndex < maxSeenOrderIndex) {
        this.attachIssue(entry, ERR_DBC_ORDER);
      }

      maxSeenOrderIndex = Math.max(maxSeenOrderIndex, entryOrderIndex);
    }
  }

  /**
   * @purpose Emits missing-parameter-name issues for `@param` entries without a non-empty specifier.
   * @param entries Parsed entries with source lines.
   */
  protected validateParamSpecifier(entries: ParsedEntryWithLine[]): void {
    for (const entry of entries) {
      if (entry.type !== 'param') {
        continue;
      }

      if (!entry.specifier || entry.specifier.trim().length === 0) {
        this.attachIssue(entry, ERR_DBC_PARAM_NAME_MISSING);
      }
    }
  }

  /**
   * @purpose Emits invalid-see-format issues for `@see` entries without a non-empty specifier.
   * @param entries Parsed entries with source lines.
   */
  protected validateSeeSpecifier(entries: ParsedEntryWithLine[]): void {
    for (const entry of entries) {
      if (entry.type !== 'see') {
        continue;
      }

      if (!entry.specifier || entry.specifier.trim().length === 0) {
        this.attachIssue(entry, ERR_DBC_SEE_FORMAT_INVALID);
      }
    }
  }

  /**
   * @purpose Adds an issue to a specific entry and preserves the entry start line in diagnostics.
   * @param entry Parsed entry with source line.
   * @param code Stable parser issue code.
   */
  protected attachIssue(entry: ParsedEntryWithLine, code: DbcIssueCode): void {
    entry.issues.push({
      code,
      line: entry.line,
    });
  }
}
