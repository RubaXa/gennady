// @file: OrientCommand — CLI entry point for gennady orient: map, search, graph, specs.
// @consumers: gennady.ts
// @tasks: TSK-55

import { readFileSync, existsSync, lstatSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { logger } from '#logger';
import { DbcJsDocParser } from '../../../services/dbc/parser/implementations/jsdoc/dbc-jsdoc-parser.ts';
import type { DbcSchema } from '../../../services/dbc/parser/dbc-parser.types.ts';
import { scanFiles } from './core/scan-files.ts';
import { extractHeader } from './core/extract-header.ts';
import { buildIndex } from './core/build-index.ts';
import { queryTask } from './core/query-task.ts';
import { queryConsumer } from './core/query-consumer.ts';
import { queryKeyword } from './core/query-keyword.ts';
import { queryEntity } from './core/query-entity.ts';
import { buildGraph, buildRecursiveTree } from './core/query-graph.ts';
import { loadSpecOverview, searchSpec } from './core/query-spec.ts';
import { generateHints } from './core/hints.ts';
import { renderTree } from './render/render-tree.ts';
import { renderDetail } from './render/render-detail.ts';
import { renderFileList } from './render/render-file-list.ts';
import { renderGraph, renderRecursiveGraph } from './render/render-graph.ts';
import { renderSpecsOverview, renderSpecSearch } from './render/render-specs.ts';
import { renderSearch } from './render/render-search.ts';
import type { OrientArgs, ScannedFile, ExportedEntity } from './orient.types.ts';

import { parseOrientArgs } from './orient.types.ts';

/**
 * @purpose CLI entry point for gennady orient: routes to S1-S9 handlers based on parsed args.
 * @param rawArgs Raw process.argv array.
 * @returns Promise<void> — resolves after all console output is written.
 * @sideEffect File system: reads .ts files via scanFiles; console output via render functions.
 */
export async function run(rawArgs: string[]): Promise<void> {
  logger.debug('[OrientCommand#run] [idle → parsing]');
  const args = parseOrientArgs(rawArgs);
  const projectRoot = resolve('.');

  // #region START_SCAN_LOAD — invariant: scan files once, load headers, parse DBC
  let files: ScannedFile[];

  if (args.file.length > 0) {
    files = args.file
      .filter((p) => {
        const abs = resolve(p);
        if (!existsSync(abs) || !lstatSync(abs).isFile()) {
          console.error(`[OrientCommand#run] File not found: ${p}`);
          return false;
        }
        return true;
      })
      .map((p) => loadFile(resolve(p)));
  } else if (args.dir) {
    const absDir = resolve(args.dir);
    if (!existsSync(absDir) || !lstatSync(absDir).isDirectory()) {
      console.error(`[OrientCommand#run] Directory not found: ${args.dir}`);
      process.exit(1);
    }
    const rawFiles = scanFiles(absDir);
    files = rawFiles.map((f) => loadFile(f));
  } else {
    const rawFiles = scanFiles(projectRoot);
    files = rawFiles.map((f) => loadFile(f)).slice(0, args.maxResults);
  }
  // #endregion END_SCAN_LOAD

  if (files.length === 0) {
    console.log('No .ts files found in the project.');
    return;
  }

  logger.debug(`[OrientCommand#run] [parsing → loaded] ${files.length} file(s)`);

  // #region START_VALIDATE_CONFLICTS — invariant: conflicting flags produce error
  if (args.file.length > 0 && args.dir) {
    console.error('[OrientCommand#run] --file and --dir are mutually exclusive');
    process.exit(1);
  }
  if (args.specs && args.file.length > 0) {
    console.error('[OrientCommand#run] --specs and --file are mutually exclusive');
    process.exit(1);
  }
  if (
    args.specs &&
    (args.task.length > 0 || args.consumer.length > 0 || args.entity.length > 0 || args.graph)
  ) {
    console.error(
      '[OrientCommand#run] --specs is incompatible with --task/--consumer/--entity/--graph'
    );
    process.exit(1);
  }
  if (
    args.spec &&
    (args.file.length > 0 ||
      args.task.length > 0 ||
      args.consumer.length > 0 ||
      args.entity.length > 0 ||
      args.graph)
  ) {
    console.error(
      '[OrientCommand#run] --spec is incompatible with --file/--task/--consumer/--entity/--graph'
    );
    process.exit(1);
  }
  if (args.graph && args._.length > 0) {
    console.error('[OrientCommand#run] --graph and positional keyword are mutually exclusive');
    process.exit(1);
  }
  // #endregion END_VALIDATE_CONFLICTS

  // #region START_ROUTE_QUERY — invariant: route to correct query based on args
  if (args.file.length > 0) {
    handleS5(files, args, projectRoot);
  } else if (args.task.length > 0) {
    handleS2(files, args, projectRoot);
  } else if (args.consumer.length > 0) {
    handleS3(files, args, projectRoot);
  } else if (args.entity.length > 0) {
    handleS6(files, args, projectRoot);
  } else if (args.graph) {
    handleS7(files, args);
  } else if (args.specs) {
    handleS8(args, projectRoot);
  } else if (args.spec) {
    handleS9(args, projectRoot);
  } else if (args._.length > 0) {
    handleS4(files, args, projectRoot);
  } else {
    handleS1(files, args, projectRoot);
  }
  // #endregion END_ROUTE_QUERY
}

// #region START_HANDLE_S1 — invariant: project map with tree view
function handleS1(files: ScannedFile[], args: OrientArgs, projectRoot: string): void {
  logger.debug('[OrientCommand#run] [routing → S1] map');
  const lines = renderTree(files, projectRoot, args.depth, args.detail, args.maxResults);
  for (const line of lines) console.log(line);
  emitHints(args);
}
// #endregion END_HANDLE_S1

// #region START_HANDLE_S2 — invariant: task query with optional detail
function handleS2(files: ScannedFile[], args: OrientArgs, projectRoot: string): void {
  logger.debug('[OrientCommand#run] [routing → S2] task');
  const results = queryTask(files, args.task);
  for (const r of results) {
    if (r.files.length === 0) {
      console.log(`No files found for ${r.taskId}`);
      continue;
    }
    console.log(`${r.taskId} — ${r.files.length} file${r.files.length === 1 ? '' : 's'}:`);
    if (args.detail) {
      for (const line of renderDetail(r.files, projectRoot)) console.log(`  ${line}`);
    } else {
      for (const line of renderFileList(r.files, projectRoot)) console.log(`  ${line}`);
    }
  }
  emitHints(args);
}
// #endregion END_HANDLE_S2

// #region START_HANDLE_S3 — invariant: consumer query with grouping
function handleS3(files: ScannedFile[], args: OrientArgs, projectRoot: string): void {
  logger.debug('[OrientCommand#run] [routing → S3] consumer');
  const results = queryConsumer(files, args.consumer, args.fuzzy);
  for (const r of results) {
    if (r.files.length === 0) {
      console.log(`"${r.consumerName}" not found as consumer`);
      continue;
    }
    console.log(
      `"${r.consumerName}" referenced as consumer by ${r.files.length} file${r.files.length === 1 ? '' : 's'}:`
    );
    if (args.detail) {
      for (const line of renderDetail(r.files, projectRoot)) console.log(`  ${line}`);
    } else {
      for (const line of renderFileList(r.files, projectRoot)) console.log(`  ${line}`);
    }
  }
  emitHints(args);
}
// #endregion END_HANDLE_S3

// #region START_HANDLE_S4 — invariant: keyword search with scoring
function handleS4(files: ScannedFile[], args: OrientArgs, projectRoot: string): void {
  const query = args._.join(' ').trim();
  if (!query) {
    handleS1(files, args, projectRoot);
    return;
  }

  logger.debug(`[OrientCommand#run] [routing → S4] keyword "${query}"`);
  const index = buildIndex(files);
  const matches = queryKeyword(files, index, query);

  if (matches.length === 0) {
    console.log(`"${query}" not found`);
    emitHints(args);
    return;
  }

  console.log(`"${query}" found in ${matches.length} file${matches.length === 1 ? '' : 's'}:`);
  if (args.detail) {
    const detailFiles = matches.map((m) => m.file);
    for (const line of renderDetail(detailFiles, projectRoot)) console.log(`  ${line}`);
  } else {
    for (const line of renderSearch(matches, projectRoot)) console.log(`  ${line}`);
  }
  emitHints(args);
}
// #endregion END_HANDLE_S4

// #region START_HANDLE_S5 — invariant: detailed file view
function handleS5(files: ScannedFile[], args: OrientArgs, projectRoot: string): void {
  logger.debug('[OrientCommand#run] [routing → S5] detail');

  if (files.length === 0) {
    console.error('[OrientCommand#run] No valid files to display');
    process.exit(1);
  }

  for (const line of renderDetail(files, projectRoot)) console.log(line);
  emitHints(args);
}
// #endregion END_HANDLE_S5

// #region START_HANDLE_S6 — invariant: entity search
function handleS6(files: ScannedFile[], args: OrientArgs, projectRoot: string): void {
  logger.debug('[OrientCommand#run] [routing → S6] entity');
  const results = queryEntity(files, args.entity, args.fuzzy);

  for (const name of args.entity) {
    const matches = results.filter((r) => r.name === name || (args.fuzzy && r.fuzzy));
    if (matches.length === 0) {
      console.log(`"${name}" not found`);
      continue;
    }
    const fileSet = new Set(matches.map((m) => m.filePath));
    console.log(`"${name}" found in ${fileSet.size} file${fileSet.size === 1 ? '' : 's'}:`);
    for (const fp of fileSet) {
      const relPath = relative(projectRoot, fp);
      console.log(`  ${relPath}`);
      const fileMatches = matches.filter((m) => m.filePath === fp);
      for (const m of fileMatches) {
        const purposeEntry = m.contract.entries.find(
          (e) => e.type === 'purpose' || e.type === 'description'
        );
        if (purposeEntry) {
          console.log(`    ${m.name}: ${m.kind} — ${purposeEntry.value}`);
        } else {
          console.log(`    ${m.name}: ${m.kind}`);
        }
        const implEntry = m.contract.entries.find((e) => e.type === 'implements');
        if (implEntry) {
          console.log(`      @implements ${implEntry.specifier ?? implEntry.value}`);
        }
      }
    }
  }
  emitHints(args);
}
// #endregion END_HANDLE_S6

// #region START_HANDLE_S7 — invariant: architecture graph
function handleS7(files: ScannedFile[], args: OrientArgs): void {
  logger.debug('[OrientCommand#run] [routing → S7] graph');
  const graph = buildGraph(files);

  if (args.recursive) {
    const roots = [...graph.keys()].filter((name) => {
      const node = graph.get(name);
      return node && !node.unresolved;
    });
    for (const root of roots) {
      const treeLines = buildRecursiveTree(graph, root, args.depth);
      for (const line of renderRecursiveGraph(treeLines)) console.log(line);
    }
  } else {
    for (const line of renderGraph(graph)) console.log(line);
  }
  emitHints(args);
}
// #endregion END_HANDLE_S7

// #region START_HANDLE_S8 — invariant: specs overview
function handleS8(args: OrientArgs, projectRoot: string): void {
  logger.debug('[OrientCommand#run] [routing → S8] specs overview');
  const overviews = loadSpecOverview(projectRoot);
  for (const line of renderSpecsOverview(overviews)) console.log(line);
  emitHints(args);
}
// #endregion END_HANDLE_S8

// #region START_HANDLE_S9 — invariant: spec search
function handleS9(args: OrientArgs, projectRoot: string): void {
  logger.debug(`[OrientCommand#run] [routing → S9] spec "${args.spec}"`);
  const result = searchSpec(projectRoot, args.spec);
  if (!result) {
    console.error(`spec "${args.spec}" not found. Use orient --specs for available specs.`);
    process.exit(1);
  }
  for (const line of renderSpecSearch(result)) console.log(line);
  emitHints(args);
}
// #endregion END_HANDLE_S9

function emitHints(args: OrientArgs): void {
  console.log('');
  console.log('Hints:');
  const hints = generateHints(args);
  for (const hint of hints) console.log(`  ${hint}`);
}

/**
 * @purpose Load a single .ts file: read, extract header, parse DBC, extract entities.
 * @param absPath Absolute file path.
 * @returns ScannedFile with header, exports, and path.
 */
function loadFile(absPath: string): ScannedFile {
  let content: string;
  try {
    content = readFileSync(absPath, 'utf-8');
  } catch {
    return { absPath, header: { file: '', tasks: [], consumers: [] }, exports: [] };
  }

  const header = extractHeader(content);
  const exports = extractEntities(content);
  return { absPath, header, exports };
}

/**
 * @purpose Extract exported entities and their JSDoc contracts from TypeScript source.
 * @invariant Only exports at the module level are detected.
 * @invariant Method declarations inside classes are NOT included.
 * @param content Raw TypeScript source content.
 * @returns Array of ExportedEntity with name, kind, and DBC contract.
 */
function extractEntities(content: string): ExportedEntity[] {
  const entities: ExportedEntity[] = [];
  const parser = new DbcJsDocParser();

  const exportRegex =
    /((?:\/\*\*[\s\S]*?\*\/\s*))?export\s+(class|function|const|type|interface|enum)\s+(\w+)/g;
  let match: RegExpExecArray | null;

  while ((match = exportRegex.exec(content)) !== null) {
    const jsdocBlock = match[1]?.trim() ?? '';
    const kind = match[2] as ExportedEntity['kind'];
    const name = match[3];

    let contract: DbcSchema;
    let rawJsdoc = '';

    if (jsdocBlock) {
      rawJsdoc = jsdocBlock;
      contract = parser.parse(jsdocBlock);
    } else {
      contract = { entries: [], format: 'single-line' };
    }

    entities.push({ name, kind, contract, rawJsdoc });
  }

  return entities;
}

// Self-executing for CLI: gennady orient <args>
await run(process.argv);
