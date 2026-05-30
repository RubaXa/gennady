// @file: Shared types for the orient command — file scans, headers, query results, render data.
// @consumers: OrientCommand
// @tasks: TSK-55

import type { DbcSchema } from '../../../services/dbc/parser/dbc-parser.types.ts';

/** @purpose Parsed file header tags extracted from top-of-file // @tag: comments. */
export type FileHeader = {
  /** @purpose Value of // @file: directive */
  file: string;
  /** @purpose Task IDs from // @tasks: directive */
  tasks: string[];
  /** @purpose Consumer names from // @consumers: directive */
  consumers: string[];
};

/** @purpose Single exported entity with its JSDoc contract and source location. */
export type ExportedEntity = {
  /** @purpose Entity name (function name, class name, type name, const name) */
  name: string;
  /** @purpose Entity kind — class, function, const, type, interface, enum */
  kind: 'class' | 'function' | 'const' | 'type' | 'interface' | 'enum';
  /** @purpose Parsed DBC contract schema from JSDoc */
  contract: DbcSchema;
  /** @purpose Raw JSDoc text block */
  rawJsdoc: string;
};

/** @purpose A file scanned by orient with its header, exports, and path. */
export type ScannedFile = {
  /** @purpose Absolute path to the file */
  absPath: string;
  /** @purpose Parsed file header */
  header: FileHeader;
  /** @purpose Exported entities with DBC contracts */
  exports: ExportedEntity[];
};

/** @purpose Reference from a word in @file:/@purpose back to a file and optional entity. */
export type FileWordRef = {
  /** @purpose Absolute file path */
  file: string;
  /** @purpose Source tag — 'file' (@file:) or 'entity' (@purpose) */
  source: 'file' | 'entity';
  /** @purpose Entity name when source is 'entity' */
  entity?: string;
};

/** @purpose CLI argument bundle parsed from raw args. */
export type OrientArgs = {
  /** @purpose Positional arguments (keywords for S4 search) */
  _: string[];
  /** @purpose File paths for S5 detailed view (repeatable) */
  file: string[];
  /** @purpose Directory to limit scanning scope */
  dir: string;
  /** @purpose Task IDs for S2 file lookup (repeatable) */
  task: string[];
  /** @purpose Consumer names for S3 lookup (repeatable) */
  consumer: string[];
  /** @purpose Entity names for S6 search (repeatable) */
  entity: string[];
  /** @purpose Trigger S7 dependency graph mode */
  graph: boolean;
  /** @purpose Expand graph recursively */
  recursive: boolean;
  /** @purpose Trigger S8 specs overview mode */
  specs: boolean;
  /** @purpose Specific spec name for S9 search */
  spec: string;
  /** @purpose Include DBC contract details in output */
  detail: boolean;
  /** @purpose Enable fuzzy matching for --entity and --consumer */
  fuzzy: boolean;
  /** @purpose Maximum tree or graph depth */
  depth: number;
  /** @purpose Maximum files shown before overflow indicator */
  maxResults: number;
};

/** @purpose Query result from a task search (S2). */
export type TaskQueryResult = {
  /** @purpose Task ID that was searched */
  taskId: string;
  /** @purpose Matching files */
  files: ScannedFile[];
};

/** @purpose Query result from a consumer search (S3). */
export type ConsumerQueryResult = {
  /** @purpose Consumer name that was searched */
  consumerName: string;
  /** @purpose Matching files */
  files: ScannedFile[];
};

/** @purpose Single keyword match with score for ranking. */
export type KeywordMatch = {
  /** @purpose File reference */
  file: ScannedFile;
  /** @purpose Match score — higher = more relevant */
  score: number;
  /** @purpose Matched entity name when match is in @purpose */
  entityName?: string;
};

/** @purpose Entity search match. */
export type EntityMatch = {
  /** @purpose Entity name */
  name: string;
  /** @purpose Entity kind */
  kind: string;
  /** @purpose File where found */
  filePath: string;
  /** @purpose DBC contract entries */
  contract: DbcSchema;
  /** @purpose Whether match was fuzzy */
  fuzzy: boolean;
  /** @purpose DL distance when fuzzy */
  distance?: number;
};

/** @purpose Consumer dependency edge in the architecture graph. */
export type GraphNode = {
  /** @purpose Consumer name */
  consumer: string;
  /** @purpose Files that declare this consumer */
  files: string[];
  /** @purpose Consumer nodes that consume THIS consumer (reverse — who depends on this) */
  consumedBy: string[];
  /** @purpose Is this consumer unresolved (not matching a real file)? */
  unresolved: boolean;
};

/** @purpose Spec overview entry for S8/S9. */
export type SpecOverview = {
  /** @purpose Spec file path */
  specPath: string;
  /** @purpose Task IDs referenced by this spec's tasks */
  taskIds: string[];
  /** @purpose Whether this is a library-level spec (no own tasks, has sub-specs) */
  isLibraryLevel: boolean;
  /** @purpose Sub-spec paths for library-level specs */
  subSpecs: string[];
};

// #region START_PARSE_ORIENT_ARGS — invariant: extract flags from raw args into typed OrientArgs
/**
 * @purpose Parse raw CLI args into a typed OrientArgs struct.
 * @param rawArgs Raw process.argv array.
 * @returns Fully populated OrientArgs with defaults.
 */
export function parseOrientArgs(rawArgs: string[]): OrientArgs {
  const args: OrientArgs = {
    _: [],
    file: [],
    dir: '',
    task: [],
    consumer: [],
    entity: [],
    graph: false,
    recursive: false,
    specs: false,
    spec: '',
    detail: false,
    fuzzy: false,
    depth: Infinity,
    maxResults: Infinity,
  };

  for (let i = 2; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (a === '--file') {
      args.file.push(rawArgs[++i] ?? '');
    } else if (a.startsWith('--file=')) {
      args.file.push(a.slice(7));
    } else if (a === '--dir') {
      args.dir = rawArgs[++i] ?? '';
    } else if (a.startsWith('--dir=')) {
      args.dir = a.slice(6);
    } else if (a === '--task') {
      args.task.push(rawArgs[++i] ?? '');
    } else if (a.startsWith('--task=')) {
      args.task.push(a.slice(7));
    } else if (a === '--consumer') {
      args.consumer.push(rawArgs[++i] ?? '');
    } else if (a.startsWith('--consumer=')) {
      args.consumer.push(a.slice(11));
    } else if (a === '--entity') {
      args.entity.push(rawArgs[++i] ?? '');
    } else if (a.startsWith('--entity=')) {
      args.entity.push(a.slice(9));
    } else if (a === '--graph') {
      args.graph = true;
    } else if (a === '--recursive') {
      args.recursive = true;
    } else if (a === '--specs') {
      args.specs = true;
    } else if (a === '--spec') {
      args.spec = rawArgs[++i] ?? '';
    } else if (a.startsWith('--spec=')) {
      args.spec = a.slice(7);
    } else if (a === '--detail') {
      args.detail = true;
    } else if (a === '--fuzzy') {
      args.fuzzy = true;
    } else if (a === '--depth') {
      args.depth = parseInt(rawArgs[++i] ?? '', 10) || Infinity;
    } else if (a.startsWith('--depth=')) {
      args.depth = parseInt(a.slice(8), 10) || Infinity;
    } else if (a === '--max-results') {
      args.maxResults = parseInt(rawArgs[++i] ?? '', 10) || Infinity;
    } else if (a.startsWith('--max-results=')) {
      args.maxResults = parseInt(a.slice(14), 10) || Infinity;
    } else if (a && !a.startsWith('-') && a !== 'orient') {
      args._.push(a);
    }
  }
  return args;
}
// #endregion END_PARSE_ORIENT_ARGS
